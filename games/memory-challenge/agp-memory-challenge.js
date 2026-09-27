/**
 * AGP MEMORY CHALLENGE (تحدي الذاكرة) — a native game built into the
 * platform, same structure as games/elimination-roulette.
 *
 * How it plays: every round a grid of emojis shows for a few seconds,
 * then every square flips over to show only its number. A question asks
 * where one of the emojis was; every still-alive player types the
 * square's number in the stream chat (the first answer counts). Wrong or
 * missing answers are eliminated; if nobody answers correctly, nobody is
 * eliminated that round. Round 1 starts with 3 boxes and every round adds
 * one more box (round N has N + 2 boxes).
 *
 * End of match: at most MAX_ROUNDS (10) rounds, or earlier the moment
 * only one player is left. If more than one player is still alive after
 * the last round, they ALL win (the winner screen shows one card per
 * winner).
 *
 * Design:
 *  - Play screen: the Memory Challenge design handoff (dark #0B0816,
 *    Readex Pro, violet accent), ported from its React/dc template to
 *    plain DOM here.
 *  - Settings screen, lobby, in-match settings drawer, "add new player"
 *    window, connecting layer and winner screen: the exact same design as
 *    Elimination Roulette (its CSS and enhancement functions copied into
 *    this file with an "mc-" prefix instead of "er-"). Nothing in the
 *    shared js/agp-game-shell.js or in any other game is modified.
 *
 * Points: the same shared general system (window.AGPAuth.reportRoundCompletion),
 * every winner reported with won:true.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'memory-challenge';
    var GAME_NAME = 'تحدي الذاكرة';
    var MAX_ROUNDS = 10;

    // Same platform accent values Elimination Roulette uses for its
    // settings/lobby/winner CSS (copied below).
    var C_ACCENT = '#7c3aed';
    var C_ACCENT2 = '#00c2ff';
    var C_PINK = '#ff4dff';

    // Play-screen palette — from the Memory Challenge design handoff
    // ("ayman" theme).
    var ACC = '#8B5CF6';
    var INK = '#FFFFFF';
    var ACC_DARK = 'color-mix(in oklch, ' + ACC + ' 55%, #000)';

    var EMOJIS = ['🍕','🍔','🌮','🍩','🍉','🍓','🍌','🍇','🍒','🥑','🌶️','🥕','🌽','🍄','🧀','🥐','🍿','🧁','🍭','☕','🐶','🐱','🦊','🐼','🐸','🐵','🦁','🐯','🐨','🐰','🐙','🦋','🐢','🦄','🐝','🦀','🐧','🦉','🐳','🦈','⚽','🏀','🎾','🎱','🎲','🎯','🎸','🎧','🎮','🧩','🚗','🚀','✈️','🚲','⛵','🚁','🌙','⭐','🔥','❄️','🌈','⚡','🌵','🌻','🌴','🍁','💎','🎁','🔑','💡','📱','⌚','👑','🎩','🕶️','🧲','🎈','🔔','✂️','🧸'];
    // Boxes per round: 3 in round 1, then one more box every round.
    var START_BOXES = 3;
    function boxesForRound(round) { return START_BOXES + (round - 1); }
    // Columns x rows used to lay out N boxes (an incomplete last row is
    // centered — see #mc-grid). Past the table: a near-square layout.
    var LAYOUTS = { 3: [3, 1], 4: [2, 2], 5: [3, 2], 6: [3, 2], 7: [4, 2], 8: [4, 2], 9: [3, 3], 10: [5, 2], 11: [4, 3], 12: [4, 3] };
    function layoutFor(n) {
        if (LAYOUTS[n]) return LAYOUTS[n];
        var cols = Math.ceil(Math.sqrt(n));
        return [cols, Math.ceil(n / cols)];
    }
    var QS = [['وين كان', '؟'], ['وش رقم مربع', '؟'], ['تحت أي رقم يختبي', '؟']];
    var LABELS = { idle: 'بالانتظار', memorize: 'احفظ', question: 'جاوب الحين', reveal: 'النتيجة', over: 'انتهت' };

    var MEM_TIME_OPTIONS = [5, 10, 15, 20].map(function (s) { return { label: s + 'ث', value: s }; });
    var ANSWER_TIME_OPTIONS = [10, 15, 20, 30].map(function (s) { return { label: s + 'ث', value: s }; });

    /* ======================================================================
     *  1) Sounds — synthesized with Web Audio (from the design handoff's Sfx)
     * ==================================================================== */
    function currentVolume() {
        var settings = AGP.gameShell && AGP.gameShell.getSettings ? AGP.gameShell.getSettings() : {};
        var v = settings.soundVolume;
        if (v === undefined || v === null || isNaN(v)) v = 6;
        return Math.max(0, Math.min(10, v)) / 10;
    }

    function stepFor(n) { return Math.min(0.12, 2.0 / n); }

    var Sfx = {
        ac: null,
        out: null,
        muted: false,
        ctx: function () {
            if (!this.ac) {
                var A = window.AudioContext || window.webkitAudioContext;
                if (!A) return null;
                try { this.ac = new A(); } catch (e) { return null; }
                this.out = this.ac.createGain();
                this.out.connect(this.ac.destination);
            }
            if (this.ac.state === 'suspended') this.ac.resume();
            this.out.gain.value = this.muted ? 0 : currentVolume();
            return this.ac;
        },
        // Never touches the audio system at all while muted/volume 0 (same
        // iOS reasoning as Elimination Roulette's playSound()).
        silent: function () { return this.muted || currentVolume() <= 0; },
        tone: function (f, d, o) {
            o = o || {};
            if (this.silent()) return;
            var ac = this.ctx(); if (!ac) return;
            var t = ac.currentTime + (o.at || 0), osc = ac.createOscillator(), g = ac.createGain();
            osc.type = o.type || 'sine';
            osc.frequency.setValueAtTime(f, t);
            if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + d);
            var v = o.vol != null ? o.vol : 0.2;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(v, t + (o.a || 0.008));
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            osc.connect(g); g.connect(this.out); osc.start(t); osc.stop(t + d + 0.05);
        },
        noise: function (d, o) {
            o = o || {};
            if (this.silent()) return;
            var ac = this.ctx(); if (!ac) return;
            var t = ac.currentTime + (o.at || 0), len = Math.floor(ac.sampleRate * d);
            var b = ac.createBuffer(1, len, ac.sampleRate), ch = b.getChannelData(0);
            for (var i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
            var src = ac.createBufferSource(); src.buffer = b;
            var f = ac.createBiquadFilter(); f.type = 'bandpass';
            f.frequency.setValueAtTime(o.f || 1200, t);
            if (o.fto) f.frequency.exponentialRampToValueAtTime(o.fto, t + d);
            f.Q.value = o.q || 0.8;
            var g = ac.createGain(), v = o.vol != null ? o.vol : 0.12;
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(v, t + d * 0.3);
            g.gain.exponentialRampToValueAtTime(0.0001, t + d);
            src.connect(f); f.connect(g); g.connect(this.out); src.start(t); src.stop(t + d + 0.05);
        },
        play: function (name, n) {
            n = n || 0;
            var self = this;
            var T = function (f, d, o) { self.tone(f, d, o); };
            var i, s;
            switch (name) {
                case 'click': T(620, 0.07, { type: 'triangle', vol: 0.14 }); break;
                case 'start': [523, 659, 784, 1047].forEach(function (f, k) { T(f, 0.2, { at: k * 0.07, type: 'triangle', vol: 0.16 }); }); break;
                case 'pops':
                    s = stepFor(n);
                    for (i = 0; i < n; i++) {
                        T(520 + (i % 6) * 60, 0.09, { at: 0.2 + i * s, type: 'triangle', to: 1150 + (i % 6) * 80, vol: 0.12 });
                        self.noise(0.08, { f: 3000, vol: 0.03, at: 0.17 + i * s });
                    }
                    break;
                case 'cover':
                    s = stepFor(n);
                    for (i = 0; i < n; i++) {
                        T(340 - (i % 6) * 15, 0.1, { at: 0.18 + i * s, type: 'triangle', to: 110, vol: 0.14 });
                        self.noise(0.07, { f: 900, vol: 0.04, at: 0.16 + i * s });
                    }
                    T(660, 0.14, { at: n * s + 0.5, type: 'triangle', vol: 0.18 });
                    T(990, 0.22, { at: n * s + 0.6, type: 'triangle', vol: 0.18 });
                    break;
                case 'tick': T(n ? 1320 : 880, 0.06, { type: 'square', vol: 0.05 }); break;
                case 'answer': T(1300 + Math.random() * 400, 0.04, { vol: 0.04 }); break;
                case 'timeup': T(520, 0.3, { type: 'square', to: 200, vol: 0.07 }); break;
                case 'correct':
                    [784, 988, 1175, 1568].forEach(function (f, k) { T(f, 0.6, { at: 0.1 + k * 0.06, vol: 0.14 }); });
                    self.noise(0.3, { f: 6000, vol: 0.04, at: 0.2 });
                    break;
                case 'out': T(190, 0.5, { type: 'sawtooth', to: 70, vol: 0.1, at: 0.5 }); break;
                case 'tie':
                    T(520, 0.18, { type: 'triangle', to: 390, vol: 0.14, at: 0.4 });
                    T(520, 0.2, { type: 'triangle', to: 390, vol: 0.14, at: 0.62 });
                    break;
                case 'win':
                    [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [784, 0.55], [1047, 0.67]].forEach(function (x) { T(x[0], 0.2, { at: x[1], type: 'triangle', vol: 0.18 }); });
                    [523, 659, 784, 1047].forEach(function (f) { T(f, 1.4, { at: 0.85, type: 'triangle', vol: 0.1 }); });
                    self.noise(0.8, { f: 7000, vol: 0.04, at: 0.85 });
                    break;
            }
        }
    };

    /* ======================================================================
     *  2) In-match state
     * ==================================================================== */
    var _alive = [];          // player objects still in
    var _eliminated = [];     // { player, round }
    var _outLog = [];         // most recent eliminated names first (side panel)
    var _startedAt = null;
    var _matchActive = false;
    var _commentUnsub = null;

    var _phase = 'idle';      // idle | memorize | question | reveal | over
    var _anim = 'in';         // 'enter' for the first frame of a round (no flip transition)
    var _round = 0;
    var _cols = 3, _rows = 1;
    var _cells = [];          // { n, e }
    var _target = 0;          // index into _cells asked about this round
    var _q = QS[0];
    var _t = 0, _tMax = 1;
    var _answers = {};        // playerId -> square number
    var _result = null;       // { correct, survived, out, tie, noAns, counts, final, outs:[player] }
    var _winners = [];
    var _busyUntil = 0;
    var _lastSec = null;
    var _lastBlip = 0;
    var _tickIv = null;
    var _elimTimer = null;
    var _elimOpen = false;

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _outLog = [];
        _startedAt = null;
        _matchActive = false;
        _phase = 'idle';
        _anim = 'in';
        _round = 0;
        _cells = [];
        _answers = {};
        _result = null;
        _winners = [];
        _busyUntil = 0;
        _lastSec = null;
        _elimOpen = false;
        clearTimeout(_elimTimer);
        if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }
    }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : {};
    }
    function memTime() { var v = Number(liveSettings().memorizeSeconds); return v > 0 ? v : 10; }
    function answerTime() { var v = Number(liveSettings().answerSeconds); return v > 0 ? v : 15; }

    /* ======================================================================
     *  3) Small helpers
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
    // Arabic-Indic / Persian digits -> ASCII, so "٣" in chat counts as 3.
    function normalizeDigits(text) {
        return String(text).replace(/[٠-٩۰-۹]/g, function (ch) {
            var code = ch.charCodeAt(0);
            return String(code >= 0x06F0 ? code - 0x06F0 : code - 0x0660);
        });
    }
    function escapeForInlineOnerrorJs(text) {
        return escapeHtml(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    }
    // TikTok username for the points report — same rule as Elimination
    // Roulette's tiktokUsernameFor(): the adapter's player id is
    // "tiktok:<uniqueId>".
    function tiktokUsernameFor(player) {
        if (!player || typeof player.id !== 'string') return null;
        var m = /^tiktok:(.+)$/.exec(player.id);
        return m ? m[1] : null;
    }
    function isAliveId(id) { return _alive.some(function (p) { return p.id === id; }); }
    function findPlayerByIdAnywhere(id) {
        var found = _alive.filter(function (p) { return p.id === id; })[0];
        if (found) return found;
        var entry = _eliminated.filter(function (e) { return e.player.id === id; })[0];
        return entry ? entry.player : null;
    }

    function ringAvatarHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="mc-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;mc-ring-avatar mc-ring-avatar--fallback&quot;>' + escapeForInlineOnerrorJs(initials) + '</div>\';">'
            : '<div class="mc-ring-avatar mc-ring-avatar--fallback">' + escapeHtml(initials) + '</div>';
    }

    /* ======================================================================
     *  4) Fonts + styles
     * ==================================================================== */
    function addFontLink(id, href) {
        if (el(id)) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = id;
        sheet.rel = 'stylesheet';
        sheet.href = href;
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    function ensureFonts() {
        // Zain + the design-system fonts: same as Elimination Roulette's
        // settings/lobby/drawer screens.
        addFontLink('mc-zain-font-link', 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap');
        addFontLink('mc-design-fonts-link', 'https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Kufi+Arabic:wght@400;500;600;700;800;900&display=swap');
        // Readex Pro: the play screen's font (Memory Challenge design handoff).
        addFontLink('mc-readex-font-link', 'https://fonts.googleapis.com/css2?family=Readex+Pro:wght@300;400;500;600;700&display=swap');
    }

    function injectStyles() {
        if (el('mc-styles')) return;
        ensureFonts();
        var style = document.createElement('style');
        style.id = 'mc-styles';
        style.textContent = [
            ':root{--mc-accent:' + C_ACCENT + ';--mc-accent2:' + C_ACCENT2 + ';--mc-pink:' + C_PINK + ';}',
            'html,body{margin:0 !important;padding:0 !important;}',

            // Same "Zain everywhere" override as Elimination Roulette, on
            // the shared settings/lobby overlay and this game's modals.
            '#agp-shell-overlay,#agp-shell-overlay *,#mc-modal-overlay,#mc-modal-overlay *,',
            '#mc-conn-layer,#mc-conn-layer *{font-family:"Zain",Cairo,sans-serif !important;}',

            /* ==============================================================
             * Play screen — Memory Challenge design handoff. Sits under the
             * shared persistent header (70px), so it starts below it.
             * ============================================================ */
            '#mc-stage{position:fixed;inset:0;padding:calc(70px + clamp(6px,1.2vmin,16px)) clamp(10px,2.2vmin,40px) clamp(10px,2.2vmin,40px);',
            'box-sizing:border-box;overflow:hidden;font-family:"Readex Pro",sans-serif;color:#F1EEF8;background:#0B0816;',
            'display:flex;flex-direction:column;gap:clamp(10px,2vmin,24px);direction:rtl;',
            '-webkit-font-smoothing:antialiased;}',
            '#mc-stage *{box-sizing:border-box;}',
            '.mc-emoji{font-family:"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif;}',

            '.mc-topbar{flex:none;display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px;}',
            '.mc-brand{display:flex;flex-direction:column;gap:2px;}',
            '.mc-brand-title{font-size:clamp(22px,3.6vmin,40px);font-weight:700;line-height:1.35;}',
            '.mc-brand-sub{font-size:clamp(13px,1.9vmin,21px);color:#9A92B3;}',
            '.mc-top-actions{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(8px,1.2vmin,14px);}',
            '.mc-chip{height:clamp(40px,5.6vmin,60px);padding:0 clamp(14px,2.2vmin,26px);border-radius:clamp(10px,1.4vmin,14px);',
            'background:#1A1430;border:3px solid #2E2448;box-shadow:0 4px 0 #05030A;color:#F1EEF8;',
            'display:flex;align-items:center;gap:10px;font-size:clamp(14px,2.1vmin,24px);font-family:inherit;}',
            'button.mc-chip{cursor:pointer;font-weight:600;font-size:clamp(14px,2.1vmin,22px);gap:8px;}',
            'button.mc-chip:hover{background:#231B3A;}',
            'button.mc-chip:active{transform:translateY(3px);box-shadow:0 1px 0 #05030A;}',
            '.mc-chip-label{color:#9A92B3;}',
            '.mc-chip-val{font-weight:700;font-size:clamp(18px,2.8vmin,30px);}',
            '.mc-phase-badge{background:' + ACC + ';color:' + INK + ';border-color:' + ACC_DARK + ';',
            'box-shadow:0 4px 0 ' + ACC_DARK + ';font-size:clamp(15px,2.3vmin,26px);font-weight:700;padding:0 clamp(16px,2.4vmin,28px);}',
            '#mc-mute-btn{width:clamp(40px,5.6vmin,60px);padding:0;justify-content:center;font-size:clamp(18px,2.6vmin,26px);}',

            '.mc-main{flex:1;min-height:0;display:flex;flex-direction:row;gap:clamp(10px,2vmin,28px);}',
            '.mc-main.mc-narrow{flex-direction:column;}',
            '.mc-game-col{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;gap:clamp(8px,1.6vmin,18px);position:relative;}',
            '.mc-card{border-radius:clamp(16px,2.2vmin,24px);background:#130E22;border:3px solid #2E2448;box-shadow:0 6px 0 #05030A;}',
            '.mc-head{flex:none;min-height:clamp(84px,13vmin,150px);padding:clamp(12px,2vmin,20px) clamp(16px,3vmin,40px);',
            'display:flex;align-items:center;justify-content:space-between;gap:16px;}',
            '.mc-head-text{display:flex;flex-direction:column;gap:clamp(4px,0.9vmin,10px);min-width:0;}',
            '.mc-h-big{font-size:clamp(24px,5vmin,56px);font-weight:700;line-height:1.3;}',
            '.mc-h-mid{font-size:clamp(24px,4.8vmin,52px);font-weight:700;}',
            '.mc-h-sub{font-size:clamp(14px,2.2vmin,24px);color:#9A92B3;}',
            '.mc-q-row{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(8px,2vmin,22px);}',
            '.mc-q-word{font-size:clamp(24px,5.2vmin,58px);font-weight:700;line-height:1.3;}',
            '.mc-q-emoji{font-size:clamp(40px,8.4vmin,92px);line-height:1;}',
            '.mc-reveal-row{display:flex;flex-wrap:wrap;align-items:center;gap:clamp(10px,1.8vmin,18px);}',
            '.mc-correct-pill{background:' + ACC + ';color:' + INK + ';border-radius:clamp(10px,1.5vmin,16px);padding:0 clamp(14px,2vmin,22px);line-height:1.45;}',
            '.mc-res-line{display:flex;flex-wrap:wrap;gap:12px;font-size:clamp(15px,2.4vmin,26px);font-weight:600;}',
            '.mc-tie-line{font-size:clamp(15px,2.4vmin,26px);color:#FFD166;}',
            '.mc-noans-line{font-size:clamp(15px,2.4vmin,26px);color:#9A92B3;}',

            '.mc-timer{flex:none;width:clamp(68px,10.4vmin,116px);height:clamp(68px,10.4vmin,116px);border-radius:clamp(16px,2.2vmin,24px);',
            'border:3px solid ' + ACC + ';display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;}',
            '.mc-timer-num{font-size:clamp(28px,4.8vmin,54px);font-weight:700;line-height:1;color:' + ACC + ';font-variant-numeric:tabular-nums;}',
            '.mc-timer-lbl{font-size:clamp(12px,1.5vmin,16px);color:#9A92B3;font-weight:500;}',
            '.mc-primary-btn{flex:none;height:clamp(52px,7.4vmin,84px);padding:0 clamp(18px,3vmin,36px);border-radius:999px;',
            'background:' + ACC + ';color:' + INK + ';font-family:inherit;font-size:clamp(16px,2.5vmin,28px);font-weight:700;cursor:pointer;',
            'border:3px solid ' + ACC_DARK + ';box-shadow:0 6px 0 ' + ACC_DARK + ';transition:transform .08s,box-shadow .08s;}',
            '.mc-primary-btn:hover{filter:brightness(1.08);}',
            '.mc-primary-btn:active{transform:translateY(5px);box-shadow:0 1px 0 ' + ACC_DARK + ';}',

            '.mc-bar{height:clamp(6px,0.9vmin,10px);flex:none;border-radius:10px;background:#1A1430;border:2px solid #2E2448;overflow:hidden;display:flex;}',
            '.mc-bar-fill{height:100%;width:0;background:' + ACC + ';border-radius:10px;transition:width .1s linear,background .3s;}',

            '#mc-grid-wrap{flex:1;min-height:0;min-width:0;display:flex;align-items:center;justify-content:center;}',
            '#mc-grid{display:flex;flex-wrap:wrap;justify-content:center;direction:rtl;}',
            '.mc-cell{flex:none;position:relative;perspective:900px;transition:transform .4s cubic-bezier(.34,1.56,.64,1),opacity .3s;}',
            '.mc-cell-inner{position:absolute;inset:0;transform-style:preserve-3d;}',
            '.mc-face{position:absolute;inset:0;backface-visibility:hidden;-webkit-backface-visibility:hidden;border:3px solid #2E2448;',
            'display:flex;align-items:center;justify-content:center;transition:background .3s,border-color .3s;}',
            '.mc-face-back{transform:rotateY(180deg);}',
            '.mc-num{font-weight:700;line-height:1;font-variant-numeric:tabular-nums;transition:color .3s;}',
            '.mc-cell-emoji{line-height:1;}',
            '.mc-badge{position:absolute;top:6%;right:9%;font-weight:700;}',
            '.mc-count{position:absolute;z-index:2;bottom:7%;left:7%;padding:1px 9px;border-radius:10px;font-weight:700;display:none;}',

            '.mc-panel{flex:none;display:flex;flex-direction:column;gap:clamp(8px,1.6vmin,18px);min-height:0;width:clamp(280px,25vw,500px);}',
            '.mc-main.mc-narrow .mc-panel{width:100%;height:clamp(210px,32vh,340px);}',
            '.mc-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:clamp(8px,1.2vmin,14px);flex:none;}',
            '.mc-stat{padding:clamp(10px,1.8vmin,20px) clamp(12px,2vmin,22px);border-radius:clamp(14px,1.9vmin,20px);display:flex;flex-direction:column;gap:4px;}',
            '.mc-stat-lbl{font-size:clamp(13px,1.9vmin,20px);color:#9A92B3;font-weight:500;}',
            '.mc-stat-val{font-size:clamp(24px,4.4vmin,48px);font-weight:700;line-height:1.35;font-variant-numeric:tabular-nums;}',
            '.mc-lists{flex:1;min-height:0;display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:clamp(8px,1.2vmin,14px);}',
            '.mc-list-card{border-radius:clamp(14px,1.9vmin,20px);padding:clamp(10px,1.6vmin,16px) clamp(12px,1.8vmin,18px);',
            'display:flex;flex-direction:column;gap:10px;overflow:hidden;min-height:0;}',
            '.mc-list-head{display:flex;justify-content:space-between;align-items:center;font-size:clamp(13px,1.8vmin,20px);}',
            '.mc-list-body{display:flex;flex-wrap:wrap;gap:6px;align-content:flex-start;overflow:hidden;}',
            '.mc-name-chip{font-size:clamp(12px,1.6vmin,17px);padding:3px 11px;border-radius:999px;',
            'background:color-mix(in oklch, ' + ACC + ' 18%, #1A1430);border:2px solid color-mix(in oklch, ' + ACC + ' 40%, #2E2448);color:#E4E0F0;}',
            '.mc-name-chip.mc-out{background:#2A1626;border-color:#4A2226;color:#E8A0A8;text-decoration:line-through;text-decoration-color:rgba(255,107,107,.5);}',

            /* ---- "Eliminated this round" window (design handoff) ---- */
            '#mc-elim-overlay{position:fixed;inset:0;z-index:99980;background:rgba(5,3,10,.72);display:none;align-items:center;justify-content:center;',
            'padding:86px 16px 16px;font-family:"Readex Pro",sans-serif;color:#F1EEF8;direction:rtl;}',
            '#mc-elim-overlay.mc-show{display:flex;}',
            '#mc-elim-box{width:min(560px,100%);max-height:min(600px,100%);background:#130E22;border:3px solid #4A2226;box-shadow:0 8px 0 #05030A;',
            'border-radius:24px;display:flex;flex-direction:column;overflow:hidden;}',
            '.mc-elim-head{height:72px;flex:none;padding:0 20px;border-bottom:3px solid #2E2448;display:flex;align-items:center;justify-content:space-between;gap:12px;}',
            '.mc-elim-title{display:flex;align-items:center;gap:10px;}',
            '.mc-elim-title span:first-child{font-size:24px;font-weight:700;}',
            '.mc-elim-count{font-size:15px;font-weight:700;padding:2px 10px;border-radius:999px;background:#2A1626;border:2px solid #4A2226;color:#FF8A8A;}',
            '.mc-x-btn{width:42px;height:42px;flex:none;border-radius:14px;background:#1A1430;border:3px solid #2E2448;box-shadow:0 4px 0 #05030A;',
            'color:#F1EEF8;font-family:inherit;font-size:20px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;}',
            '.mc-x-btn:hover{background:#231B3A;}',
            '#mc-elim-grid{flex:1;min-height:0;overflow:auto;scrollbar-width:none;padding:20px;display:grid;',
            'grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:12px;align-content:start;}',
            '#mc-elim-grid::-webkit-scrollbar{display:none;}',
            '.mc-elim-card{display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 10px 14px;border-radius:18px;',
            'background:#1A1430;border:3px solid #2E2448;box-shadow:0 4px 0 #05030A;min-width:0;}',
            '.mc-elim-av-wrap{position:relative;width:76px;height:76px;flex:none;}',
            '.mc-elim-av{width:76px;height:76px;border-radius:50%;overflow:hidden;border:3px solid #FF6B6B;background-size:cover;',
            'background-position:center;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:700;color:#fff;}',
            '.mc-elim-x{position:absolute;bottom:-2px;left:-2px;width:28px;height:28px;border-radius:50%;background:#FF4D4D;',
            'border:3px solid #130E22;color:#fff;font-size:13px;font-weight:700;display:flex;align-items:center;justify-content:center;}',
            '.mc-elim-name{max-width:100%;font-size:16px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',

            /* ==============================================================
             * Winner screen — Elimination Roulette's design (blurred
             * backdrop, no panel, shared trophy card per winner, confetti).
             * ============================================================ */
            '#mc-modal-overlay{position:fixed;inset:0;z-index:99990;display:none;flex-direction:column;',
            'align-items:center;justify-content:center;gap:18px;padding:86px 16px 16px;background:rgba(8,4,16,0.72);color:#fff;direction:rtl;}',
            '#mc-modal-box{max-width:97vw;max-height:100%;display:flex;flex-direction:column;}',
            // Many winners: the card row scrolls (hidden scrollbar) and the
            // buttons stay visible below it.
            '#mc-winner-box .mc-trophy-cards{max-height:calc(100vh - 290px);max-height:calc(100dvh - 290px);overflow-y:auto;',
            'scrollbar-width:none;padding:6px 10px 10px;}',
            '#mc-winner-box .mc-trophy-cards::-webkit-scrollbar{display:none;}',
            '.mc-trophy-winner .agp-trophy-extra,.mc-rounds-line{font-size:13px;color:rgba(233,228,245,.8);margin-top:6px;}',
            '@keyframes mc-select-fadein{from{opacity:0}to{opacity:1}}',
            '.mc-drawer-timing-card{display:flex;flex-direction:column;gap:14px;}',

            '#mc-modal-overlay.mc-winner-backdrop{background:rgba(8,4,16,0.38);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '#mc-modal-box.mc-winner-panel{background:none;border:none;box-shadow:none;',
            'padding:0;width:auto;max-width:100%;overflow:visible;}',
            '#mc-winner-box{text-align:center;}',
            '#mc-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;',
            'text-shadow:0 2px 12px rgba(0,0,0,0.65);}',
            '.mc-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
            /* Uniform 250x250 cards with no background/border at all —
             * confetti is the celebratory element now (see spawnConfetti()).
             * A glow/radiance effect around each card (same shared color
             * for both the winner and the most-eliminations player), with
             * a soft ongoing pulse. overflow:visible instead of hidden so
             * the glow isn't clipped (nor the occasional confetti piece
             * that crosses the card's bounds).
             * The card design itself (the 300x400 glass rectangle, colored
             * ring, crown, dots, etc.) moved entirely into the shared
             * js/agp-player-card.js (AGP.playerCard.renderTrophyCard) so
             * any other game can reuse it without rebuilding it. The
             * card's own CSS (.agp-trophy-*) no longer lives here at all —
             * see js/agp-player-card.js. What remains here is only the
             * purely local pieces (the blurred screen background, the card
             * row, the "replay/new match" buttons) plus
             * .mc-ring-avatar/.mc-ring-avatar--fallback (still used
             * elsewhere locally — the elimination/revival announcement and
             * the floating revival card, see ringAvatarHtml()). */
            '.mc-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.mc-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',

            // Retint the shared trophy card (design_handoff_winner_card —
            // gold by default) to this game's own violet identity, per
            // .agp-trophy-wrap's documented CSS custom properties. Winner
            // in the lighter brand purple, most-eliminations in pink —
            // keeps the two cards visually distinct like the old gold/pink
            // ring design did, without needing a ring at all anymore.
            '.mc-trophy-winner{--agp-trophy-accent:#b28cf5;--agp-trophy-accent-dark:#7c3aed;',
            '--agp-trophy-border:rgba(178,140,245,.55);--agp-trophy-divider:rgba(178,140,245,.25);',
            '--agp-trophy-label:rgba(178,140,245,.75);--agp-trophy-bg1:rgba(28,20,44,.72);',
            '--agp-trophy-bg2:rgba(14,10,24,.82);}',
            '.mc-trophy-most{--agp-trophy-accent:#ff8ef5;--agp-trophy-accent-dark:#a83fa8;',
            '--agp-trophy-border:rgba(255,142,245,.55);--agp-trophy-divider:rgba(255,142,245,.25);',
            '--agp-trophy-label:rgba(255,142,245,.75);--agp-trophy-bg1:rgba(35,18,44,.72);',
            '--agp-trophy-bg2:rgba(18,10,24,.82);}',

            '.mc-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.mc-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#mc-replay-same-btn{background:linear-gradient(90deg,var(--mc-accent2),var(--mc-accent));color:#0b0616;}',
            '#mc-new-match-btn{background:#fff;border:1px solid var(--mc-accent);color:#5a2585;}',

            /* ---- Celebratory confetti effect (winner-screen cards) ---- */
            '.mc-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:mc-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes mc-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',

            /* Fallback background for the shared #agp-shell-box (settings/
             * lobby/reopened-drawer/mini-lobby) — same gradient used by
             * #mc-modal-box above, for a consistent look across every
             * screen in this game before its more specific class (below)
             * takes over. #agp-shell-box itself is defined in the shared
             * js/agp-game-shell.js (used by every game); instead of editing
             * it there (which would affect every game), this rule is
             * injected here only, loaded after the shared file's own
             * styles, scoped by the same ID + !important — so it only
             * affects this game's page, never any other game sharing that
             * box. */
            // :not(.mc-settings-initial-box) — the settings screen sets
            // its own background:none below via a plain class selector
            // (.mc-settings-initial-box, matching both the real box and
            // its connecting-layer ghost clone — see the connecting-layer
            // comment further down). This exclusion keeps the two rules
            // scoped to disjoint states instead of relying on specificity.
            '#agp-shell-box:not(.mc-settings-initial-box){background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            /* Lobby without a surrounding box — the title/hint line/card
             * grid/bottom bar float directly over the page's aurora
             * background (the box itself has no background/border). The
             * structural layout (fixed-height flex column + internal
             * scroll for the card grid only — PLAYER-CARD-STANDARDS.md §4)
             * is unchanged, only the background/border.
             */
            // overflow-y:auto safety net — same reasoning as the settings
            // overlay below: if 94vh/94dvh ever computes taller than the
            // real visible viewport on a given device, the bottom action
            // row must still be reachable by scrolling the page, not
            // permanently stuck off-screen.
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
            'overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(214,168,60,.14),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;}',
            '#agp-shell-box.agp-lobby-box{background:none !important;border:none !important;',
            'box-shadow:none !important;position:relative;overflow:hidden;}',

            /* ---- Additional overrides on the shared settings/lobby box
             * (#agp-shell-box) — every rule here is !important and injected
             * from this file only (after the shared file's own styles), so
             * it only affects this game's page, never touching
             * js/agp-game-shell.js itself. ---- */

            // Settings-close button (✕) — bright white, clearly visible.
            '#agp-settings-close-btn{color:#ffffff !important;font-weight:900 !important;',
            'text-shadow:0 1px 4px rgba(0,0,0,0.5) !important;}',

            // PLAYER-CARD-STANDARDS.md §4: the screen stays fixed with no
            // page/box-level scroll at all — only the card grid area
            // (#agp-lobby-list) scrolls internally, always stopping before
            // the bottom bar regardless of player count. The box is a
            // vertical flex column: fixed elements (title, hint line,
            // bottom bar) keep their natural size (flex:0 0 auto), and the
            // card grid alone takes the remaining space and scrolls if needed.
            // Width wasn't overridden here before, so the box quietly
            // inherited the shared file's fixed 900px default (max-width
            // 96vw) — fine on a phone, but a fixed cap well short of what
            // a tablet/laptop screen actually has leaves a visibly narrow
            // column with large empty margins on both sides. min(94vw,…)
            // already shrinks properly on small screens; raising the cap
            // to 1310px (wide enough for 5 lobby cards per row: 5x217px
            // + 4x37px gaps = 1233px, plus the box's 34px side padding —
            // see the player grid below) lets it
            // use a tablet or laptop's width properly instead of stopping
            // short at 900.
            // 94vh -> 94dvh override for the same reason as the settings
            // screen's 100dvh comment further down: vh alone can be taller
            // than the real visible viewport on mobile/tablet Safari while
            // the browser chrome is showing.
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
            // Card grid scrolls with a hidden scrollbar (wheel/touch still
            // work), and extends underneath the bottom action row so cards
            // pass behind the buttons while scrolling. --mc-actions-h is
            // the row's live height (+ its top margin), kept in sync by
            // enhanceLobbyWatermarkAndActions() via a ResizeObserver since
            // the row wraps onto more lines on narrow screens. The bottom
            // padding lets the last row of cards scroll fully clear of the
            // buttons.
            // padding-top gives the first row of framed cards (which can
            // extend up to 9px above their 57px slot — see the framed-card
            // rules below) room inside the scroll area's clip edge.
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{scrollbar-width:none !important;',
            '-ms-overflow-style:none !important;padding-top:12px !important;',
            'padding-bottom:calc(var(--mc-actions-h,62px) + 16px) !important;',
            'margin-bottom:calc(-1 * var(--mc-actions-h,62px)) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list::-webkit-scrollbar{display:none !important;}',

            // "Ayman Games" logo as a transparent (25%) watermark in the
            // middle of the lobby box. Added as an img element via
            // enhanceLobbyWatermarkAndActions() — this just positions/fades it.
            '#mc-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            // The lobby box's real content always stays above the watermark.
            '#agp-shell-box.agp-lobby-box > *:not(#mc-lobby-watermark){position:relative;z-index:1;}',

            // Lobby header, per the new design: line 1 is the title
            // (لوبي الدخول للعبة "روليت الإقصاء", set by enhanceLobbyHeading()
            // below — no change to the shared file) in large bold white;
            // line 2 is "للدخول اكتب في شات البث" + the join keyword in
            // large yellow on the right, and the player-count capsule on the
            // left. Line 2 reuses the shared file's own .agp-join-hint row:
            // its hint text is hidden, the sentence is the keyword badge's
            // ::before, and the count badge is restyled into the capsule.
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
            // Player-count capsule — same element the shared file already
            // fills in (playerCountBadgeHtml, "current / max"); order:1 puts
            // it on the left.
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

            /* ==================================================================
             * Player grid — lobby cards per the new design: every card is a
             * single 217x57 capsule (border-radius 24px, #D9D9D9 at 30%
             * opacity, 2px black border) with a 48px round avatar inside it
             * on the right, the name centered in white, and the kick button
             * (✕) small on the left. Columns are fixed at 217px with a 37px
             * gap — 5 per row at full width, fewer on narrower screens.
             * Local !important override on the sizes the shared
             * AGP.playerCard component renders inline — js/agp-player-card.js
             * itself is untouched. Scoped entirely to the lobby
             * (.agp-lobby-box) — no effect on the mid-match settings player
             * list or any other use of the card in this file.
             * ==================================================================== */
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
            // Manual-kick button (✕) on unframed cards — small, inside the
            // card on its left edge, vertically centered (the design's
            // 10px icon spot), instead of the shared file's default
            // (top:-6px;left:-6px, outside the card entirely).
            // Scoped to :has(> .agp-pcard) so framed cards are untouched.
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:50% !important;left:7px !important;right:auto !important;transform:translateY(-50%);',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            // Framed cards (.agp-pcard-tpl) sit in the same 217x57 grid slot
            // as the unframed cards above, never clipped: the shared
            // renderer draws them 298x100 (cropping tall frames), so
            // enhanceLobbyFramedCards() below re-expands each card to its
            // frame artwork's full height and sets an inline zoom that fits
            // the whole frame into the slot (up to 75px tall, spilling a few
            // px into the row gap). zoom:0.7282 (217/298) is only the
            // default until that measurement finishes. The kick button
            // moves to the same left-edge spot as on unframed cards.
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

            // Lobby bottom action row — the two buttons (start round, back
            // to the games library) sit in one row at a fixed size
            // (W360xH48) each, centered, above the scrolling card grid.
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;position:relative;z-index:3 !important;}',
            '.mc-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row #agp-start-round-btn{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 22px 46px -24px rgba(122,63,212,1) !important;transition:background .25s !important;}',
            '#agp-shell-box.agp-lobby-box .mc-lobby-actions-row #agp-start-round-btn:hover{',
            'background:#9a6cf0 !important;}',

            // "Back to platform" button — in the lobby it joins the same
            // two-button row (sized W360xH48 above); on the initial
            // settings screen it keeps its own default block layout (the
            // general rule below is the default, and .mc-lobby-actions-row
            // above overrides it only inside the lobby row).
            '.mc-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.mc-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',

            /* ================================================================
             * Settings screen — restyled to the new design handoff (purple/
             * gold palette, Cairo/Noto Kufi Arabic/IBM Plex Sans Arabic
             * fonts): a single scrollable column (max-width 860px) instead
             * of the previous two-column layout, with a hidden-scrollbar
             * fade-out area for the fields and a fixed footer row for the
             * two bottom buttons. Field keys/defaults/order are untouched —
             * only presentation changes. DOM grouping (the scroll wrapper,
             * the footer, and the two toggle "cards") is built in
             * layoutInitialSettingsFields() above. Scoped entirely to
             * .mc-settings-initial-box — no effect on the mid-match drawer
             * or the lobby screen.
             * ================================================================ */
            // overflow-y:auto (not hidden) is a safety net: the box below
            // is sized to fit the viewport exactly, so this shouldn't need
            // to scroll in practice, but on a device where the viewport
            // height is miscalculated (see the 100dvh comment below) the
            // footer/connect button must still be reachable by scrolling
            // the page itself, instead of being permanently stuck off-screen.
            '#agp-shell-overlay:has(.mc-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow-y:auto !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(70,40,150,.22),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;',
            'background-size:auto,auto,auto,88px 88px,88px 88px,auto !important;}',
            // width:min(94vw,…) already shrinks correctly on narrow
            // screens; a flat 860px cap just stops growing past ~915px
            // wide and leaves a visibly narrow column with big empty
            // margins on tablet/laptop screens. 1040px still reads
            // comfortably (this is text/form content, not a photo grid)
            // but actually uses a tablet or small-laptop's width instead
            // of abandoning it.
            // 100vh on mobile/tablet Safari is the *largest* possible
            // viewport (as if the address/tab bar were hidden), not the
            // actually-visible area — so a box sized off plain 100vh can
            // be taller than what's really on screen while the browser
            // chrome is showing, pushing the footer/connect button below
            // the visible fold. 100dvh (dynamic viewport height) tracks
            // the real visible height instead; declared after the 100vh
            // line so older browsers that don't understand dvh simply
            // ignore it and keep the vh-based fallback above.
            '.mc-settings-initial-box{width:min(1040px,94vw) !important;',
            'max-width:min(1040px,94vw) !important;height:calc(100vh - 70px) !important;',
            'height:calc(100dvh - 70px) !important;',
            'max-height:calc(100vh - 70px) !important;max-height:calc(100dvh - 70px) !important;',
            'margin:70px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:16px 4px 0 !important;box-sizing:border-box !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.mc-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '.mc-settings-initial-box > h2{flex:0 0 auto !important;margin:0 0 4px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(24px,3.6vw,40px) !important;',
            'font-weight:900 !important;line-height:1.4 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'font-family:"Cairo",sans-serif !important;',
            'background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5) !important;',
            'background-size:200% 100% !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;',
            'animation:mc-settings-wave 9s linear infinite !important;}',
            '.mc-settings-initial-box > h2::after{content:none !important;}',
            '@keyframes mc-settings-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',

            // ⚠️ [الآن جزء من الملف المشترك] شارة حالة الاتصال (.mc-conn-status-*)
            // كانت هنا -- js/agp-game-shell.js يبني شارته العامة
            // (.agp-shell-conn-badge) بنفسه الآن. الاستثناء الوحيد المُبقى:
            // تعطيل زر الاتصال هذا خاص بتصميم هذي اللعبة (transform:none
            // فوق حركة hover الافتراضية).
            '.mc-settings-initial-box .agp-shell-btn-connect:disabled{opacity:.45 !important;',
            'cursor:not-allowed !important;transform:none !important;}',

            // Scroll area — flex:1 so the header/footer stay put and only
            // the fields scroll; scrollbar hidden (still scrolls via touch/
            // wheel), fade-out + thin glow line hint more content below.
            '.mc-settings-initial-box .mc-settings-scroll{position:relative;',
            'flex:1 1 auto;min-height:0;width:100%;margin-top:18px;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner{box-sizing:border-box;',
            'height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;',
            'padding:0 2px 26px;scrollbar-width:none;}',
            '.mc-settings-initial-box .mc-settings-scroll-inner::-webkit-scrollbar{',
            'display:none;}',
            '.mc-settings-initial-box .mc-settings-fade{position:absolute;inset:auto 0 0;',
            'height:44px;background:linear-gradient(transparent,#08060d);pointer-events:none;}',
            '.mc-settings-initial-box .mc-settings-glowline{position:absolute;inset:auto 0 0;',
            'height:1px;background:linear-gradient(90deg,transparent,rgba(178,140,245,.55),transparent);',
            'pointer-events:none;}',

            // Plain rows — label right, control left, spaced only by the
            // scroll wrapper's gap (no divider lines, matching the design).
            '.mc-settings-initial-box .agp-shell-field,',
            '.mc-settings-initial-box .agp-shell-row{border-bottom:none !important;',
            'padding:2px 0 !important;max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;gap:12px !important;}',
            '.mc-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;}',
            '.mc-settings-initial-box .agp-shell-field label,',
            '.mc-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:600 !important;color:#f4f2fb !important;text-align:right !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;display:flex !important;',
            'flex-direction:column !important;align-items:flex-end !important;gap:3px !important;}',

            // Username/keyword text inputs — capsule pill, centered text.
            '.mc-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:rgba(255,255,255,.04) !important;',
            'border:1px solid rgba(255,255,255,.14) !important;border-radius:999px !important;',
            'padding:13px 18px !important;font-size:15px !important;font-weight:400 !important;',
            'text-align:center !important;transition:border-color .25s !important;color:#f4f2fb !important;',
            'box-sizing:border-box !important;}',
            '.mc-settings-initial-box .agp-shell-field input[type=text]:focus,',
            '.mc-settings-initial-box .agp-shell-field input[type=text]:not(:placeholder-shown){',
            'border-color:rgba(178,140,245,.6) !important;outline:none !important;}',

            // Pill groups/buttons — capsule track, solid purple when active.
            '.mc-settings-initial-box .agp-pill-group{gap:8px !important;padding:4px !important;',
            'border-radius:999px !important;',
            'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)) !important;',
            'border:1px solid rgba(255,255,255,.12) !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 10px -6px rgba(0,0,0,.6) !important;}',
            '.mc-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:none !important;color:#a79fbb !important;padding:10px 16px !important;',
            'border-radius:999px !important;font-size:13.5px !important;font-weight:600 !important;',
            'transition:.25s !important;white-space:nowrap;}',
            '.mc-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 4px 10px -4px rgba(122,63,212,.7) !important;}',

            // Max-players counter — +/- buttons stay hidden (existing
            // behavior: type the number directly), pill-shaped field.
            '.mc-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '.mc-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;',
            'flex:1;max-width:220px;}',
            '.mc-settings-initial-box .agp-count-input{',
            'background:rgba(255,255,255,.04) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'border-radius:999px !important;padding:13px 18px !important;width:100% !important;',
            'height:auto !important;color:#f4f2fb !important;font-size:15px !important;',
            'font-weight:400 !important;outline:none !important;text-align:center !important;',
            'box-sizing:border-box !important;}',
            '.mc-settings-initial-box .agp-count-input:focus{',
            'border-color:rgba(178,140,245,.55) !important;}',


            // "Card" sections (revive-by-gift, friend-revival) — bordered
            // rounded panel, built by wrapping the row(s) in .mc-settings-card
            // inside layoutInitialSettingsFields().
            '.mc-settings-initial-box .mc-settings-card{width:100%;',
            'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:rgba(255,255,255,.03);box-sizing:border-box;display:flex;',
            'flex-direction:column;gap:12px;}',
            '.mc-settings-initial-box .mc-settings-card > .agp-shell-row,',
            '.mc-settings-initial-box .mc-settings-card > .agp-shell-field{padding:0 !important;}',

            // Conditional fields (revive count + gift picker) — shown only
            // while the revive toggle is on, separated by a thin top divider
            // instead of the previous side accent bar.
            '.mc-settings-initial-box .mc-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:14px !important;margin-top:4px !important;',
            'padding-top:16px !important;border-top:1px solid rgba(255,255,255,.07) !important;',
            'border-right:none !important;padding-right:0 !important;}',
            '.mc-settings-initial-box .mc-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:0 !important;}',

            // Caption under the "wheel shape" pills (enhanceWheelModeField).
            '.mc-settings-initial-box .mc-field-note{color:#8f88a3 !important;',
            'text-align:right !important;}',

            // Footer — the two bottom buttons side by side (primary button
            // on the right, back link on the left, per the design), instead
            // of the previous stacked column-spanning blocks.
            '.mc-settings-initial-box .mc-settings-footer{flex:0 0 auto !important;',
            'width:100% !important;display:flex !important;flex-wrap:wrap !important;',
            'align-items:center !important;justify-content:center !important;',
            'gap:clamp(16px,3vw,36px) !important;padding:20px 0 26px !important;}',
            '.mc-settings-initial-box .agp-shell-btn-connect{',
            'order:1;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:auto !important;',
            'max-width:none !important;margin:0 !important;padding:16px 42px !important;',
            'background:#7a3fd4 !important;color:#f3ecff !important;font-weight:700 !important;',
            'font-size:clamp(15px,1.8vw,17px) !important;border-radius:999px !important;',
            'letter-spacing:0.4px;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 22px 46px -24px rgba(122,63,212,1) !important;',
            'transition:background .25s,transform .25s !important;}',
            '.mc-settings-initial-box .agp-shell-btn-connect:hover{',
            'background:#9a6cf0 !important;transform:translateY(-2px);}',
            '.mc-settings-initial-box .mc-back-to-platform-btn{',
            'order:2;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;width:auto !important;margin:0 !important;padding:0 !important;',
            'border:none !important;background:transparent !important;font-size:14px !important;',
            'font-weight:400 !important;color:#a79fbb !important;transition:color .25s !important;}',
            '.mc-settings-initial-box .mc-back-to-platform-btn:hover{',
            'color:#d3bcff !important;background:transparent !important;}',

            /* ================================================================
             * Custom connecting layer (#mc-conn-layer) — an element fully
             * separate from #agp-shell-box, added once to body. The shared
             * connecting/error box is hidden visually (not removed or
             * modified — just visibility:hidden) to avoid duplicating our
             * own layer. See ensureConnLayer/showConnLayer/syncConnLayer.
             * ================================================================ */
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#mc-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#mc-conn-layer.show{display:flex;}',
            '#mc-conn-layer .mc-conn-backdrop{position:absolute;inset:0;overflow:hidden;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#mc-conn-layer .mc-conn-backdrop > *{pointer-events:none !important;}',
            '#mc-conn-layer .mc-conn-modal{position:relative;z-index:1;width:min(360px,90vw);',
            'background:linear-gradient(180deg,rgba(30,24,52,.98),rgba(11,10,18,.99));',
            'border:1px solid rgba(178,140,245,.32);border-radius:24px;',
            'padding:32px 26px;text-align:center;box-shadow:0 40px 90px -46px rgba(0,0,0,1);',
            'font-family:"Noto Kufi Arabic",sans-serif;}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err{border-color:#ef4444;}',
            '#mc-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#mc-conn-layer .mc-conn-spinner{width:52px;height:52px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(178,140,245,.25);border-top-color:#b28cf5;',
            'animation:mc-conn-spin 0.9s linear infinite;}',
            '@keyframes mc-conn-spin{to{transform:rotate(360deg);}}',
            '#mc-conn-layer .mc-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#mc-conn-layer .mc-conn-title{margin:0 0 6px;font-size:16.5px;font-weight:700;color:#f4f2fb;}',
            '#mc-conn-layer .mc-conn-modal.mc-conn-err .mc-conn-title{color:#ef4444;}',
            '#mc-conn-layer .mc-conn-sub{margin:0;font-size:13px;color:#8f88a3;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;}',

            /* ================================================================
             * Mid-match settings drawer ("الإعدادات") — matches the design
             * spec's settingsOpen modal exactly: a top-left anchored panel
             * (was a right-edge full-height slide-in drawer before this
             * redesign) with a segmented اللاعبون/الإعدادات tab control.
             * See enhanceReopenedDrawer above. The "اللاعبون" tab keeps its
             * existing search+status-filter (more capable than the spec's
             * two static lists) — a real feature, not dropped just to
             * match the simpler prototype — restyled only.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.mc-inmatch-drawer){align-items:flex-start !important;',
            'justify-content:flex-start !important;padding:74px 14px 14px !important;}',
            '#agp-shell-box.mc-inmatch-drawer{position:relative !important;top:auto !important;',
            'right:auto !important;left:auto !important;width:350px !important;max-width:94vw !important;',
            'height:900px !important;max-height:calc(100vh - 74px) !important;',
            'max-height:calc(100dvh - 74px) !important;border-radius:20px !important;margin:0 !important;',
            'background:rgba(13,11,22,.97) !important;border:1px solid rgba(178,140,245,.3) !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;',
            'padding:0 !important;box-shadow:0 40px 90px -50px rgba(0,0,0,1) !important;',
            'animation:mc-select-fadein .2s ease both;}',
            '.mc-drawer-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;}',
            '.mc-drawer-header h2{font-size:15.5px !important;font-weight:700 !important;margin:0 !important;',
            'padding:0 !important;font-family:"Noto Kufi Arabic",sans-serif !important;color:#f4f2fb;}',
            '.mc-drawer-header #agp-settings-close-btn{position:static !important;width:30px;height:30px;',
            'display:flex;align-items:center;justify-content:center;border-radius:9px;',
            'border:1px solid rgba(255,255,255,.14) !important;background:transparent !important;',
            'color:#cfc7e2 !important;font-size:15px !important;text-shadow:none !important;}',
            '.mc-drawer-tabs{display:flex;gap:6px;padding:12px 16px 0;flex:none;}',
            '.mc-drawer-tabs button{flex:1;padding:10px 8px;border:0;cursor:pointer;border-radius:12px;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;font-size:12.5px;font-weight:600;',
            'background:rgba(255,255,255,.04);color:#a79fbb;transition:background .2s,color .2s;}',
            '.mc-drawer-tabs button.mc-tab-active{background:#7a3fd4;color:#f3ecff;}',
            '.mc-drawer-body,.mc-drawer-players-tab{flex:1;min-height:0;overflow-y:auto;padding:14px 16px;}',
            '.mc-drawer-body .agp-shell-row,.mc-drawer-players-tab .agp-shell-row,',
            '.mc-drawer-body .agp-shell-field,.mc-drawer-players-tab .agp-shell-field{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;flex-wrap:wrap;',
            'padding:14px 16px !important;margin:0 0 12px !important;border-radius:18px;',
            'border:1px solid rgba(255,255,255,.09) !important;',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9)) !important;}',
            '.mc-drawer-body .agp-shell-field{flex-direction:column !important;align-items:flex-start !important;}',
            '.mc-drawer-body .agp-shell-row-label,.mc-drawer-players-tab .agp-shell-row-label,',
            '.mc-drawer-body .agp-shell-field label,.mc-drawer-players-tab .agp-shell-field label{',
            'font-size:13px !important;color:#f4f2fb !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'display:flex !important;flex-direction:column !important;align-items:flex-end !important;gap:3px;}',
            // Small gray sub-line under a field's label — matches the
            // design spec's two-line card copy (bold label + explanation);
            // added via addFieldDescription() below, both here and on the
            // initial settings screen.
            '.mc-field-desc{font-size:11.5px !important;font-weight:400 !important;color:#8f88a3 !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;white-space:normal !important;',
            'text-align:right;}',
            // Card wrapper for giftRevivalEnabled + its conditional fields
            // in the drawer — same "un-card" trick as .mc-settings-card on
            // the initial screen (the row inside keeps its own layout, just
            // loses its individual border/background so the group reads as
            // one card instead of a card-in-a-card).
            '.mc-drawer-card{border-radius:18px;border:1px solid rgba(255,255,255,.09);',
            'background:linear-gradient(180deg,rgba(28,24,44,.9),rgba(14,12,22,.9));',
            'margin:0 0 12px;padding:14px 16px;box-sizing:border-box;}',
            '.mc-drawer-card > .agp-shell-row{padding:0 !important;margin:0 !important;',
            'border:none !important;background:none !important;}',
            '.mc-drawer-card .mc-conditional-section{display:flex;flex-direction:column;gap:10px;',
            'margin-top:12px;padding-top:12px;border-top:1px solid rgba(255,255,255,.07);}',
            '.mc-drawer-card .mc-conditional-section .agp-shell-row{padding:0 !important;',
            'margin:0 !important;border:none !important;background:none !important;}',
            '#agp-shell-box.mc-inmatch-drawer:not(.mc-tab-players) .mc-drawer-players-tab{display:none !important;}',
            '#agp-shell-box.mc-inmatch-drawer.mc-tab-players .mc-drawer-body{display:none !important;}',
            // The shared file's ready-made player-management field stays in
            // the settings tab (instead of moving to the players tab) —
            // only its internal list/counter are hidden, and the
            // "add new lobby" button (renamed) stays visible in its
            // original DOM position.
            '#agp-shell-box.mc-inmatch-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.mc-inmatch-drawer .agp-settings-player-row{display:block !important;width:100% !important;',
            'border:none !important;background:none !important;padding:0 !important;}',
            '#agp-shell-box.mc-inmatch-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.mc-inmatch-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            // The row sits in a column with align-items:flex-start and the
            // shared file gives the actions column a fixed 220px width —
            // both are stretched so the button spans the card.
            '#agp-shell-box.mc-inmatch-drawer .agp-settings-player-actions{width:100% !important;',
            'max-width:none !important;}',
            '#agp-shell-box.mc-inmatch-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin:0 !important;display:flex !important;align-items:center;justify-content:center;gap:8px;',
            'padding:13px 14px !important;border-radius:14px !important;',
            'border:1px solid rgba(178,140,245,.4) !important;',
            'background:linear-gradient(135deg,rgba(122,63,212,.28),rgba(178,140,245,.1)) !important;',
            'color:#f0e9ff !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;font-size:13.5px !important;}',
            // ---- End-game footer button — no equivalent existed before
            // this redesign; the shared header's own 🏠 button already
            // navigates home, this just adds the spec's prominent shortcut
            // for it, reusing the exact same homeNavigate() handler.
            '.mc-drawer-footer{flex:none;padding:14px 16px;border-top:1px solid rgba(255,255,255,.08);}',
            '.mc-drawer-end-btn{width:100%;padding:13px 18px;border:1px solid transparent;cursor:pointer;',
            'border-radius:14px;background:rgba(224,115,111,.16);color:#ff9b96;',
            'font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;font-weight:700;',
            'transition:background .2s;}',
            '.mc-drawer-end-btn:hover{background:rgba(224,115,111,.28);}',
            // ---- Custom players tab (search + filter + unified list) ----
            '#mc-players-tab-search{width:100%;padding:10px 14px;border-radius:999px;',
            'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.14);color:#f4f2fb;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;font-size:13px;margin-bottom:10px;',
            'box-sizing:border-box;}',
            '#mc-players-tab-filter{display:flex;gap:5px;margin-bottom:12px;}',
            '#mc-players-tab-filter button{flex:1;padding:7px 2px;border-radius:999px;',
            'border:1px solid rgba(255,255,255,.14);background:transparent;color:#a79fbb;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;font-weight:600;font-size:11.5px;cursor:pointer;}',
            '#mc-players-tab-filter button.mc-filter-active{background:#7a3fd4;',
            'border-color:#7a3fd4;color:#f3ecff;}',
            '.mc-prow{display:flex;align-items:center;gap:8px;padding:8px 11px;margin-bottom:5px;',
            'border-radius:11px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);}',
            '.mc-prow.mc-prow-out{background:rgba(224,115,111,.05);border-color:rgba(224,115,111,.18);}',
            '.mc-prow .mc-prow-avatar{width:26px;height:26px;border-radius:50%;flex:none;overflow:hidden;}',
            '.mc-prow.mc-prow-out .mc-prow-avatar{filter:grayscale(1);}',
            '.mc-prow .mc-prow-avatar .mc-ring-avatar,.mc-prow .mc-prow-avatar .mc-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:0.7em;}',
            '.mc-prow .mc-prow-name{flex:1;font-size:12px;font-weight:400;color:#e7e9ee;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.mc-prow.mc-prow-out .mc-prow-name{color:#cfc7e2;text-decoration:line-through;',
            'text-decoration-color:#e0736f;}',
            '.mc-prow .mc-prow-status{display:none;}',
            '.mc-prow .mc-prow-action{width:20px;height:20px;border-radius:50%;border:none;',
            'color:#fff;font-weight:900;font-size:0.65em;cursor:pointer;flex:none;}',
            '.mc-prow .mc-prow-action.mc-action-eliminate{background:rgba(224,115,111,.12);color:#e0736f;}',
            '.mc-prow .mc-prow-action.mc-action-revive{background:rgba(126,224,166,.14);color:#7ee0a6;}',

            /* ================================================================
             * "Add new player" window ("إدخال لاعب جديد") — matches the
             * design spec's addOpen modal exactly: 600x900 violet glass
             * panel, gold keyword pill, 2-column chip grid. Built from the
             * shared shell's own mini-lobby fields (h2/agp-join-hint/
             * #agp-mini-lobby-list/#agp-mini-lobby-done-btn — a keyword
             * re-open + merge flow, functionally identical to the spec's
             * "type the same keyword in the comments" staged-players door),
             * only restyled here. See enhanceMiniLobby above.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.mc-mini-lobby-active){align-items:center !important;',
            'justify-content:center !important;background:rgba(3,3,6,.72) !important;',
            'padding:20px !important;}',
            '#agp-shell-box.mc-mini-lobby-active{width:600px !important;max-width:94vw !important;',
            'height:900px !important;max-height:90vh !important;margin:0 !important;',
            'padding:16px 18px 18px !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;',
            'background:rgba(20,18,32,.6) !important;backdrop-filter:blur(10px);',
            '-webkit-backdrop-filter:blur(10px);border:2px solid rgba(178,140,245,.5) !important;',
            'border-radius:24px !important;box-shadow:none !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.mc-mini-lobby-active h2{flex:none !important;text-align:center !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;font-size:15.5px !important;',
            'font-weight:700 !important;margin:0 0 12px !important;max-width:none !important;',
            'background:none !important;color:#f4f2fb !important;-webkit-text-fill-color:#f4f2fb !important;}',
            '.mc-mini-lobby-info{flex:none;margin-bottom:14px;padding:16px 18px;border-radius:18px;',
            'background:linear-gradient(135deg,rgba(122,63,212,.22),rgba(178,140,245,.08));',
            'border:1px solid rgba(178,140,245,.35);}',
            '.mc-mini-lobby-info p{margin:0;font-family:"Noto Kufi Arabic",sans-serif;font-size:14px;',
            'font-weight:600;line-height:1.9;color:#f0e9ff;}',
            '.mc-mini-lobby-info p + p{margin-top:8px;font-family:"IBM Plex Sans Arabic",sans-serif;',
            'font-size:12.5px;font-weight:400;line-height:1.85;color:#c6b4f2;}',
            '.mc-mini-lobby-close-btn{position:absolute;top:16px;left:18px;width:30px;height:30px;',
            'border-radius:9px;background:transparent;border:1px solid rgba(255,255,255,0.16);',
            'color:#cfc7e2;display:flex;align-items:center;justify-content:center;font-size:15px;',
            'cursor:pointer;z-index:3;padding:0;font-family:inherit;line-height:1;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-join-hint{flex:none !important;text-align:center;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;gap:8px;',
            'margin-bottom:14px;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-join-keyword-plain{display:inline-flex;',
            'align-items:center;gap:10px;background:rgba(214,168,60,.12) !important;',
            'border:1px solid rgba(240,205,106,.4);color:#f0cd6a !important;font-weight:900;',
            'font-family:"Cairo",sans-serif;padding:12px 20px;border-radius:999px;font-size:19px;}',
            '#agp-mini-lobby-count{display:block;color:#cfc7e2;font-size:0.75em;margin-top:4px;}',
            // Player grid — 2 columns of the same 217x57 cards as the main
            // lobby (see the lobby player-grid rules above), framed cards
            // included (enhanceLobbyFramedCards() fits them here too).
            // Hidden scrollbar; 12px top padding so first-row frames that
            // extend above their slot aren't clipped.
            '#agp-shell-box.mc-mini-lobby-active #agp-mini-lobby-list{',
            'flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;',
            // auto-fill: the 600px window fits exactly 2 columns; a phone
            // too narrow for 2 gets 1 instead of overflowing sideways.
            'display:grid !important;grid-template-columns:repeat(auto-fill,217px) !important;',
            'column-gap:37px !important;row-gap:20px !important;justify-content:center !important;',
            'justify-items:center !important;align-items:center !important;align-content:start !important;',
            'margin:0 !important;padding:12px 4px 10px !important;list-style:none;',
            'width:100% !important;box-sizing:border-box !important;',
            'scrollbar-width:none !important;-ms-overflow-style:none !important;}',
            '#agp-shell-box.mc-mini-lobby-active #agp-mini-lobby-list::-webkit-scrollbar{display:none !important;}',
            '#agp-shell-box.mc-mini-lobby-active #agp-mini-lobby-list li{position:relative;',
            'display:flex !important;align-items:center;justify-content:center;min-height:57px;padding:0 !important;',
            'border:none !important;background:none !important;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-pcard{width:217px !important;height:57px !important;',
            'box-sizing:border-box !important;padding:0 3px 0 28px !important;gap:6px !important;',
            'border-radius:24px !important;background:rgba(217,217,217,.3) !important;',
            'border:2px solid #000 !important;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-pcard-avatar-basic{width:48px !important;height:48px !important;',
            'background:#D9D9D9 !important;border:none !important;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-pcard-name-basic{flex:1 1 auto !important;width:auto !important;',
            'min-width:0 !important;height:auto !important;margin:0 !important;padding:0 !important;',
            'font-size:20px !important;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'font-weight:700 !important;color:#fff !important;background:none !important;border:none !important;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-pcard-avatar-basic--fallback{font-size:15px !important;color:#3a2f4a !important;}',
            '#agp-shell-box.mc-mini-lobby-active li:has(> .agp-pcard-tpl){width:217px !important;height:57px !important;',
            'overflow:visible !important;flex-direction:row !important;}',
            '#agp-shell-box.mc-mini-lobby-active .agp-pcard-tpl{zoom:0.7282;flex-shrink:0 !important;}',
            '#agp-shell-box.mc-mini-lobby-active #agp-mini-lobby-done-btn{flex:none !important;',
            'display:block !important;width:100% !important;margin:14px 0 0 !important;',
            'padding:13px 20px !important;font-size:14.5px !important;font-weight:700 !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;letter-spacing:0;',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'border:none !important;border-radius:14px !important;',
            'box-shadow:0 16px 34px -20px rgba(122,63,212,1) !important;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  5) Play screen DOM
     * ==================================================================== */
    var _gridRO = null;
    var _gridW = 1200, _gridH = 680;

    function ensureStage() {
        injectStyles();
        if (el('mc-stage')) return;

        var stage = document.createElement('div');
        stage.id = 'mc-stage';
        stage.innerHTML =
            '<div class="mc-topbar">' +
                '<div class="mc-brand">' +
                    '<div class="mc-brand-title">' + escapeHtml(GAME_NAME) + '</div>' +
                    '<div class="mc-brand-sub">احفظ · تذكّر · جاوب</div>' +
                '</div>' +
                '<div class="mc-top-actions">' +
                    '<button type="button" class="mc-chip" id="mc-open-settings-btn"><span style="font-size:1.15em">⚙</span>الإعدادات</button>' +
                    '<button type="button" class="mc-chip" id="mc-open-players-btn"><span style="font-size:1.05em">👥</span>أسماء اللاعبين</button>' +
                    '<div class="mc-chip"><span class="mc-chip-label">المرحلة</span><span class="mc-chip-val" id="mc-round-val" dir="ltr">0 / ' + MAX_ROUNDS + '</span></div>' +
                    '<div class="mc-chip"><span class="mc-chip-label">الصناديق</span><span class="mc-chip-val" id="mc-grid-val" dir="ltr">3</span></div>' +
                    '<div class="mc-chip mc-phase-badge" id="mc-phase-badge">' + LABELS.idle + '</div>' +
                    '<button type="button" class="mc-chip" id="mc-mute-btn" title="الصوت">🔊</button>' +
                '</div>' +
            '</div>' +
            '<div class="mc-main" id="mc-main">' +
                '<div class="mc-game-col">' +
                    '<div class="mc-card mc-head">' +
                        '<div class="mc-head-text" id="mc-head-text"></div>' +
                        '<div class="mc-timer" id="mc-timer" style="display:none"><span class="mc-timer-num" id="mc-timer-num">0</span><span class="mc-timer-lbl">ثانية</span></div>' +
                        '<button type="button" class="mc-primary-btn" id="mc-next-btn" style="display:none"></button>' +
                    '</div>' +
                    '<div class="mc-bar"><div class="mc-bar-fill" id="mc-bar-fill"></div></div>' +
                    '<div id="mc-grid-wrap"><div id="mc-grid"></div></div>' +
                '</div>' +
                '<div class="mc-panel">' +
                    '<div class="mc-stats">' +
                        '<div class="mc-card mc-stat"><span class="mc-stat-lbl">المتبقين</span><span class="mc-stat-val" id="mc-stat-alive" style="color:' + ACC + '">0</span></div>' +
                        '<div class="mc-card mc-stat"><span class="mc-stat-lbl">جاوبوا</span><span class="mc-stat-val" id="mc-stat-answered">0</span></div>' +
                        '<div class="mc-card mc-stat"><span class="mc-stat-lbl">خرجوا</span><span class="mc-stat-val" id="mc-stat-out" style="color:#FF6B6B">0</span></div>' +
                    '</div>' +
                    '<div class="mc-lists">' +
                        '<div class="mc-card mc-list-card">' +
                            '<div class="mc-list-head"><span style="font-weight:600;color:' + ACC + '">المتأهلين</span><span style="color:#9A92B3" id="mc-alive-more">0</span></div>' +
                            '<div class="mc-list-body" id="mc-alive-list"></div>' +
                        '</div>' +
                        '<div class="mc-card mc-list-card">' +
                            '<div class="mc-list-head"><span style="font-weight:600;color:#FF6B6B">آخر المقصيين</span></div>' +
                            '<div class="mc-list-body" id="mc-out-list"></div>' +
                        '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
        document.body.appendChild(stage);

        var elimOverlay = document.createElement('div');
        elimOverlay.id = 'mc-elim-overlay';
        elimOverlay.innerHTML =
            '<div id="mc-elim-box">' +
                '<div class="mc-elim-head">' +
                    '<div class="mc-elim-title"><span>المقصيين بهذي الجولة</span><span class="mc-elim-count" id="mc-elim-count">0</span></div>' +
                    '<button type="button" class="mc-x-btn" id="mc-elim-close" title="إغلاق">✕</button>' +
                '</div>' +
                '<div id="mc-elim-grid"></div>' +
            '</div>';
        document.body.appendChild(elimOverlay);
        elimOverlay.addEventListener('click', function (e) { if (e.target === elimOverlay) closeElim(true); });
        el('mc-elim-close').onclick = function () { closeElim(true); };

        el('mc-open-settings-btn').onclick = function () { Sfx.play('click'); openDrawer('settings'); };
        el('mc-open-players-btn').onclick = function () { Sfx.play('click'); openDrawer('players'); };
        el('mc-mute-btn').onclick = function () {
            Sfx.muted = !Sfx.muted;
            if (!Sfx.muted) Sfx.play('click');
            renderTop();
        };
        el('mc-next-btn').onclick = function () { primary(); };

        _gridRO = window.ResizeObserver ? new ResizeObserver(function (entries) {
            var r = entries[0].contentRect;
            _gridW = r.width; _gridH = r.height;
            layoutGrid();
        }) : null;
        if (_gridRO) _gridRO.observe(el('mc-grid-wrap'));
        window.addEventListener('resize', function () { renderLayout(); if (!_gridRO) layoutGrid(); });

        window.addEventListener('keydown', function (e) {
            if (e.code !== 'Space' && e.code !== 'Enter') return;
            if (!_matchActive || _elimOpen) return;
            var shell = el('agp-shell-overlay');
            if (shell && shell.style.display !== 'none') return;
            var modal = el('mc-modal-overlay');
            if (modal && modal.style.display === 'flex') return;
            if (/INPUT|TEXTAREA|BUTTON/.test(e.target.tagName)) return;
            e.preventDefault();
            primary();
        });
    }

    // Top-bar "الإعدادات"/"أسماء اللاعبين" both open the shared in-match
    // settings drawer (same one the header's ⚙ button opens), on the
    // matching tab.
    function openDrawer(tab) {
        _mcDrawerTab = tab;
        var gear = el('agp-header-settings-btn');
        if (gear) gear.click();
    }

    function renderLayout() {
        var main = el('mc-main');
        if (!main) return;
        var vw = window.innerWidth, vh = window.innerHeight;
        main.classList.toggle('mc-narrow', vw < 800 || vw / vh < 1.25);
    }

    function buildGrid() {
        var grid = el('mc-grid');
        if (!grid) return;
        grid.innerHTML = _cells.map(function (c) {
            return '<div class="mc-cell">' +
                '<div class="mc-cell-inner">' +
                    '<div class="mc-face mc-face-front"><span class="mc-num">' + c.n + '</span></div>' +
                    '<div class="mc-face mc-face-back"><span class="mc-cell-emoji mc-emoji">' + c.e + '</span><span class="mc-badge">' + c.n + '</span></div>' +
                '</div>' +
                '<span class="mc-count"></span>' +
            '</div>';
        }).join('');
        layoutGrid();
    }

    function gridMetrics() {
        var gap = Math.round(Math.max(6, Math.min(16, Math.min(_gridW, _gridH) * 0.022)));
        var cellSize = Math.max(30, Math.floor(Math.min((_gridW - gap * (_cols - 1)) / _cols, (_gridH - 16 - gap * (_rows - 1)) / _rows)));
        return { gap: gap, cellSize: cellSize };
    }

    function layoutGrid() {
        var grid = el('mc-grid');
        if (!grid) return;
        var m = gridMetrics();
        grid.style.width = (_cols * m.cellSize + (_cols - 1) * m.gap) + 'px';
        grid.style.gap = m.gap + 'px';
        var radius = Math.round(m.cellSize * 0.16);
        var emojiSize = Math.round(m.cellSize * 0.52);
        var numSize = Math.round(m.cellSize * 0.42);
        var badgeSize = Math.max(12, Math.round(m.cellSize * 0.12));
        Array.prototype.forEach.call(grid.children, function (cell) {
            cell.style.width = m.cellSize + 'px';
            cell.style.height = m.cellSize + 'px';
            cell.querySelectorAll('.mc-face').forEach(function (f) { f.style.borderRadius = radius + 'px'; });
            cell.querySelector('.mc-num').style.fontSize = numSize + 'px';
            cell.querySelector('.mc-cell-emoji').style.fontSize = emojiSize + 'px';
            cell.querySelector('.mc-badge').style.fontSize = badgeSize + 'px';
            cell.querySelector('.mc-count').style.fontSize = badgeSize + 'px';
        });
    }

    // Per-cell visual state — same rules as the design handoff's cells map.
    function renderCells() {
        var grid = el('mc-grid');
        if (!grid) return;
        var res = _result, n = _cells.length, step = stepFor(n) * 1000;
        Array.prototype.forEach.call(grid.children, function (cellEl, i) {
            var c = _cells[i];
            if (!c) return;
            var isCorrect = _phase === 'reveal' && res && c.n === res.correct;
            var open = !!c.e && ((_phase === 'memorize' && _anim === 'in') || _phase === 'over' || isCorrect);
            var count = _phase === 'reveal' && res ? (res.counts[c.n] || 0) : 0;
            var stag = (_phase === 'memorize' && _anim === 'in') || _phase === 'question' || _phase === 'over';
            var d = stag ? Math.round(i * step) : 0;

            var fBg = '#130E22', fBorder = '#2E2448', numColor = '#3B3257', fShadow = '0 6px 0 #05030A';
            if (_phase === 'memorize') { fBg = '#1A1430'; numColor = '#7A7196'; }
            else if (_phase === 'question') { fBg = '#150F28'; fBorder = 'color-mix(in oklch, ' + ACC + ' 45%, #2E2448)'; numColor = ACC; }
            else if (_phase === 'reveal') { fBg = '#0F0B1B'; fBorder = count ? '#4A2226' : '#1E1733'; numColor = '#4A4166'; fShadow = '0 3px 0 #05030A'; }

            cellEl.style.transform = isCorrect ? 'translateY(-8px) scale(1.04)' : 'none';
            cellEl.style.opacity = _phase === 'reveal' && !isCorrect ? '0.72' : '1';

            var inner = cellEl.querySelector('.mc-cell-inner');
            inner.style.transition = _anim === 'enter' ? 'none' : ('transform .5s cubic-bezier(.3,.7,.35,1.25) ' + d + 'ms');
            inner.style.transform = 'rotateY(' + (open ? 180 : 0) + 'deg)';

            var front = cellEl.querySelector('.mc-face-front');
            front.style.background = fBg;
            front.style.borderColor = fBorder;
            front.style.boxShadow = fShadow;
            cellEl.querySelector('.mc-num').style.color = numColor;

            var back = cellEl.querySelector('.mc-face-back');
            back.style.background = isCorrect ? ACC : '#1A1430';
            back.style.borderColor = isCorrect ? ACC_DARK : '#2E2448';
            back.style.boxShadow = isCorrect ? '0 8px 0 ' + ACC_DARK : '0 6px 0 #05030A';
            cellEl.querySelector('.mc-badge').style.color = isCorrect ? INK : '#7A7196';

            var countEl = cellEl.querySelector('.mc-count');
            if (count > 0) {
                countEl.style.display = 'inline-block';
                countEl.textContent = (isCorrect ? '✓ ' : '✗ ') + count;
                countEl.style.background = isCorrect ? 'rgba(0,0,0,.25)' : '#3A1F22';
                countEl.style.color = isCorrect ? INK : '#FF6B6B';
            } else {
                countEl.style.display = 'none';
            }
        });
    }

    function renderTop() {
        var rv = el('mc-round-val'); if (rv) rv.textContent = _round + ' / ' + MAX_ROUNDS;
        var gv = el('mc-grid-val'); if (gv) gv.textContent = String(_cells.length || boxesForRound(Math.max(1, _round)));
        var pb = el('mc-phase-badge'); if (pb) pb.textContent = LABELS[_phase] || '';
        var mb = el('mc-mute-btn'); if (mb) mb.textContent = Sfx.muted ? '🔇' : '🔊';
    }

    function renderHead() {
        var box = el('mc-head-text');
        if (!box) return;
        var html = '';
        var res = _result;
        if (_phase === 'memorize') {
            html = '<div class="mc-h-big">احفظ مكان كل إيموجي</div>' +
                '<div class="mc-h-sub">المربعات بتتغطى بعد لحظات</div>';
        } else if (_phase === 'question') {
            var emoji = (_cells[_target] || {}).e || '';
            html = '<div class="mc-q-row"><span class="mc-q-word">' + escapeHtml(_q[0]) + '</span>' +
                '<span class="mc-q-emoji mc-emoji">' + emoji + '</span>' +
                '<span class="mc-q-word">' + escapeHtml(_q[1]) + '</span></div>' +
                '<div class="mc-h-sub">اكتب رقم المربع في الشات · أول إجابة هي اللي تنحسب</div>';
        } else if (_phase === 'reveal' && res) {
            html = '<div class="mc-reveal-row mc-h-mid"><span>الجواب الصحيح</span><span class="mc-correct-pill">' + res.correct + '</span></div>';
            if (res.tie) html += '<div class="mc-tie-line">ما أحد جاوب صح · الكل يكمل للمرحلة الجاية</div>';
            else if (res.noAns) html += '<div class="mc-noans-line">ما فيه لاعبين أو ما وصلت أي إجابة</div>';
            else html += '<div class="mc-res-line"><span style="color:' + ACC + '">✓ ' + res.survived + ' تأهلوا</span>' +
                '<span style="color:#5E567A">·</span><span style="color:#FF6B6B">✗ ' + res.out + ' خرجوا</span></div>';
        } else if (_phase === 'over') {
            html = '<div class="mc-h-mid">انتهت اللعبة</div>' +
                '<div class="mc-h-sub">' + (_winners.length === 1 ? 'بقى لاعب واحد بس' :
                    (_winners.length > 1 ? 'خلصت الجولات · ' + _winners.length + ' فائزين' : 'بدون فائز')) + '</div>';
        } else {
            html = '<div class="mc-h-big">بانتظار بداية اللعبة</div>';
        }
        if (box.innerHTML !== html) box.innerHTML = html;

        var showTimer = _phase === 'memorize' || _phase === 'question';
        el('mc-timer').style.display = showTimer ? 'flex' : 'none';
        var nextBtn = el('mc-next-btn');
        nextBtn.style.display = _phase === 'reveal' ? 'inline-block' : 'none';
        if (_phase === 'reveal') {
            nextBtn.textContent = res && res.final ? (_alive.length > 1 ? 'عرض الفائزين' : 'عرض الفائز') : 'ابدأ الجولة التالية';
        }
        renderTimer();
    }

    function renderTimer() {
        var showTimer = _phase === 'memorize' || _phase === 'question';
        var barColor = _phase === 'question' && _t <= 5 ? '#FF4D4D' : ACC;
        var tn = el('mc-timer-num');
        if (tn) { tn.textContent = String(Math.max(0, Math.ceil(_t))); tn.style.color = barColor; }
        var tb = el('mc-timer'); if (tb) tb.style.borderColor = barColor;
        var fill = el('mc-bar-fill');
        if (fill) {
            fill.style.width = (showTimer ? Math.max(0, _t / _tMax * 100) : 0) + '%';
            fill.style.background = barColor;
        }
        var ans = el('mc-stat-answered'); if (ans) ans.textContent = String(Object.keys(_answers).length);
    }

    function renderPanel() {
        var aliveNames = _alive.map(playerLabel);
        var aliveEl = el('mc-stat-alive'); if (aliveEl) aliveEl.textContent = String(_alive.length);
        var outEl = el('mc-stat-out'); if (outEl) outEl.textContent = String(_eliminated.length);
        var more = el('mc-alive-more'); if (more) more.textContent = _alive.length > 40 ? '+' + (_alive.length - 40) : String(_alive.length);
        var list = el('mc-alive-list');
        if (list) {
            var h = aliveNames.slice(-40).reverse().map(function (n) { return '<span dir="ltr" class="mc-name-chip">' + escapeHtml(n) + '</span>'; }).join('');
            if (list.innerHTML !== h) list.innerHTML = h;
        }
        var outList = el('mc-out-list');
        if (outList) {
            var h2 = _outLog.map(function (n) { return '<span dir="ltr" class="mc-name-chip mc-out">' + escapeHtml(n) + '</span>'; }).join('');
            if (outList.innerHTML !== h2) outList.innerHTML = h2;
        }
        renderTimer();
    }

    function renderAll() {
        renderLayout();
        renderTop();
        renderHead();
        renderCells();
        renderPanel();
    }

    /* ---- "Eliminated this round" window ---- */
    function openElim() {
        if (!_result || !_result.outs || !_result.outs.length) return;
        var grid = el('mc-elim-grid');
        el('mc-elim-count').textContent = String(_result.outs.length);
        grid.innerHTML = _result.outs.map(function (p) {
            var name = playerLabel(p);
            var hh = 0;
            for (var i = 0; i < name.length; i++) hh = (hh * 31 + name.charCodeAt(i)) | 0;
            var hue = Math.abs(hh) % 360;
            var initial = (name.replace(/[^\p{L}\p{N}]/gu, '').charAt(0) || '?').toUpperCase();
            var av = p.avatarUrl;
            var style = 'background-color:oklch(0.45 0.12 ' + hue + ');' +
                (av ? 'background-image:url(&quot;' + escapeHtml(av) + '&quot;);filter:grayscale(.6);' : '');
            return '<div class="mc-elim-card">' +
                '<div class="mc-elim-av-wrap">' +
                    '<div class="mc-elim-av" style="' + style + '">' + (av ? '' : '<span>' + escapeHtml(initial) + '</span>') + '</div>' +
                    '<span class="mc-elim-x">✕</span>' +
                '</div>' +
                '<span dir="ltr" class="mc-elim-name">' + escapeHtml(name) + '</span>' +
            '</div>';
        }).join('');
        el('mc-elim-overlay').classList.add('mc-show');
        _elimOpen = true;
    }

    function closeElim(withClick) {
        clearTimeout(_elimTimer);
        var ov = el('mc-elim-overlay');
        if (ov) ov.classList.remove('mc-show');
        if (withClick && _elimOpen) Sfx.play('click');
        _elimOpen = false;
    }

    /* ======================================================================
     *  6) Game flow — memorize -> question -> reveal, up to MAX_ROUNDS
     * ==================================================================== */
    function primary() {
        Sfx.play('click');
        advance();
    }

    function startRound() {
        closeElim(false);
        _round += 1;
        var n = boxesForRound(_round);
        var size = layoutFor(n);
        _cols = size[0]; _rows = size[1];
        _cells = shuffle(EMOJIS).slice(0, n).map(function (e, i) { return { n: i + 1, e: e }; });
        _target = Math.floor(Math.random() * n);
        _q = QS[Math.floor(Math.random() * QS.length)];
        var mem = memTime();
        _t = mem; _tMax = mem;
        _answers = {};
        _result = null;
        _lastSec = null;
        _phase = 'memorize';
        _anim = 'enter';
        buildGrid();
        renderAll();
        _busyUntil = performance.now() + 40 + (n * stepFor(n) + 0.5) * 1000;
        setTimeout(function () {
            if (_phase !== 'memorize') return;
            _anim = 'in';
            renderCells();
        }, 40);
        Sfx.play('start');
        Sfx.play('pops', n);
    }

    function toQuestion() {
        var a = answerTime();
        _lastSec = null;
        var n = _cells.length;
        _busyUntil = performance.now() + (n * stepFor(n) + 0.5) * 1000;
        _phase = 'question';
        _t = a; _tMax = a;
        _answers = {};
        renderAll();
        Sfx.play('cover', n);
    }

    function resolve() {
        var correct = _target + 1;
        var survivors = _alive.filter(function (p) { return _answers[p.id] === correct; });
        var outs = _alive.filter(function (p) { return _answers[p.id] !== correct; });
        // Nobody answered correctly -> nobody is eliminated this round.
        var tie = survivors.length === 0 && outs.length > 0;
        var noAns = survivors.length === 0 && outs.length === 0;
        if (!tie) {
            outs.forEach(function (p) { _eliminated.push({ player: p, round: _round }); });
            _alive = survivors;
            _outLog = outs.map(playerLabel).concat(_outLog).slice(0, 40);
        }
        var counts = {};
        Object.keys(_answers).forEach(function (id) { var v = _answers[id]; counts[v] = (counts[v] || 0) + 1; });
        // The match ends when one player (or none) is left, or after the
        // last round — whoever is still alive then wins (can be several).
        var final = _alive.length <= 1 || _round >= MAX_ROUNDS;
        _result = {
            correct: correct, survived: survivors.length, out: tie ? 0 : outs.length,
            tie: tie, noAns: noAns, counts: counts, final: final, outs: tie ? [] : outs
        };
        _phase = 'reveal';
        _t = 0; _tMax = 1;
        renderAll();
        clearTimeout(_elimTimer);
        if (!tie && outs.length) {
            _elimTimer = setTimeout(function () { if (_phase === 'reveal') openElim(); }, 1400);
        }
        Sfx.play('timeup');
        Sfx.play('correct');
        if (tie) Sfx.play('tie');
        else if (outs.length) Sfx.play('out');
    }

    function advance() {
        if (!_matchActive) return;
        if (_phase === 'memorize') return toQuestion();
        if (_phase === 'question') return resolve();
        if (_phase === 'reveal') {
            if (_result && _result.final) return finishMatch();
            return startRound();
        }
    }

    function tick() {
        if (!_matchActive) return;
        if (_phase !== 'memorize' && _phase !== 'question') return;
        if (_busyUntil && performance.now() < _busyUntil) return;
        var t = +(_t - 0.1).toFixed(2);
        var sec = Math.ceil(t);
        if (sec !== _lastSec) {
            _lastSec = sec;
            if (_phase === 'question' && sec <= 5 && sec > 0) Sfx.play('tick', sec <= 3 ? 1 : 0);
            if (_phase === 'memorize' && sec <= 3 && sec > 0) Sfx.play('tick', 0);
        }
        if (t <= 0) { _t = 0; advance(); }
        else { _t = t; renderTimer(); }
    }

    /* ---- Chat answers: the square's number, first answer counts ---- */
    function wireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_matchActive || _phase !== 'question' || !payload || typeof payload.text !== 'string') return;
            var m = normalizeDigits(payload.text.trim()).match(/^!?\s*(\d{1,2})$/);
            if (!m) return;
            var player = _alive.filter(function (p) { return p.id === payload.id; })[0] ||
                _alive.filter(function (p) { return payload.name && p.name === payload.name; })[0];
            if (!player || _answers[player.id] != null) return;
            var n = +m[1];
            if (n < 1 || n > _cells.length) return;
            _answers[player.id] = n;
            var now = performance.now();
            if (!_lastBlip || now - _lastBlip > 70) { _lastBlip = now; Sfx.play('answer'); }
            renderTimer();
        });
    }

    /* ======================================================================
     *  7) Roster changes during a match
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);
        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);
        if (aliveIdx === -1 && elimIdx === -1) return;
        delete _answers[removedPlayer.id];
        renderPanel();
        checkEarlyEnd();
    }

    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        var already = _alive.some(function (p) { return p.id === newPlayer.id; }) ||
            _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (already) return;
        _alive.push(newPlayer);
        renderPanel();
    }

    // One player (or none) left because of a manual action — ends the match
    // right away, same as Elimination Roulette.
    function checkEarlyEnd() {
        if (_matchActive && _phase !== 'over' && _alive.length <= 1) finishMatch();
    }

    /* ======================================================================
     *  8) Match end + points + winner screen
     * ==================================================================== */
    function finishMatch() {
        if (!_matchActive) return;
        closeElim(false);
        _winners = _alive.slice();
        _phase = 'over';
        renderAll();
        endMatch(_winners);
    }

    function endMatch(winners) {
        _matchActive = false;
        Sfx.play('win');
        if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }

        var winnerIds = {};
        winners.forEach(function (p) { winnerIds[p.id] = true; });
        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var participants = AGP.gameManager.getPlayers().map(function (p) {
                return { tiktokUsername: tiktokUsernameFor(p), won: Boolean(winnerIds[p.id]) };
            }).filter(function (p) { return p.tiktokUsername; });
            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });

        pointsPromise.then(function (pointsResult) {
            renderWinnerScreen(winners, pointsResult);
        });
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
            piece.className = 'mc-confetti-piece';
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

    function ensureModal() {
        injectStyles();
        if (!el('mc-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'mc-modal-overlay';
            overlay.innerHTML = '<div id="mc-modal-box"></div>';
            document.body.appendChild(overlay);
        }
    }

    /**
     * Winner screen — Elimination Roulette's layout: blurred game screen
     * behind, no panel, one shared trophy card per winner (a single winner,
     * or everyone still alive after the last round), confetti, and the same
     * three buttons (back to platform / new match / replay same players).
     */
    function renderWinnerScreen(winners, pointsResult) {
        ensureModal();
        var overlay = el('mc-modal-overlay');
        var box = el('mc-modal-box');
        var roundsText = 'صمد ' + _round + ' ' + (_round === 1 ? 'جولة' : 'جولات');

        var cardsHtml = winners.map(function (w, i) {
            return AGP.playerCard.renderTrophyCard(w, {
                cls: 'mc-trophy-winner', kind: 'winner', cardId: 'mc-trophy-card-' + i,
                showCrown: true,
                extra: '<div class="agp-trophy-extra mc-rounds-line">' + escapeHtml(roundsText) + '</div>',
                pointsHtml: pointsHtmlFor(pointsResult, w)
            });
        }).join('');

        var title = winners.length > 1
            ? '🏁 انتهت المباراة .. الفائزين بلعبة "' + escapeHtml(GAME_NAME) + '" (' + winners.length + ')'
            : '🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "' + escapeHtml(GAME_NAME) + '"';

        box.className = 'mc-winner-panel';
        overlay.classList.add('mc-winner-backdrop');
        box.innerHTML =
            '<div id="mc-winner-box">' +
            '<h2>' + title + '</h2>' +
            '<div class="mc-trophy-cards">' + (cardsHtml || '<p style="color:#fff;font-weight:800;">بدون فائز</p>') + '</div>' +
            '<div class="mc-winner-actions">' +
            '<button class="mc-btn-secondary" id="mc-home-btn">⬅️ رجوع لمنصة الألعاب</button>' +
            '<button class="mc-btn-secondary" id="mc-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '<button class="mc-btn-secondary" id="mc-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '</div></div>';

        el('mc-replay-same-btn').onclick = handleReplaySamePlayers;
        el('mc-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession();
            window.location.reload();
        };
        el('mc-home-btn').onclick = homeNavigate;

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            winners.slice(0, 12).forEach(function (w, i) {
                spawnConfetti(el('mc-trophy-card-' + i), winners.length > 1 ? 18 : 28);
            });
        }, 120);
    }

    // Replay with the same roster (everyone from the finished match,
    // winners and eliminated alike) — a fully new match, straight to round 1.
    function handleReplaySamePlayers() {
        var roster = _alive.concat(_eliminated.map(function (e) { return e.player; }));
        if (!roster.length) return;
        var overlay = el('mc-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        resetMatchState();
        _alive = roster;
        beginMatch();
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    function beginMatch() {
        ensureStage();
        _startedAt = Date.now();
        _matchActive = true;
        _round = 0;
        wireCommentListener();
        if (!_tickIv) _tickIv = setInterval(tick, 100);
        startRound();
    }

    function handleStartRound() {
        resetMatchState();
        _alive = AGP.gameManager.getPlayers().slice();
        beginMatch();
    }

    /* ======================================================================
     *  9) Settings fields (shared agp-game-shell.js)
     * ==================================================================== */
    function buildSettingsFields() {
        return [
            {
                key: 'maxPlayers', type: 'counter', label: '👥 كم الحد الأقصى لعدد اللاعبين',
                min: 2, default: 20
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
                key: 'memorizeSeconds', type: 'pill-group', label: '👀 مدة عرض الإيموجيز',
                description: 'كم ثانية تظهر الإيموجيز قبل ما تتغطى المربعات',
                options: MEM_TIME_OPTIONS, default: 10
            },
            {
                key: 'answerSeconds', type: 'pill-group', label: '⏱️ وقت الإجابة',
                description: 'الوقت المتاح لكتابة رقم المربع في الشات',
                options: ANSWER_TIME_OPTIONS, default: 15
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
     *  10) Enhancements for the shared settings/lobby screens — copied from
     *      Elimination Roulette (same MutationObserver technique, "mc-"
     *      prefix), so this game's settings screen, lobby, in-match drawer
     *      and "add new player" window look exactly like that game's.
     *      Zero edits to js/agp-game-shell.js.
     * ==================================================================== */

    // Initial settings screen layout — same structure as Elimination
    // Roulette's layoutInitialSettingsFields(): a hidden-scrollbar column
    // of field rows + a fixed footer with the connect button.
    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.mc-settings-footer')) return;

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
        var memRow = rowFor('[data-key="memorizeSeconds"]');
        var answerRow = rowFor('[data-key="answerSeconds"]');

        var scroll = document.createElement('div');
        scroll.className = 'mc-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'mc-settings-scroll-inner';
        scroll.appendChild(scrollInner);

        [usernameField, keywordField, maxPlayersRow, followersRow]
            .filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        // "Card" section — the two round-timing rows together.
        if (memRow || answerRow) {
            var timingCard = document.createElement('div');
            timingCard.className = 'mc-settings-card';
            [memRow, answerRow].filter(Boolean).forEach(function (fieldEl) { timingCard.appendChild(fieldEl); });
            scrollInner.appendChild(timingCard);
        }

        var fade = document.createElement('div');
        fade.className = 'mc-settings-fade';
        var glowline = document.createElement('div');
        glowline.className = 'mc-settings-glowline';
        scroll.appendChild(fade);
        scroll.appendChild(glowline);
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'mc-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../games.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'mc-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    // Appends a small gray explanation line under a field's label, matching
    // the design specs' two-line card copy (bold label + sub-description) —
    // used on both the initial settings screen and the mid-match drawer,
    // each with its own screen-appropriate wording. Idempotent (checks for
    // an existing .mc-field-desc first) since both screens rebuild these
    // rows from scratch on every render.
    function addFieldDescription(row, text) {
        if (!row) return;
        var label = row.querySelector('.agp-shell-row-label') || row.querySelector('label');
        if (!label || label.querySelector('.mc-field-desc')) return;
        var desc = document.createElement('span');
        desc.className = 'mc-field-desc';
        desc.textContent = text;
        label.appendChild(desc);
    }

    // "Back to platform" link on the initial settings screen (before
    // connecting to the stream) — in addition to the persistent header's
    // own 🏠 icon.
    //
    // Telling apart the initial settings screen from the one reopened
    // mid-match (the ⚙️ gear button): both use the same #agp-shell-box
    // with no distinguishing class from the shared file itself, so we
    // check for #agp-tiktok-username (present only on the initial screen
    // — renderSettingsScreen never builds it when isReopened=true). The
    // new layout (rounded cards, fixed footer) applies only to the
    // initial screen — the mid-match reopened settings keep their current
    // look, outside the scope of this change.
    function enhanceSettingsScreen() {
        var box = el('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box') ||
            document.getElementById('agp-mini-lobby-list')) return;
        var isInitial = !!el('agp-tiktok-username');
        box.classList.toggle('mc-settings-initial-box', isInitial);
        if (isInitial) {
            layoutInitialSettingsFields(box);
        }
        if (box.querySelector('.mc-back-to-platform-btn')) return;
        // Not on the mid-match settings drawer (it has the player list):
        // there the first .agp-shell-btn-connect is the "add new player"
        // button, and the header's own 🏠 icon already covers going home.
        if (el('agp-settings-player-list')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
        if (!connectBtn) return;
        var backBtn = makeBackToPlatformBtn();
        // The initial settings screen specifically uses "العودة للمنصة ←"
        // instead of the default "🏠 رجوع لمنصة ألعاب أيمن" — only this
        // element's text is changed after creation here, not
        // makeBackToPlatformBtn()/homeNavigate() themselves (those stay
        // shared and unchanged for the lobby screen), so the lobby's own
        // matching button is unaffected.
        if (isInitial) backBtn.textContent = 'العودة للمنصة ←';
        connectBtn.insertAdjacentElement('afterend', backBtn);
    }

    // Lobby heading — replaces the shared file's default h2 text with the
    // new design's title (لوبي الدخول للعبة "روليت الإقصاء"). DOM-only
    // change (h2 text) — no touch to js/agp-game-shell.js. Set once
    // (guarded by data-mc-heading).
    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;

        if (h2.getAttribute('data-mc-heading') !== '1') {
            h2.textContent = 'لوبي الدخول للعبة "' + GAME_NAME + '"';
            h2.setAttribute('data-mc-heading', '1');
        }
    }

    // Framed lobby cards, shown whole: the shared renderer draws every
    // framed card 298x100 and crops tall frame artwork to that height. For
    // each framed card in the lobby this measures the frame image's
    // opaque (alpha) rows once per image, re-expands the card to cover
    // the full artwork plus the avatar/name (shifting every absolutely
    // positioned child by the same amount, so their alignment is
    // unchanged), then zooms it to fit the 217px-wide grid slot and at
    // most 75px tall. DOM/style-only — js/agp-player-card.js untouched.
    var FRAMED_SLOT_W = 217;
    var FRAMED_SLOT_MAX_H = 75;
    var _mcFrameBoundsCache = {};

    function getFrameOpaqueRows(src) {
        if (_mcFrameBoundsCache[src]) return _mcFrameBoundsCache[src];
        _mcFrameBoundsCache[src] = new Promise(function (resolve) {
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
        return _mcFrameBoundsCache[src];
    }

    function enhanceLobbyFramedCards() {
        var box = el('agp-shell-box');
        // The main lobby and the mid-match "add new lobby" window
        // (#agp-mini-lobby-list) both show the same 217x57 cards.
        if (!box || !(box.classList.contains('agp-lobby-box') || el('agp-mini-lobby-list'))) return;
        var cards = box.querySelectorAll('.agp-shell-player-list .agp-pcard-tpl:not([data-mc-fit])');
        Array.prototype.forEach.call(cards, function (card) {
            var frameEl = card.querySelector('.agp-pcard-tpl-frame-img');
            var m = frameEl && /url\(["']?(.*?)["']?\)/.exec(frameEl.style.backgroundImage);
            if (!m) return;
            card.setAttribute('data-mc-fit', 'pending');
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
                card.setAttribute('data-mc-fit', '1');
            });
        });
    }

    // Transparent "Ayman Games" logo watermark in the middle of the lobby
    // box, plus the bottom action row with exactly two buttons: the
    // original start button (same element and onclick defined in the
    // shared file, just new text/color) and "back to the games library"
    // (navigates to games.html).
    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#mc-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'mc-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;

        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.mc-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'mc-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);
            row.appendChild(startBtn); // moves the original element (same onclick) into the new row

            // Keeps --mc-actions-h (used by the card grid's CSS to scroll
            // underneath this row) equal to the row's real height + top
            // margin, which grows when the buttons wrap on narrow screens.
            var syncActionsHeight = function () {
                box.style.setProperty('--mc-actions-h',
                    (row.offsetHeight + (parseFloat(getComputedStyle(row).marginTop) || 0)) + 'px');
            };
            syncActionsHeight();
            if (window.ResizeObserver) new ResizeObserver(syncActionsHeight).observe(row);
        }

        // "Back to the games library" joins the same row (uniform W360xH48)
        // instead of a separate element below it. Same look as the
        // settings screen's back button, but navigates to the games
        // library page (games.html) instead of homeNavigate().
        if (!row.querySelector('.mc-back-to-platform-btn')) {
            var backBtn = document.createElement('button');
            backBtn.type = 'button';
            backBtn.className = 'mc-back-to-platform-btn';
            backBtn.textContent = '🏠 العودة لمكتبة الألعاب';
            backBtn.addEventListener('click', function () {
                window.location.href = '../../games.html';
            });
            row.appendChild(backBtn);
        }
    }

    // Mid-match settings drawer — the players tab uses the same layout as
    // Tribe Roulette's actual renderReopenedPlayersTab: search + filter
    // (all/active/eliminated) + one unified list combining _alive and
    // _eliminated (everyone who took part in the match, unlike the lobby
    // list). Each active row gets a red × button (a quiet manual
    // elimination) and each eliminated row gets a green ↩ button (an
    // immediate manual revival, without checking _friendRevivedIds). This
    // replaces the old design (embedding the shared file's ready-made
    // player-management element as-is) for this part only — the rest of
    // the drawer (header/tabs/settings fields) is unchanged.
    var _mcDrawerTab = 'settings';
    var _mcPlayersTabFilter = 'all';

    function enhanceReopenedDrawer() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-settings-player-list')) return;
        box.classList.remove('mc-mini-lobby-active');
        box.classList.add('mc-inmatch-drawer');
        box.classList.toggle('mc-tab-players', _mcDrawerTab === 'players');

        if (box.firstElementChild && box.firstElementChild.classList.contains('mc-drawer-header')) {
            box.querySelectorAll('.mc-drawer-tabs button').forEach(function (b) {
                b.classList.toggle('mc-tab-active', b.getAttribute('data-tab') === _mcDrawerTab);
            });
            if (_mcDrawerTab === 'players') renderReopenedPlayersTab();
            return;
        }

        var originalChildren = Array.prototype.slice.call(box.children);
        var closeBtn = document.getElementById('agp-settings-close-btn');
        var h2 = originalChildren.filter(function (n) { return n.tagName === 'H2'; })[0];
        var fieldNodes = originalChildren.filter(function (n) { return n !== closeBtn && n !== h2; });
        box.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'mc-drawer-header';
        if (h2) {
            // Matches handoff_roulette_recent_features/Roulette.dc.html's
            // settingsOpen panel exactly ("الإعدادات" alone) — the shared
            // file's own default ("إعدادات لعبة روليت الإقصاء") is the
            // right title for the *initial* pre-match screen, not this
            // mid-match panel.
            h2.textContent = 'الإعدادات';
            header.appendChild(h2);
        }
        if (closeBtn) header.appendChild(closeBtn);
        box.appendChild(header);

        var tabs = document.createElement('div');
        tabs.className = 'mc-drawer-tabs';
        // Order matches the design spec exactly (اللاعبون first in the DOM
        // — rightmost in this RTL page — then الإعدادات), plain labels
        // with no emoji.
        tabs.innerHTML =
            '<button type="button" data-tab="players">اللاعبون</button>' +
            '<button type="button" data-tab="settings">الإعدادات</button>';
        tabs.querySelectorAll('button').forEach(function (btn) {
            btn.classList.toggle('mc-tab-active', btn.getAttribute('data-tab') === _mcDrawerTab);
            btn.onclick = function () {
                _mcDrawerTab = btn.getAttribute('data-tab');
                box.classList.toggle('mc-tab-players', _mcDrawerTab === 'players');
                tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('mc-tab-active', b === btn); });
                if (_mcDrawerTab === 'players') renderReopenedPlayersTab();
            };
        });
        box.appendChild(tabs);

        // ---- Scrollable body: "إدخال لاعب جديد", the two round-timing
        // fields (take effect from the next round) and the volume slider.
        // maxPlayers/followersOnly are pre-match-only and stay on the
        // initial settings screen, same as Elimination Roulette. ----
        function findFieldNode(selector) {
            for (var i = 0; i < fieldNodes.length; i++) {
                if (fieldNodes[i].querySelector && fieldNodes[i].querySelector(selector)) return fieldNodes[i];
            }
            return null;
        }
        var playerMgmtRow = findFieldNode('.agp-settings-player-row');
        var memRow = findFieldNode('[data-key="memorizeSeconds"]');
        var answerRow = findFieldNode('[data-key="answerSeconds"]');
        var soundVolumeRow = findFieldNode('[data-key="soundVolume"]');

        var bodyWrap = document.createElement('div');
        bodyWrap.className = 'mc-drawer-body';

        if (playerMgmtRow) {
            var reopenBtn = playerMgmtRow.querySelector('#agp-reopen-registration-btn');
            if (reopenBtn) reopenBtn.innerHTML = '<span style="font-size:15px">+</span>إدخال لاعب جديد';
            bodyWrap.appendChild(playerMgmtRow);
        }
        if (memRow || answerRow) {
            var timingCard = document.createElement('div');
            timingCard.className = 'mc-drawer-card mc-drawer-timing-card';
            [memRow, answerRow].filter(Boolean).forEach(function (n) { timingCard.appendChild(n); });
            bodyWrap.appendChild(timingCard);
        }
        if (soundVolumeRow) bodyWrap.appendChild(soundVolumeRow);
        box.appendChild(bodyWrap);

        var playersTab = document.createElement('div');
        playersTab.className = 'mc-drawer-players-tab';
        playersTab.id = 'mc-players-tab';
        playersTab.innerHTML =
            '<input type="text" id="mc-players-tab-search" placeholder="🔍 دوّر على لاعب...">' +
            '<div id="mc-players-tab-filter">' +
            '<button type="button" data-filter="all">الكل</button>' +
            '<button type="button" data-filter="live">🟢 نشطون</button>' +
            '<button type="button" data-filter="out">🔴 مقصون</button>' +
            '</div>' +
            '<div id="mc-players-tab-list"></div>';
        playersTab.querySelector('#mc-players-tab-search').oninput = function () { renderReopenedPlayersTab(); };
        playersTab.querySelectorAll('#mc-players-tab-filter button').forEach(function (b) {
            b.classList.toggle('mc-filter-active', b.getAttribute('data-filter') === _mcPlayersTabFilter);
            b.onclick = function () { _mcPlayersTabFilter = b.getAttribute('data-filter'); renderReopenedPlayersTab(); };
        });
        box.appendChild(playersTab);

        // Sticky footer, matches the design spec exactly — always visible
        // regardless of which tab is open. No new behavior: reuses the
        // exact same homeNavigate() the header's own 🏠 button already
        // calls, just as a more prominent, explicitly-labeled shortcut.
        var footer = document.createElement('div');
        footer.className = 'mc-drawer-footer';
        var endBtn = document.createElement('button');
        endBtn.type = 'button';
        endBtn.className = 'mc-drawer-end-btn';
        endBtn.textContent = 'إنهاء اللعب';
        endBtn.addEventListener('click', homeNavigate);
        footer.appendChild(endBtn);
        box.appendChild(footer);

        if (_mcDrawerTab === 'players') renderReopenedPlayersTab();
    }

    /**
     * Same layout as Tribe Roulette — merges _alive and _eliminated into
     * one list (everyone who took part in the match), name search filter +
     * status filter, Arabic alphabetical sort. Active row = red × button
     * (manuallyEliminatePlayer), eliminated row = green ↩ button (manuallyRevivePlayer).
     */
    function renderReopenedPlayersTab() {
        var listEl = el('mc-players-tab-list');
        if (!listEl) return;

        var query = ((el('mc-players-tab-search') || {}).value || '').trim().toLowerCase();
        var rows = _alive.map(function (p) { return { player: p, status: 'live' }; })
            .concat(_eliminated.map(function (e) { return { player: e.player, status: 'out' }; }));

        if (_mcPlayersTabFilter !== 'all') {
            rows = rows.filter(function (r) { return r.status === _mcPlayersTabFilter; });
        }
        if (query) {
            rows = rows.filter(function (r) { return playerLabel(r.player).toLowerCase().indexOf(query) !== -1; });
        }
        rows.sort(function (a, b) { return playerLabel(a.player).localeCompare(playerLabel(b.player), 'ar'); });

        var filterWrap = el('mc-players-tab-filter');
        if (filterWrap) {
            filterWrap.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('mc-filter-active', b.getAttribute('data-filter') === _mcPlayersTabFilter);
            });
        }

        // Same infinite-loop trap fixed in enhanceConnectionStatusField() and
        // enhanceLobbyHeading() above: this function itself is re-invoked on
        // every applyShellEnhancements() tick while this tab is open (see
        // enhanceReopenedDrawer()), and an unconditional innerHTML write is a
        // childList mutation that would re-trigger the observer driving that
        // same tick forever. Comparing against the current markup first
        // keeps a tick with nothing new (no join/leave/elimination) a real
        // no-op — also skipping the onclick rewiring below, which is only
        // needed when the buttons themselves were actually rebuilt.
        var desiredHtml = !rows.length ?
            '<div style="text-align:center;color:#6b6280;font-size:0.78em;padding:20px 0;">ولا لاعب مطابق</div>' :
            rows.map(function (r) {
                var isLive = r.status === 'live';
                var actionHtml = isLive
                    ? '<button type="button" class="mc-prow-action mc-action-eliminate" data-id="' + escapeHtml(r.player.id) + '" title="إقصاء يدوي">✕</button>'
                    : '<button type="button" class="mc-prow-action mc-action-revive" data-id="' + escapeHtml(r.player.id) + '" title="إرجاع يدوي">↩</button>';
                return '<div class="mc-prow' + (isLive ? '' : ' mc-prow-out') + '">' +
                    '<span class="mc-prow-avatar">' + ringAvatarHtml(r.player) + '</span>' +
                    '<span class="mc-prow-name">' + escapeHtml(playerLabel(r.player)) + '</span>' +
                    '<span class="mc-prow-status ' + (isLive ? 'mc-status-live' : 'mc-status-out') + '">' + (isLive ? 'نشط' : 'مقصى') + '</span>' +
                    actionHtml +
                    '</div>';
            }).join('');
        if (listEl.innerHTML === desiredHtml) return;
        listEl.innerHTML = desiredHtml;

        listEl.querySelectorAll('.mc-action-eliminate').forEach(function (btn) {
            btn.onclick = function () { manuallyEliminatePlayer(btn.getAttribute('data-id')); };
        });
        listEl.querySelectorAll('.mc-action-revive').forEach(function (btn) {
            btn.onclick = function () { manuallyRevivePlayer(btn.getAttribute('data-id')); };
        });
    }

    // "Add new lobby" window — a centered 700x800 window, 70% transparency
    // (same layout as Russian Roulette's rr-mini-lobby-active), single-color
    // border, 2-column grid of the main lobby's 217x57 cards. The ✕ close
    // button returns to the settings drawer without resetting it (same
    // approach as the connecting-layer recovery above: calling
    // AGP.gameShell.setSetting() with any field's own current value forces
    // the shared file to re-run renderSettingsScreen(true) from the outside).
    function closeMiniLobbyToSettings() {
        if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
            var s = AGP.gameShell.getSettings();
            var firstKey = Object.keys(s)[0];
            if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
        }
    }

    function enhanceMiniLobby() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-mini-lobby-list')) return;
        box.classList.remove('mc-inmatch-drawer', 'mc-tab-players');
        box.classList.add('mc-mini-lobby-active');

        var doneBtn = document.getElementById('agp-mini-lobby-done-btn');
        if (doneBtn && doneBtn.textContent.indexOf('حفظ') === -1) {
            doneBtn.textContent = '💾 حفظ وإكمال المباراة';
        }
        if (!box.querySelector('.mc-mini-lobby-close-btn')) {
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'mc-mini-lobby-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.onclick = closeMiniLobbyToSettings;
            box.insertBefore(closeBtn, box.firstChild);
        }
        // Explanatory info card, matching the design spec's addOpen modal
        // (not present at all before this redesign) — inserted once, right
        // after the title.
        if (!box.querySelector('.mc-mini-lobby-info')) {
            var info = document.createElement('div');
            info.className = 'mc-mini-lobby-info';
            info.innerHTML =
                '<p>هذا الباب مخصص للاعبين الجدد اللي ما دخلوا الجولة الحالية بعد</p>' +
                '<p>اطلب منهم كتابة الكلمة المفتاحية نفسها في التعليقات، وبيظهرون هنا تلقائياً جاهزين للدمج</p>';
            var h2 = box.querySelector('h2');
            if (h2) h2.insertAdjacentElement('afterend', info);
        }
    }

    /* ======================================================================
     *  "Connecting to the stream" layer over the settings screen — instead
     *  of the whole settings screen being replaced by the shared
     *  connecting box (agp-connecting-box), this intercepts the process
     *  locally (zero edits to js/agp-game-shell.js): captures a visual
     *  snapshot (clone, non-interactive) of the settings screen the moment
     *  the button is clicked — before the shared file starts overwriting
     *  #agp-shell-box — and shows it blurred behind our own layer (a
     *  spinner while connecting, a red ✕ mark on failure). The original
     *  connecting box itself is hidden visually (visibility:hidden via CSS
     *  only) the whole time our layer is shown, so there's no duplication.
     *  On failure: the layer auto-closes after a short delay, and the real
     *  settings screen returns (fully functional, not reset) by calling
     *  AGP.gameShell.setSetting() again with any field's current value —
     *  the only officially exported function from the shared file that
     *  forces it to re-run renderSettingsScreen() from the outside, so the
     *  fields rebuild with their current state (every button/toggle field
     *  is already preserved in the internal _settingsValues object; only
     *  the "keyword" text field needs manual recovery from a local backup,
     *  since it's the one text field the shared file doesn't persist).
     * ==================================================================== */
    var _mcConnLayer = null;
    var _mcConnKeywordBackup = '';
    var _mcConnKeywordPending = false;
    var _mcConnErrorShown = false;
    var _mcConnErrorTimer = null;

    function ensureConnLayer() {
        if (_mcConnLayer) return _mcConnLayer;
        var layer = document.createElement('div');
        layer.id = 'mc-conn-layer';
        layer.innerHTML =
            '<div class="mc-conn-backdrop"></div>' +
            '<div class="mc-conn-modal">' +
                '<div class="mc-conn-icon"></div>' +
                '<h3 class="mc-conn-title"></h3>' +
                '<p class="mc-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _mcConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.mc-conn-modal');
        var icon = layer.querySelector('.mc-conn-icon');
        modal.classList.toggle('mc-conn-err', isError);
        icon.className = 'mc-conn-icon ' + (isError ? 'mc-conn-err-icon' : 'mc-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.mc-conn-title').textContent = title;
        layer.querySelector('.mc-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    function hideConnLayer() {
        if (_mcConnLayer) _mcConnLayer.classList.remove('show');
    }

    // Captured only at the moment of the click (before the shared file
    // wipes the box's content) — a non-interactive visual copy
    // (pointer-events:none via CSS) shown blurred behind our layer,
    // without touching the real elements (the shared file reads the
    // username/keyword from the original elements right after us, unaffected).
    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('mc-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        _mcConnKeywordBackup = kInput ? kInput.value : '';
        var ghost = box.cloneNode(true);
        // A distinct id, only so it never duplicates the real box's id and
        // confuses a getElementById('agp-shell-box') call elsewhere. The
        // settings-screen design CSS is scoped purely by the
        // .mc-settings-initial-box class (see injectStageStyles), which
        // cloneNode(true) already copies onto this ghost — so it keeps its
        // styling regardless of what id it carries.
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.mc-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _mcConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    // Called from applyShellEnhancements() (watched via the existing
    // MutationObserver on any #agp-shell-box content change) — syncs our
    // layer's state with the actual current connection state.
    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_mcConnErrorShown) {
                _mcConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_mcConnErrorTimer);
                _mcConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _mcConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            // Fixed bug: if a new "connecting" state arrived (an automatic
            // reconnect) while the settings-recovery timer from a previous
            // error state (_mcConnErrorTimer) was still pending, it stayed
            // scheduled and later fired renderSettingsScreen() on top of an
            // already-in-progress new connection attempt — canceled here immediately.
            clearTimeout(_mcConnErrorTimer);
            _mcConnErrorShown = false;
            // A connection is in progress (either the first click, or an
            // automatic reconnect with no new click) — the layer is
            // already showing if this came from the button click; if it
            // came from an external event (no new ghost), show it with
            // whatever's currently available.
            if (!_mcConnLayer || !_mcConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        // Fully out of the connecting/error states.
        clearTimeout(_mcConnErrorTimer);
        _mcConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) {
            hideConnLayer();
        }
        if (_mcConnKeywordPending && box.classList.contains('mc-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _mcConnKeywordBackup;
            _mcConnKeywordPending = false;
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

    /**
     * Quiet manual elimination/revival from the drawer's players tab (same
     * behavior as Elimination Roulette's, adapted to this game's state).
     */
    function manuallyEliminatePlayer(playerId) {
        var idx = _alive.findIndex(function (p) { return p.id === playerId; });
        if (idx === -1) return;
        var player = _alive[idx];
        _alive.splice(idx, 1);
        _eliminated.push({ player: player, round: _round });
        _outLog = [playerLabel(player)].concat(_outLog).slice(0, 40);
        delete _answers[playerId];
        renderReopenedPlayersTab();
        renderPanel();
        checkEarlyEnd();
    }

    function manuallyRevivePlayer(playerId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === playerId; });
        if (idx === -1) return;
        var entry = _eliminated[idx];
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);
        _outLog = _outLog.filter(function (n) { return n !== playerLabel(entry.player); });
        renderReopenedPlayersTab();
        renderPanel();
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
     *  11) Registration
     * ==================================================================== */
    function registerGame() {
        injectStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',
            onLoad: function () { AGP.log('Memory Challenge: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Memory Challenge: onRoundEnd.'); },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Memory Challenge: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Memory Challenge: registration failed (already registered?).');
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
            settingsTitle: 'إعدادات لعبة تحدي الذاكرة',
            gameExplanation: 'كل جولة تظهر شبكة إيموجيز لثواني، بعدها تتغطى المربعات ويبان رقم كل مربع فقط. ' +
                'يطلع سؤال عن مكان إيموجي معيّن، وكل لاعب يكتب رقم المربع في الشات (أول إجابة هي اللي تنحسب). ' +
                'اللي يغلط أو ما يجاوب يطلع من اللعبة، ولو ما أحد جاوب صح الكل يكمل. أول جولة 3 صناديق وكل جولة يزيد صندوق. ' +
                'اللعبة ' + MAX_ROUNDS + ' جولات كحد أقصى، أو تنتهي أول ما يبقى لاعب واحد — ولو بقى أكثر من لاعب بعد آخر جولة فكلهم فائزين.',
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
