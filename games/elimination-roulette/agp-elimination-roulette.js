/**
 * AGP ELIMINATION ROULETTE — a native game built into the platform.
 * No external window or postMessage; its own page loads AGP Core in full
 * plus this file directly.
 *
 * "Friend revival": each player can be brought back this way only once per
 * lifetime in the match (excluded from future revival lists after that).
 *
 * Max players: AGP.lobby.close() alone doesn't stop joining (the real
 * keyword path in agp-keyword-manager.js never checks AGP.lobby's state),
 * so AGP.keywordManager.deactivate() is also called explicitly.
 *
 * Points system has no custom values for this game — the same shared
 * general system (window.AGPAuth.reportRoundCompletion).
 *
 * Dependencies (same order as the standard index.html): js/agp-core.js …
 * js/agp-bootstrap.js, then js/agp-player-card.js, then js/agp-game-shell.js.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'elimination-roulette';
    var GAME_NAME = 'روليت الإقصاء';
    var TIMER_NAME = 'elimination-roulette-turn';

    // Official platform colors — match the root CSS variables in
    // index.html (--accent/--accent-2/--accent-pink); see
    // docs/UI_GUIDELINES.md. Used on the wheel and windows instead of the
    // old approximate hand-picked colors.
    var C_ACCENT = '#7c3aed';   // primary purple
    var C_ACCENT2 = '#00c2ff';  // cyan (deliberately limited accents)
    var C_PINK = '#ff4dff';     // pink
    var C_ACCENT_LT = '#a78bfa';
    var C_PINK_LT = '#ff8de8';
    var C_ACCENT2_LT = '#7de0ff';

    // Darker version of the same wheel colors above (for a darker wheel) —
    // each color is the original at ~50% brightness. See
    // docs/CHANGELOG.md for the calculation method.
    var C_ACCENT_DK = '#3e1d76';
    var C_ACCENT2_DK = '#00617f';
    var C_PINK_DK = '#7f267f';
    var C_ACCENT_LT_DK = '#53457d';
    var C_PINK_LT_DK = '#7f4674';
    var C_ACCENT2_LT_DK = '#3e707f';
    var WHEEL_PALETTE = [C_ACCENT_DK, C_PINK_DK, C_ACCENT2_DK, C_ACCENT_LT_DK, C_PINK_LT_DK, C_ACCENT2_LT_DK];

    // Trim color for elements that used to be plain white (bezel ring,
    // pointer arrow, spin-button border) — darker now, but deliberately
    // lighter/distinct from the dark wheel colors above so it still stands
    // out clearly against them (not pure black).
    var C_WHEEL_TRIM = '#9c8fb0';

    // Coin values researched from public sources (streamwrapped.com,
    // bettertok.app, joinotto.com) — "Confetti Battle" had no confirmed
    // value in any source, shown as "؟" instead. Gift icons: Twemoji
    // (jdecked/twemoji, MIT + CC-BY 4.0 license) — not official
    // copyrighted TikTok assets.
    var COMMON_GIFTS = [
        { label: 'وردة', value: 'Rose', codepoint: '1f339', coins: 1 },
        { label: 'تيك توك', value: 'TikTok', codepoint: '1f496', coins: 1 },
        { label: 'قلب الإصبع', value: 'Finger Heart', codepoint: '1f90d', coins: 5 },
        { label: 'جي جي', value: 'GG', codepoint: '1f3a4', coins: 1 },
        { label: 'مخروط آيسكريم', value: 'Ice Cream Cone', codepoint: '1f366', coins: 1 },
        { label: 'عطر', value: 'Perfume', codepoint: '1f9f4', coins: 20 },
        { label: 'دوناتس', value: 'Doughnut', codepoint: '1f369', coins: 30 },
        { label: 'قلوب اليد', value: 'Hand Hearts', codepoint: '1f49e', coins: 100 },
        { label: 'نظارة شمسية', value: 'Sunglasses', codepoint: '1f576', coins: 199 },
        { label: 'تاج صغير', value: 'Little Crown', codepoint: '1f451', coins: 99 },
        { label: 'كلب كورجي', value: 'Corgi', codepoint: '1f415', coins: 299 },
        { label: 'باقة ورد', value: 'Rosa', codepoint: '1f490', coins: 10 },
        { label: 'نغمة موسيقية', value: 'Music Note', codepoint: '1f3b5', coins: 169 },
        { label: 'قصاصات احتفالية', value: 'Confetti Battle', codepoint: '1f389', coins: null },
        { label: 'مجرة', value: 'Galaxy', codepoint: '1f30c', coins: 1000 },
        { label: 'مسدس نقود', value: 'Money Gun', codepoint: '1f4b8', coins: 500 },
        { label: 'سيارة رياضية', value: 'Sports Car', codepoint: '1f3ce', coins: 7000 },
        { label: 'أسد', value: 'Lion', codepoint: '1f981', coins: 29999 },
        { label: 'ملكة الدراما', value: 'Drama Queen', codepoint: '1f483', coins: 5 },
        { label: 'كون تيك توك', value: 'TikTok Universe', codepoint: '1f320', coins: 44999 }
    ];

    var TWEMOJI_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@latest/assets/svg/';
    function giftIconUrl(g) { return TWEMOJI_BASE + g.codepoint + '.svg'; }
    function giftCoinsText(g) { return (g.coins != null) ? (g.coins + ' 🪙') : '؟'; }

    var ELIMINATION_TIMER_OPTIONS = [20, 25, 30, 40].map(function (s) {
        return { label: s + 'ث', value: s };
    });

    // Wheel zoom slider — size bounds in pixels + the default (matches the
    // old fixed 440px). The current value is kept in a module-level
    // variable (_wheelSizePx below, alongside the rest of the match state)
    // so it persists across renderStage() re-renders (replaying with the
    // same players, etc.).
    var WHEEL_SIZE_MIN = 260;
    var WHEEL_SIZE_MAX = 640;
    var WHEEL_SIZE_DEFAULT = 440;
    var _wheelSizePx = WHEEL_SIZE_DEFAULT; // persists across renderStage() re-renders (deliberately outside resetMatchState())

    // The optional second selection shape — a vertical scroll reel instead
    // of the circular wheel (same system as Russian Roulette's rr-reel).
    // Persists across renderStage() re-renders, same philosophy as
    // _wheelSizePx above.
    var _wheelDisplayMode = 'wheel'; // 'wheel' | 'reel'
    var REEL_ITEM_H = 150;
    var REEL_REPEATS = 6;

    /* ======================================================================
     *  0) Sound — four programmatically generated clips + a volume level
     *     adjustable live from settings.
     * ==================================================================== */
    var SOUND_BASE = 'sounds/';
    var _sounds = {
        spin: new Audio(SOUND_BASE + 'spin.wav'),
        eliminate: new Audio(SOUND_BASE + 'eliminate.wav'),
        revive: new Audio(SOUND_BASE + 'revive.wav'),
        warning: new Audio(SOUND_BASE + 'warning-beep.wav')
    };

    function currentVolume() {
        var settings = AGP.gameShell && AGP.gameShell.getSettings ? AGP.gameShell.getSettings() : {};
        var v = settings.soundVolume;
        if (v === undefined || v === null || isNaN(v)) v = 7;
        return Math.max(0, Math.min(10, v)) / 10;
    }

    function playSound(name) {
        var a = _sounds[name];
        if (!a) return;
        // Fixed bug: at volume 0, the code used to still call play()
        // (silently, at volume=0) instead of skipping the call entirely.
        // On iOS specifically, merely calling play() on any <audio>
        // element (even at zero volume) makes Safari take over the audio
        // session and mute anything else playing in the background on the
        // streamer's device (e.g. music from another app) — this is iOS's
        // own system behavior, with no web API to opt out of it (native
        // apps only). The only real fix: never call play() at all when
        // volume is 0, so the game never touches the audio system and
        // there's no reason for iOS to mute anything else.
        if (currentVolume() <= 0) return;
        try {
            a.volume = currentVolume();
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') {
                p.catch(function () { /* the browser sometimes blocks autoplay before the first user interaction — ignore silently */ });
            }
        } catch (e) { /* ignore silently — sound is a nice-to-have layer, never blocks the game */ }
    }

    /* ======================================================================
     *  1) In-match state (fully local to this file)
     * ==================================================================== */
    var _alive = [];
    var _eliminated = [];       // { player }
    var _lastWheelWinnerId = null;
    var _repeatStreak = 0;
    var _settings = null;
    var _startedAt = null;
    var _matchActive = false;
    var _pendingTurn = null;    // { type: 'eliminate'|'revive', candidates: [...], chooser }
    var _commentUnsub = null;
    var _giftUnsub = null;
    var _giftReviveCounts = {}; // playerId -> number of gift-revivals used (for the whole match)
    var _friendRevivedIds = {}; // playerId -> true (already used their one "friend revival" chance, once per lifetime in the match)

    // Extra grace period before declaring the winner for good, on an
    // elimination that could end the match — gives a real chance for a
    // revival gift "in transit" (actually sent by the viewer, but not yet
    // received/processed here due to normal network/TikTok delay) to save
    // the just-eliminated player before the match closes. See the
    // eliminatePlayer() comment below for full details.
    var FINAL_ELIMINATION_GIFT_GRACE_MS = 500;
    var _eliminationCounts = {}; // playerId (the eliminator) -> how many they've actually eliminated
    // "Auto-play" state — see handleAutoPlayToggle/maybeAutoSpin/stopAutoPlay.
    var _autoPlayActive = false;
    var _autoPlayTimer = null;
    // Each player's number stays fixed for the whole match (computed from
    // their lobby join order at match start, or join order mid-match) —
    // see assignPlayerNumber/playerNumber below. Replaces the old
    // changing array index (i+1) used to display and match the chat
    // number in the elimination/revival windows — that index changed every
    // round as _alive shrank, so the number typed in chat would match
    // nothing or a different player than intended.
    var _playerNumbers = {};       // playerId -> fixed number
    var _nextPlayerNumber = 1;
    // selectCandidateManually/_selectedCandidateIdx were removed entirely
    // — see the handleForceEliminateClick comment below.

    // Id/object for the "default eliminator" in both cases where the turn
    // holder eliminates themselves (the red button, and a timeout with the
    // "eliminate chooser" behavior) — shows an actual card named "the
    // streamer" in the announcement tab instead of no eliminator card at
    // all. Not a real player, so it isn't counted in the "most
    // eliminations" stat (see eliminatePlayer below).
    var STREAMER_ELIMINATOR_ID = '__streamer__';
    var STREAMER_VIRTUAL_PLAYER = { id: STREAMER_ELIMINATOR_ID, name: 'الاستريمر' };
    // setTimeout id for auto-hiding the "player returned" splash — see
    // showReviveSplash() below.
    var _reviveSplashTimer = null;

    function resetMatchState() {
        _alive = [];
        _eliminated = [];
        _lastWheelWinnerId = null;
        _repeatStreak = 0;
        _settings = null;
        _startedAt = null;
        _matchActive = false;
        _pendingTurn = null;
        _giftReviveCounts = {};
        _friendRevivedIds = {};
        _eliminationCounts = {};
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        _autoPlayActive = false;
        _playerNumbers = {};
        _nextPlayerNumber = 1;
        if (_reviveSplashTimer) { window.clearTimeout(_reviveSplashTimer); _reviveSplashTimer = null; }
        var splashOverlay = el('er-revive-splash-overlay');
        if (splashOverlay) splashOverlay.style.display = 'none';
    }

    // See the _playerNumbers comment above — actually called only once per
    // player (match start in lobby order, mid-match join, or "replay with
    // the same players" after resetMatchState clears the table).
    function assignPlayerNumber(p) {
        if (!p || !p.id) return;
        if (_playerNumbers[p.id] == null) {
            _playerNumbers[p.id] = _nextPlayerNumber++;
        }
    }
    function playerNumber(p) { return (p && _playerNumbers[p.id]) || '?'; }

    function liveSettings() {
        return (AGP.gameShell && typeof AGP.gameShell.getSettings === 'function') ? AGP.gameShell.getSettings() : (_settings || {});
    }

    /* ======================================================================
     *  2) Small DOM helpers
     * ==================================================================== */
    function el(id) { return document.getElementById(id); }
    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }
    function playerLabel(p) { return (p && (p.name || p.id)) || '—'; }

    // Fixed bug: escapeHtml() alone isn't enough for text inserted inside a
    // single-quoted JS string that itself sits inside a double-quoted HTML
    // attribute (onerror="...this.outerHTML='...NAME...'...") — it only
    // escapes &/</>, not ', ", or \. A player with a real TikTok name
    // starting with a quote (single or double) in their first two
    // characters (initials) would break the JS string or the HTML
    // attribute itself the moment their photo fails to load (onerror) —
    // see ringAvatarHtml() below, used by nearly every player card.
    function escapeForInlineOnerrorJs(text) {
        return escapeHtml(text)
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/"/g, '&quot;');
    }

    /**
     * Fixes a real points-exploit: player.name is the TikTok display name
     * (nickname), not the real username (@handle) actually used for
     * backend matching (auth-service.js findVerifiedUserByTikTok compares
     * the real tiktok_username entered manually at verification time —
     * dashboard-auth.js). The real username (uniqueId) is only available
     * inside player.id as 'tiktok:'+uniqueId (see
     * backend/platforms/tiktok/tiktok-connector.js extractUser()) — so we
     * extract it from id, not name. The same function is duplicated in
     * dashboard-core/js/dashboard-core.js for the same reason (a separate
     * shared file).
     */
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

    // "Zain" font — a clearer font for the settings screens/tab titles and
    // elsewhere. Loaded only here (never touches the shared
    // js/agp-game-shell.js or any other game), guarded by the element's id
    // to avoid loading it twice if this function is called more than once.
    function ensureZainFont() {
        if (el('er-zain-font-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'er-zain-font-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Zain:ital,wght@0,200;0,300;0,400;0,700;0,800;0,900;1,300;1,400&display=swap';
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    // Design-system fonts for the settings/lobby screens only (Cairo for
    // headings, Noto Kufi Arabic + IBM Plex Sans Arabic for body text) —
    // same guarded-link pattern as ensureZainFont above, scoped via CSS to
    // .er-settings-initial-box/.agp-lobby-box (see injectStageStyles).
    // Zain stays untouched for the rest of the game (wheel, modals, log).
    function ensureDesignFonts() {
        if (el('er-design-fonts-link')) return;
        var pre1 = document.createElement('link');
        pre1.rel = 'preconnect';
        pre1.href = 'https://fonts.googleapis.com';
        var pre2 = document.createElement('link');
        pre2.rel = 'preconnect';
        pre2.href = 'https://fonts.gstatic.com';
        pre2.crossOrigin = 'anonymous';
        var sheet = document.createElement('link');
        sheet.id = 'er-design-fonts-link';
        sheet.rel = 'stylesheet';
        sheet.href = 'https://fonts.googleapis.com/css2?family=Noto+Kufi+Arabic:wght@400;500;600;700&family=Cairo:wght@600;700;900&family=IBM+Plex+Sans+Arabic:wght@400;500;600&display=swap';
        document.head.appendChild(pre1);
        document.head.appendChild(pre2);
        document.head.appendChild(sheet);
    }

    function injectStageStyles() {
        if (el('er-stage-styles')) return;
        ensureZainFont();
        ensureDesignFonts();
        var style = document.createElement('style');
        style.id = 'er-stage-styles';
        style.textContent = [
            ':root{--er-accent:' + C_ACCENT + ';--er-accent2:' + C_ACCENT2 + ';--er-pink:' + C_PINK + ';}',

            // The browser's default body margin (8px) caused a 16px page
            // scroll even with the lobby box set to 100vh. This reset is
            // scoped to this game's page only (the stylesheet is injected
            // only when this game runs) — no shared file or other game touched.
            'html,body{margin:0 !important;padding:0 !important;}',

            // "Zain" overrides every font in the game for better
            // readability; Cairo stays as a fallback if the font is slow
            // to load. Technical note: body{font-family:...} alone isn't
            // enough — any element with its own font-family set directly
            // (every heading/button/label here and in the shared file)
            // ignores inheritance from body even with !important, since
            // inheritance loses to any direct match. Fix: apply
            // !important directly to every element via a "*" selector
            // inside each of this game's own containers (game stage +
            // shared settings/lobby container #agp-shell-overlay +
            // elimination/winner window + toast + event log) — wins
            // regardless of specificity since it's the only one marked
            // !important, without touching the shared js/agp-game-shell.js
            // or any other game (these selectors are scoped to this game's
            // own elements only).
            '#agp-shell-overlay,#agp-shell-overlay *,#er-stage,#er-stage *,',
            '#er-modal-overlay,#er-modal-overlay *,#er-toast-wrap,#er-toast-wrap *,',
            '#er-event-log,#er-event-log *{font-family:"Zain",Cairo,sans-serif !important;}',

            '#er-stage{position:fixed;inset:0;padding-top:70px;display:flex;flex-direction:column;',
            'align-items:center;justify-content:flex-start;gap:14px;overflow-y:auto;font-family:Cairo,sans-serif;direction:rtl;color:#f3eefc;}',

            /* ---- Player names, written directly inside each wheel slice
             * (text only, no profile photos) instead of a separate strip. ---- */
            '.er-wheel-label{position:absolute;top:50%;left:50%;transform-origin:center;',
            'font-size:0.68em;font-weight:800;color:#f1e9fb;text-shadow:0 1px 3px rgba(0,0,0,0.8);',
            'max-width:64px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;',
            'pointer-events:none;text-align:center;}',

            /* ---- Wheel zoom slider — a normal element in the column
             * flow (#er-stage flex-direction:column) between the wheel and
             * the shuffle button, so the latter moves automatically when
             * the wheel's size changes above it (instead of absolute
             * positioning). ---- */
            '#er-wheel-zoom-row{display:flex;align-items:center;gap:10px;font-size:0.82em;color:#e9d3ff;}',
            '#er-wheel-zoom-slider{width:170px;accent-color:var(--er-accent2);cursor:pointer;}',

            /* ---- Shuffle button (below the wheel) ---- */
            '#er-shuffle-btn{margin-top:2px;padding:9px 22px;border-radius:999px;',
            'border:1px solid var(--er-accent2);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#er-shuffle-btn:disabled{opacity:0.4;cursor:not-allowed;}',
            '#er-shuffle-btn:not(:disabled):hover{background:rgba(255,255,255,0.16);}',

            /* ---- The optional second shape: a vertical scroll reel
             * instead of the wheel — same system as Russian Roulette's
             * rr-reel, recolored for this game. The choice between them is
             * a real settings field (wheelDisplayMode) instead of a
             * floating button — see enhanceWheelModeField/setWheelDisplayMode. ---- */
            '#er-reel-wrap{display:none;position:relative;width:min(560px,90vw);height:450px;',
            'max-height:70vh;',
            'margin:46px auto 0;border-radius:16px;background:rgba(0,0,0,0.35);',
            'border:2px solid var(--er-accent2);box-shadow:0 0 30px rgba(0,0,0,0.5);overflow:hidden;',
            'mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);',
            '-webkit-mask-image:linear-gradient(180deg,transparent 0%,#000 22%,#000 78%,transparent 100%);}',
            '#er-reel-list{position:absolute;left:0;right:0;top:0;',
            'transition:transform 3.8s cubic-bezier(0.15,0.85,0.25,1);}',
            '.er-reel-item{height:150px;display:flex;align-items:center;justify-content:center;gap:16px;',
            'padding:0 24px;box-sizing:border-box;}',
            '.er-reel-av{width:70px;height:70px;border-radius:50%;background:#241a2c;',
            'border:2px solid rgba(255,255,255,0.25);display:flex;align-items:center;justify-content:center;',
            'font-weight:800;font-size:1.3em;color:#fff;flex:none;opacity:0.5;transition:opacity .2s;}',
            '.er-reel-name{font-size:1.4em;font-weight:800;color:#9d92b3;opacity:0.5;flex:1;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;transition:opacity .2s,color .2s,font-size .2s;}',
            '.er-reel-num{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.1);',
            'color:#9d92b3;font-weight:900;font-size:1em;display:flex;align-items:center;justify-content:center;',
            'flex:none;opacity:0.5;transition:opacity .2s,background .2s,color .2s;}',
            '.er-reel-item.er-reel-highlight .er-reel-av{opacity:1;border-color:var(--er-accent2);}',
            '.er-reel-item.er-reel-highlight .er-reel-name{opacity:1;color:#fff;font-size:1.6em;}',
            '.er-reel-item.er-reel-highlight .er-reel-num{opacity:1;',
            'background:linear-gradient(90deg,var(--er-pink),var(--er-accent2));color:#150819;}',
            '#er-reel-pointer-line{position:absolute;top:150px;left:0;right:0;height:150px;',
            'pointer-events:none;border-top:2px solid var(--er-pink);border-bottom:2px solid var(--er-pink);',
            'background:linear-gradient(90deg,rgba(229,0,127,0.12),rgba(0,215,255,0.06));z-index:2;}',
            '#er-spin-hub.er-hub-standalone{position:static;transform:none;margin:14px auto 0;}',
            // Caption under the "wheel shape" field on both settings
            // screens (initial and the drawer) — a normal flow element,
            // added once via enhanceWheelModeField.
            '.er-field-note{font-size:0.72em;color:#9dd6c2;margin:-6px 0 4px;padding:0 2px;',
            'text-align:right;opacity:0.9;}',

            /* ---- "Auto-play" button — moved from inside the settings
             * drawer (was the shared file's midMatchToggleButton) to
             * directly under the wheel on the game screen. Same
             * enable/disable logic (handleAutoPlayToggle), only the
             * button's location changed. ---- */
            '#er-autoplay-btn{margin-top:8px;padding:9px 22px;border-radius:999px;',
            'border:1px solid var(--er-accent2);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:inherit;font-weight:700;font-size:0.85em;cursor:pointer;}',
            '#er-autoplay-btn:hover{background:rgba(255,255,255,0.16);}',
            '#er-autoplay-btn.er-autoplay-active{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));',
            'border-color:transparent;color:#0b0616;font-weight:900;}',

            /* ---- The wheel itself (conic gradient + bulb ring) ---- */
            // Fixed bug: width and height used to be computed via two
            // separate min(440px,88vw) expressions — at certain browser
            // zoom levels (Ctrl+, e.g. 175%/200%) Chromium can resolve them
            // to slightly different actual values despite the identical
            // formula (reproduced and confirmed), turning the wheel oval
            // instead of square. Fix: only width uses the formula; height
            // is derived from it via aspect-ratio:1 — one computed value,
            // zero chance of the two drifting apart.
            '#er-wheel-wrap{position:relative;width:min(440px,88vw);aspect-ratio:1;margin-top:46px;}',
            '#er-wheel-bezel{position:absolute;inset:-14px;border-radius:50%;',
            'background:linear-gradient(135deg,var(--er-accent2),var(--er-accent),var(--er-pink));',
            'box-shadow:0 0 46px rgba(124,58,237,0.65),inset 0 0 0 6px rgba(156,143,176,0.25);}',
            '.er-bulb{position:absolute;width:9px;height:9px;border-radius:50%;background:#fff8dd;',
            'box-shadow:0 0 8px 2px rgba(255,244,180,0.85);}',
            // The wheel's trim ring uses C_WHEEL_TRIM (a darker, distinct
            // tone) instead of plain white, so it still stands out against
            // the darker wheel slice colors.
            '#er-wheel{position:absolute;inset:8px;border-radius:50%;border:5px solid ' + C_WHEEL_TRIM + ';',
            'transition:transform 3.2s cubic-bezier(0.15,0.85,0.25,1);box-shadow:inset 0 0 30px rgba(0,0,0,0.35);overflow:hidden;}',
            '#er-wheel-pointer{position:absolute;top:-20px;left:50%;transform:translateX(-50%);',
            'width:0;height:0;border-left:16px solid transparent;border-right:16px solid transparent;',
            'border-top:26px solid ' + C_WHEEL_TRIM + ';z-index:6;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));}',

            /* ---- Center hub = the spin button (logo + "Spin" label) ---- */
            '#er-spin-hub{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:7;',
            'width:104px;height:104px;border-radius:50%;border:4px solid ' + C_WHEEL_TRIM + ';cursor:pointer;',
            'background:radial-gradient(circle at 35% 30%,#2a1443,#0e0e16);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;',
            'box-shadow:0 0 24px rgba(0,194,255,0.6),0 4px 10px rgba(0,0,0,0.5);padding:0;}',
            '#er-spin-hub img{width:44px;height:44px;object-fit:contain;border-radius:50%;}',
            '#er-spin-hub span{font-size:0.82em;font-weight:900;color:#fff;font-family:Almarai,Cairo,sans-serif;}',
            '#er-spin-hub:disabled{opacity:0.55;cursor:not-allowed;}',
            '#er-spin-hub:not(:disabled):hover{box-shadow:0 0 34px rgba(0,194,255,0.85),0 4px 14px rgba(0,0,0,0.5);}',

            /* ---- Turn window (eliminate/revive) — 1300x800 ---- */
            // flex-direction:column + gap lets the chooser card
            // (#er-modal-chooser-card) render above the box as a separate
            // sibling with a clear gap, instead of absolute overlap.
            // The persistent header (#agp-persistent-header in the shared
            // js/agp-game-shell.js, z-index:99998) must stay visible above
            // every popup in this game (elimination/revival/announcement/
            // gift picker/winner screen) instead of being covered by them.
            // This box's z-index is lowered here (99990, below the header)
            // without touching the shared file; it stays above every normal
            // in-game element. The settings/lobby overlay
            // (#agp-shell-overlay, z-index:99999 in the shared file) still
            // covers the header as-is — that's a separate shared-file
            // behavior, out of scope here.
            '#er-modal-overlay{position:fixed;inset:0;z-index:99990;display:none;flex-direction:column;',
            'align-items:center;justify-content:center;gap:18px;padding:16px;background:rgba(8,4,16,0.72);}',
            // A fixed 800px height left a large empty gap under shorter tabs
            // (gift picker, result announcement, winner screen) — switched
            // to height:auto with max-height:800px as just an upper cap.
            '#er-modal-box{width:1300px;max-width:97vw;height:auto;max-height:800px;max-height:min(800px,94vh);overflow-y:auto;box-sizing:border-box;',
            'background:linear-gradient(180deg,#5F3976,#211528);border:2px solid var(--er-accent);border-radius:20px;',
            'padding:28px 32px;color:#fff;box-shadow:0 0 50px rgba(124,58,237,0.55);}',
            '#er-modal-box h2{margin:0 0 6px;font-size:1.5em;text-align:center;color:#fff;font-weight:800;',
            'font-family:Almarai,Cairo,sans-serif;}',
            '#er-modal-sub{text-align:center;color:#e9d3ff;font-size:0.95em;margin-bottom:10px;}',

            /* ==================================================================
             * The "choose who to eliminate" and "revival chance" windows —
             * a box fully independent from #er-modal-box above (which is
             * now used only for the result announcement, winner screen, and
             * gift picker tabs). Layout ported from Russian Roulette's
             * selection-phase window (games/russian-roulette), recolored to
             * this game's own palette instead of that game's gold/brown.
             * The old #er-modal-chooser-card/chooserCardHtml/
             * .er-chooser-actions, .er-candidate-*, .er-phase-badge* markup
             * was removed entirely — nothing renders it anymore
             * (renderTurnModal below never builds it). ---- */
            /* ================================================================
             * Elimination/revival selection screen (shared #er-select-box
             * between both cases via roleClass) — no surrounding box: the
             * title/chooser card/buttons/timer/candidate grid float
             * directly over the game screen, with a 30% black dim layer
             * behind them (keeps the game screen visible while making the
             * cards clearer). Eliminate vs. revive is now distinguished
             * purely by inner element colors (chooser ring, numbers, the
             * bold word in the title).
             * ================================================================ */
            '#er-select-overlay{position:fixed;inset:0;z-index:99990;display:none;',
            'align-items:flex-start;justify-content:center;padding:0;}',
            '#er-select-overlay::before{content:"";position:fixed;inset:0;',
            'background:rgba(0,0,0,0.3);pointer-events:none;z-index:0;}',
            '#er-select-box{width:min(1150px,97vw);max-width:97vw;height:100vh;max-height:100vh;',
            'padding:90px 24px 24px;box-sizing:border-box;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'background:none;border:none;position:relative;overflow:hidden;box-shadow:none;',
            'display:flex;flex-direction:column;z-index:1;}',
            '#er-select-box > *{position:relative;z-index:1;}',
            '#er-select-title{text-align:center;font-size:0.95em;color:#d9c8e8;margin-bottom:18px;flex:none;',
            'text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            '#er-select-title b{color:var(--er-accent2);font-weight:900;}',
            // Colors intentionally swapped (was green=eliminate/red=revive)
            // to match the players' number colors elsewhere in these same
            // windows (red=eliminate, green=revive) — one consistent color
            // language.
            '#er-select-box.er-role-eliminate #er-select-title b{color:#ef4444;}',
            '#er-select-box.er-role-revive #er-select-title b{color:#22c55e;}',
            /* ---- One row: the enlarged chooser card + buttons (centered together) ---- */
            '#er-chooser-row{display:flex;align-items:center;justify-content:center;gap:26px;margin-bottom:12px;flex:none;}',
            '.er-select-chooser-card{display:flex;align-items:center;gap:12px;}',
            '.er-select-chooser-ring{width:88px;height:88px;border-radius:50%;padding:4px;box-sizing:border-box;flex:none;}',
            '.er-select-chooser-ring.er-role-eliminate{background:#22c55e;box-shadow:0 0 22px rgba(34,197,94,0.65);}',
            '.er-select-chooser-ring.er-role-revive{background:#ef4444;box-shadow:0 0 22px rgba(239,68,68,0.65);}',
            '.er-select-chooser-ring .er-ring-avatar,.er-select-chooser-ring .er-ring-avatar--fallback{width:100%;height:100%;font-size:1.5em;}',
            '.er-select-chooser-nmrow{display:flex;align-items:center;gap:10px;margin-top:1px;}',
            '.er-select-chooser-nm{font-size:1.35em;font-weight:900;color:#fff;text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            // Background color now depends on the role (red=eliminate,
            // green=revive) instead of a fixed accent color — see the
            // roleClass passed in selectChooserCardHtml's markup.
            '.er-select-chooser-num{width:42px;height:42px;border-radius:50%;color:#fff;',
            'font-size:1.15em;font-weight:900;display:flex;align-items:center;justify-content:center;flex:none;}',
            '.er-select-chooser-num.er-role-eliminate{background:#ef4444;}',
            '.er-select-chooser-num.er-role-revive{background:#22c55e;}',
            '#er-select-actions{display:flex;flex-direction:row;gap:8px;width:230px;flex:none;}',
            '#er-select-actions button{flex:1;padding:9px 6px;border-radius:999px;border:none;font-weight:800;',
            'cursor:pointer;font-family:inherit;font-size:0.74em;color:#fff;white-space:nowrap;line-height:1.3;',
            'transition:transform 0.15s,box-shadow 0.15s;}',
            '#er-select-actions button:hover{transform:translateY(-2px);}',
            '#er-select-resume-btn{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));',
            'box-shadow:0 4px 14px rgba(124,58,237,0.45);}',
            '#er-force-eliminate-btn{background:linear-gradient(90deg,#ef4444,#b91c1c);',
            'box-shadow:0 4px 14px rgba(239,68,68,0.45);}',
            /* ---- Countdown timer — its own line below the chooser row, large and prominent ---- */
            '#er-select-timer{text-align:center;font-weight:900;font-size:1.5em;color:#ffe066;margin-bottom:10px;',
            'flex:none;transition:color 0.2s;text-shadow:0 2px 10px rgba(0,0,0,0.8);}',
            '#er-select-timer.er-timer-warning{color:#ff4d6d;animation:er-pulse 1s infinite;}',
            '@keyframes er-pulse{0%,100%{transform:scale(1);}50%{transform:scale(1.08);}}',
            /* ---- Candidate grid — fixed 4 columns, standard-lobby-card-v1
             * style (60px avatar overlapping a pill name plate by ~22%),
             * the fixed number is a normal part of the plate's flow (not
             * absolutely positioned). ---- */
            '#er-select-candidates-grid{flex:1;min-height:0;overflow-y:auto;display:grid;',
            'grid-template-columns:repeat(4,1fr);gap:0.5cm;align-content:flex-start;padding:4px 2px 6px;',
            'width:min(900px,92vw);margin:0 auto;}',
            '.er-select-cand-card{display:flex;flex-direction:column;align-items:center;cursor:pointer;}',
            '.er-select-cand-row{display:inline-flex;align-items:center;}',
            '.er-select-cand-avatar{width:60px;height:60px;border-radius:50%;flex:none;position:relative;z-index:2;',
            'overflow:hidden;box-sizing:border-box;border:3px solid rgba(255,255,255,0.55);}',
            '.er-select-cand-avatar .er-ring-avatar,.er-select-cand-avatar .er-ring-avatar--fallback{width:100%;height:100%;font-size:1.1em;}',
            // justify-content:space-between (no gap) keeps the number
            // pinned to the plate's inner edge, instead of floating right
            // after the name at a distance that varies with name length.
            '.er-select-cand-plate{position:relative;height:48px;width:194px;box-sizing:border-box;',
            'margin-inline-start:-13px;padding-inline-start:31px;padding-inline-end:10px;',
            'display:flex;align-items:center;justify-content:space-between;font-weight:800;color:#fff;',
            'background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.3);backdrop-filter:blur(4px);',
            'border-radius:999px;overflow:hidden;z-index:1;}',
            '.er-select-cand-name{font-size:1em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:0 1 auto;}',
            // Red in the elimination window, green in the revival window —
            // same color language as the rest of these two windows.
            '.er-select-cand-num{width:40px;height:40px;flex:none;color:#fff;',
            'border-radius:50%;font-size:1.2em;font-weight:900;',
            'display:flex;align-items:center;justify-content:center;z-index:3;}',
            '.er-select-cand-num.er-role-eliminate{background:#ef4444;}',
            '.er-select-cand-num.er-role-revive{background:#22c55e;}',
            '.er-select-cand-card.er-cand-selected .er-select-cand-plate{box-shadow:0 0 0 2px #ef4444;}',

            /* ---- Result-announcement tab (4 seconds) ---- */
            /* Announcement colors (originally designed for a light
             * background) were brightened to stay readable over the dark
             * background. */
            /* ---- Result-announcement tab, redesigned — a small box
             * (~650x300) with a single sentence "[avatar+name] eliminated/
             * revived [avatar+name]" instead of the old big icon+title+name
             * layout. Also used for the "friend revival" announcement. */
            '#er-modal-box.er-announce-box{width:500px;max-width:92vw;height:350px;max-height:90vh;',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;',
            'padding:26px 24px;box-sizing:border-box;background:rgba(255,255,255,0.15);',
            'border:6px solid rgba(124,58,237,0.3);',
            'border-radius:17px;box-shadow:0 10px 30px rgba(0,0,0,0.5);}',
            '.er-announce-box .er-announce-sentence{font-size:1.25em;font-weight:800;text-align:center;',
            'line-height:2.4;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:8px;}',
            // The title is a full sentence naming both players ("X
            // successfully eliminated Y") rather than a generic label with
            // no names — see showResultAnnouncement().
            '.er-announce-title{font-size:1.35em;font-weight:900;color:#fff;text-align:center;',
            'line-height:1.5;letter-spacing:0.3px;',
            'text-shadow:0 2px 8px rgba(0,0,0,0.4),0 0 1px #fff;}',
            '.er-announce-eliminate .er-announce-title{color:#ff8da3;}',
            '.er-announce-revive .er-announce-title{color:#7dffb0;}',
            // Row gap sized to fit the elimination emoji (💀) between the
            // two cards — see showResultAnnouncement().
            '.er-announce-row{display:flex;align-items:center;justify-content:center;gap:30px;}',
            '.er-announce-vs-emoji{font-size:40px;align-self:center;',
            'filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));}',
            // Single-person card (ring + role badge + name), fixed 145px
            // width, 8px vertical gap between its three elements.
            '.er-announce-person-card{width:145px;display:flex;flex-direction:column;',
            'align-items:center;gap:8px;}',
            // 112px ring — same technique as the winner-screen cards
            // (colored background + 5px padding produces the ring
            // thickness automatically around the photo, instead of a
            // border/stroke).
            '.er-announce-ring{width:112px;height:112px;border-radius:50%;padding:5px;box-sizing:border-box;}',
            '.er-announce-ring .er-ring-avatar,.er-announce-ring .er-ring-avatar--fallback{',
            'width:100%;height:100%;}',
            '.er-announce-ring-green{background:#22c55e;}',
            '.er-announce-ring-red{background:#ef4444;}',
            // Desaturated + slightly transparent — for the eliminated side
            // specifically.
            '.er-announce-ring-desaturate .er-ring-avatar,',
            '.er-announce-ring-desaturate .er-ring-avatar--fallback{filter:saturate(0.4);opacity:0.9;}',
            // 3-second red glow-then-fade animation for the eliminated
            // player's photo specifically (matches the box's own
            // setTimeout(...,3000) auto-close in showResultAnnouncement() —
            // the fade completes right as the box closes). Applied only to
            // the red+desaturated ring combo (the only "eliminated" styling
            // in this file), leaving the green revival ring untouched.
            '@keyframes er-announce-eliminate-glow{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.65);}',
            '45%{box-shadow:0 0 26px 12px rgba(239,68,68,0.9);}',
            '100%{box-shadow:0 0 10px 3px rgba(239,68,68,0.15);}}',
            '.er-announce-ring-red{animation:er-announce-eliminate-glow 3s ease forwards;}',
            '@keyframes er-announce-eliminate-fade{0%{opacity:1;}55%{opacity:0.9;}100%{opacity:0;}}',
            '.er-announce-ring-desaturate .er-ring-avatar,',
            '.er-announce-ring-desaturate .er-ring-avatar--fallback{',
            'animation:er-announce-eliminate-fade 3s ease forwards;}',
            // Role badge — small pill directly under the ring.
            '.er-announce-role-badge{padding:3px 12px;border-radius:999px;font-size:12px;',
            'font-weight:800;color:#fff;white-space:nowrap;}',
            '.er-announce-badge-green{background:#22c55e;}',
            '.er-announce-badge-red{background:#ef4444;}',
            '.er-announce-person-name{font-size:14px;font-weight:800;color:#fff;text-align:center;}',
            // .er-announce-person/.er-announce-avatar-wrap are no longer
            // used by showResultAnnouncement() (replaced by
            // .er-announce-person-card/.er-announce-ring), but are kept
            // here — still referenced by showGiftReviveCard() and the
            // unused announcePersonHtml() helper. showGiftReviveCard()
            // itself was removed in this version (replaced by the "player
            // returned" splash — see showReviveSplash()/
            // #er-revive-splash-box below), so these two rules now have no
            // real caller besides the already-unused announcePersonHtml() —
            // left in place rather than removed (zero side effect either way).
            '.er-announce-person{display:inline-flex;flex-direction:column;align-items:center;gap:4px;',
            'vertical-align:middle;}',
            '.er-announce-avatar-wrap{display:block;width:106px;height:106px;border-radius:50%;position:relative;}',
            '.er-announce-avatar-wrap .er-ring-avatar,.er-announce-avatar-wrap .er-ring-avatar--fallback{',
            'width:106px;height:106px;}',
            /* Red glow behind the eliminated player's photo + fade-out */
            '.er-announce-effect-red{box-shadow:0 0 0 6px rgba(255,77,109,0.25),0 0 30px 10px rgba(255,77,109,0.55);',
            'border-radius:50%;}',
            '@keyframes er-target-fadeout{0%{opacity:1;}60%{opacity:1;}100%{opacity:0.15;}}',
            '.er-announce-target-fadeout img,.er-announce-target-fadeout .er-ring-avatar--fallback{',
            'animation:er-target-fadeout 2.6s ease forwards;}',
            /* Green glow behind the revived player's photo + ring color shift red->green */
            '.er-announce-effect-green{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);',
            'border-radius:50%;}',
            '@keyframes er-target-revive-ring{0%{box-shadow:0 0 0 6px rgba(255,77,109,0.35),0 0 30px 10px rgba(255,77,109,0.5);}',
            '100%{box-shadow:0 0 0 6px rgba(74,222,128,0.25),0 0 30px 10px rgba(74,222,128,0.55);}}',
            '.er-announce-target-revive-ring{animation:er-target-revive-ring 1.6s ease forwards;}',

            /* ======================================================================
             *  "Player returned" splash — a unified celebratory overlay
             *  centered above everything (even an open selection window;
             *  see the showReviveSplash() comment below for full context).
             *  Replaces both: (a) the small bottom-of-screen toast on a
             *  gift-triggered revival, and (b) the "X revived Y"
             *  announcement tab on a successful friend-revival — one
             *  unified window for any successful revival regardless of
             *  cause, instead of two different designs.
             *  pointer-events:none on the whole wrapper — purely
             *  informational, no buttons, must never block clicks on
             *  whatever's underneath (same as the toast/old floating
             *  revival card).
             * ==================================================================== */
            '#er-revive-splash-overlay{position:fixed;inset:0;z-index:100030;display:none;',
            'align-items:center;justify-content:center;pointer-events:none;}',
            '#er-revive-splash-box{width:300px;height:300px;box-sizing:border-box;border-radius:24px;',
            'border:4px solid #22c55e;background:radial-gradient(circle at 50% 32%,rgba(34,197,94,0.28),rgba(10,20,14,0.94) 72%);',
            'box-shadow:0 0 60px rgba(34,197,94,0.65),0 20px 50px rgba(0,0,0,0.5);',
            'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;',
            'padding:18px;text-align:center;color:#fff;font-family:Almarai,Cairo,sans-serif;',
            'opacity:0;transform:scale(0.6);}',
            '#er-revive-splash-box.er-revive-splash-anim{animation:er-revive-pop 0.45s cubic-bezier(.34,1.56,.64,1) forwards;}',
            '@keyframes er-revive-pop{0%{opacity:0;transform:scale(0.5);}60%{opacity:1;transform:scale(1.08);}100%{opacity:1;transform:scale(1);}}',
            // The heart is a PNG (revive-heart.png, next to index.html in
            // this game's folder) instead of a text emoji; content order is
            // heart, reason text, player photo, name.
            '.er-revive-splash-heart{width:58px;height:58px;object-fit:contain;',
            'animation:er-revive-heartbeat 1s ease-in-out infinite;',
            'filter:drop-shadow(0 0 10px rgba(34,197,94,0.85));}',
            '@keyframes er-revive-heartbeat{0%,100%{transform:scale(1);}25%{transform:scale(1.18);}45%{transform:scale(0.96);}}',
            '.er-revive-splash-reason{font-size:0.82em;font-weight:700;color:#c9f7d8;line-height:1.4;}',
            '.er-revive-splash-avatar{width:92px;height:92px;border-radius:50%;border:3px solid #22c55e;',
            'box-shadow:0 0 18px rgba(34,197,94,0.6);overflow:hidden;flex:none;}',
            '.er-revive-splash-avatar .er-ring-avatar,.er-revive-splash-avatar .er-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:1.6em;}',
            '.er-revive-splash-name{font-size:1.15em;font-weight:900;color:#fff;}',

            /* ---- Toasts ---- */
            '#er-toast-wrap{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);z-index:100020;',
            'display:flex;flex-direction:column;gap:8px;align-items:center;}',
            '.er-toast{background:rgba(20,8,35,0.92);border:1px solid rgba(124,58,237,0.55);color:#f3eefc;',
            'padding:10px 18px;border-radius:999px;font-size:0.85em;font-weight:700;box-shadow:0 6px 16px rgba(0,0,0,0.35);}',

            /* ---- Match-end screen ----
             * Full card redesign — a simple ring around the circular photo
             * fitting the game's theme: a "spinning gold" ring for the
             * winner (evokes the winning wheel), and a "dashed pink" ring
             * for the most-eliminations player (evokes a target/elimination
             * mark), with a small icon badge above each ring. */
            /* The winner screen has no panel/box behind the two cards —
             * the shared box (#er-modal-box) loses its background/border/
             * shadow/padding here only (er-winner-panel class, scoped to
             * this screen — see renderWinnerScreen), and the screen behind
             * it (the actual game stage) gets blurred (backdrop-filter)
             * instead of the old semi-opaque overlay. Every other tab in
             * this game (turn window/announcement/gift picker) keeps its
             * old solid look — the er-winner-panel/er-winner-backdrop
             * classes are removed immediately whenever any of those open
             * (see the matching comments in those functions). */
            '#er-modal-overlay.er-winner-backdrop{background:rgba(8,4,16,0.38);',
            'backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);}',
            '#er-modal-box.er-winner-panel{background:none;border:none;box-shadow:none;',
            'padding:0;width:auto;max-width:100%;overflow:visible;}',
            '#er-winner-box{text-align:center;}',
            '#er-winner-box h2{font-family:Almarai,Cairo,sans-serif;font-size:1.6em;color:#fff;',
            'text-shadow:0 2px 12px rgba(0,0,0,0.65);}',
            '.er-trophy-cards{display:flex;gap:16px;flex-wrap:wrap;justify-content:center;margin:14px 0 18px;}',
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
             * .er-ring-avatar/.er-ring-avatar--fallback (still used
             * elsewhere locally — the elimination/revival announcement and
             * the floating revival card, see ringAvatarHtml()). */
            '.er-ring-avatar{width:100%;height:100%;border-radius:50%;object-fit:cover;background:#5a2585;display:block;}',
            '.er-ring-avatar--fallback{display:flex;align-items:center;justify-content:center;',
            'color:#fff;font-weight:800;font-size:1.4em;}',

            '.er-winner-actions{display:flex;gap:10px;flex-wrap:wrap;}',
            '.er-btn-secondary{flex:1;min-width:180px;padding:12px;border-radius:999px;border:none;',
            'font-weight:800;cursor:pointer;font-family:inherit;font-size:0.95em;}',
            '#er-replay-same-btn{background:linear-gradient(90deg,var(--er-accent2),var(--er-accent));color:#0b0616;}',
            '#er-new-match-btn{background:#fff;border:1px solid var(--er-accent);color:#5a2585;}',

            /* ---- Gift-picker buttons (Twemoji icon + name + coin value) ---- */
            '.agp-pill-btn.er-gift-btn{display:inline-flex;flex-direction:column;align-items:center;',
            'justify-content:center;gap:3px;min-width:84px;margin:4px;padding:10px 8px;border-radius:14px;}',
            '.er-gift-icon{width:30px;height:30px;object-fit:contain;}',
            '.er-gift-name{font-size:0.82em;font-weight:700;}',
            '.er-gift-coins{font-size:0.72em;opacity:0.8;}',

            /* ---- Celebratory confetti effect (winner-screen cards) ---- */
            '.er-confetti-piece{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:2px;',
            'pointer-events:none;opacity:0;animation:er-confetti-burst 1.4s ease-out forwards;}',
            '@keyframes er-confetti-burst{0%{opacity:1;transform:translate(-50%,-50%) translate(0,0) rotate(0deg);}',
            '100%{opacity:0;transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(540deg);}}',

            /* ---- Match event log (left side, below the logo) ----
             * Hidden by default (display:none) — shown only via the
             * er-log-visible class (a dedicated show/hide button, see
             * ensureEventLog/#er-event-log-toggle below). Since it's
             * position:fixed (entirely outside #er-stage's layout),
             * showing/hiding it never moves or displaces anything else on
             * the game screen. */
            '#er-event-log{position:fixed;left:0;top:70px;bottom:0;width:250px;max-width:90vw;',
            'box-sizing:border-box;padding:14px 16px;overflow-y:auto;background:rgba(12,6,22,0.55);',
            'border-inline-end:1px solid rgba(156,143,176,0.25);z-index:20;display:none;}',
            '#er-event-log.er-log-visible{display:block;}',
            '#er-event-log h3{margin:0 0 10px;font-size:0.95em;font-weight:800;color:#e9d3ff;}',
            '.er-event-log-item{display:flex;align-items:flex-start;gap:8px;font-size:0.82em;color:#f3eefc;',
            'background:rgba(255,255,255,0.05);border-radius:10px;padding:6px 10px;margin-bottom:6px;line-height:1.5;}',
            '.er-event-icon{flex-shrink:0;}',
            '#er-event-log-toggle{position:fixed;left:14px;top:78px;z-index:21;width:42px;height:42px;',
            'border-radius:50%;border:1px solid rgba(156,143,176,0.4);background:rgba(20,8,35,0.9);color:#e9d3ff;',
            'font-size:1.15em;cursor:pointer;display:flex;align-items:center;justify-content:center;',
            'box-shadow:0 4px 14px rgba(0,0,0,0.4);transition:background 0.15s,transform 0.15s;}',
            '#er-event-log-toggle:hover{background:rgba(124,58,237,0.35);transform:translateY(-1px);}',
            '#er-event-log-toggle.er-log-toggle-active{background:rgba(124,58,237,0.55);',
            'border-color:var(--er-accent2);}',

            /* Visual contrast for the "friend revival"/"gift revival"
             * toggle switches on the settings screen: dark gray OFF ->
             * bright glowing green ON, instead of two near-identical
             * shades of purple. Scoped to this game only (!important +
             * selectors specific to these two switches), without touching
             * the shared js/agp-game-shell.js or any other game using it.
             */
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]) .agp-toggle-track,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]) .agp-toggle-track{',
            'background:linear-gradient(180deg,#4a4458,#332e40) !important;',
            'box-shadow:inset 0 2px 5px rgba(0,0,0,0.5) !important;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]:checked) .agp-toggle-track,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]:checked) .agp-toggle-track{',
            'background:linear-gradient(180deg,#4ade80,#16a34a) !important;',
            'box-shadow:inset 0 2px 5px rgba(0,0,0,0.35),0 0 12px rgba(74,222,128,0.65) !important;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]) .agp-toggle-track::before,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]) .agp-toggle-track::before{',
            'width:22px !important;height:22px !important;left:2px !important;top:2px !important;',
            'display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;',
            'content:"✕" !important;color:#7a7488;line-height:22px;text-align:center;}',
            'label.agp-toggle-switch:has(input[data-key="friendRevivalEnabled"]:checked) .agp-toggle-track::before,',
            'label.agp-toggle-switch:has(input[data-key="giftRevivalEnabled"]:checked) .agp-toggle-track::before{',
            'content:"✓" !important;color:#16a34a !important;transform:translateX(-20px) !important;}',

            /* Fallback background for the shared #agp-shell-box (settings/
             * lobby/reopened-drawer/mini-lobby) — same gradient used by
             * #er-modal-box above, for a consistent look across every
             * screen in this game before its more specific class (below)
             * takes over. #agp-shell-box itself is defined in the shared
             * js/agp-game-shell.js (used by every game); instead of editing
             * it there (which would affect every game), this rule is
             * injected here only, loaded after the shared file's own
             * styles, scoped by the same ID + !important — so it only
             * affects this game's page, never any other game sharing that
             * box. */
            // :not(.er-settings-initial-box) — this fallback must not
            // outrank the settings screen's own background:none rule
            // below. Both are !important, and since that rule now also
            // matches via a same-specificity [id^="agp-shell-box"]
            // attribute selector (needed so the connecting-layer's ghost
            // snapshot, id="agp-shell-box-ghost", keeps its styling too —
            // see the connecting-layer comment further down), it can no
            // longer out-specificity a plain #agp-shell-box ID selector.
            // Excluding the class here is simpler than re-adding an ID
            // variant to every one of those rules.
            '#agp-shell-box:not(.er-settings-initial-box){background:linear-gradient(180deg,#5F3976,#211528) !important;}',
            /* Lobby without a surrounding box — the title/hint line/card
             * grid/bottom bar float directly over the page's aurora
             * background (the box itself has no background/border). The
             * structural layout (fixed-height flex column + internal
             * scroll for the card grid only — PLAYER-CARD-STANDARDS.md §4)
             * is unchanged, only the background/border.
             */
            '#agp-shell-overlay:has(#agp-shell-box.agp-lobby-box){padding:0 !important;',
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
            '#agp-shell-box.agp-lobby-box{height:min(94vh,980px) !important;max-height:94vh !important;',
            'display:flex !important;flex-direction:column !important;overflow:hidden !important;}',
            '#agp-shell-box.agp-lobby-box > h2,',
            '#agp-shell-box.agp-lobby-box > .er-lobby-subtitle,',
            '#agp-shell-box.agp-lobby-box > .er-lobby-live-badge,',
            '#agp-shell-box.agp-lobby-box > .agp-join-hint,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-stage,',
            '#agp-shell-box.agp-lobby-box > #agp-entrance-settled-list{flex:0 0 auto !important;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{flex:1 1 auto !important;',
            'min-height:0 !important;overflow-y:auto !important;}',

            // "Ayman Games" logo as a transparent (25%) watermark in the
            // middle of the lobby box. Added as an img element via
            // enhanceLobbyWatermarkAndActions() — this just positions/fades it.
            '#er-lobby-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);',
            'width:55%;max-width:420px;opacity:0.25;pointer-events:none;z-index:0;}',
            // The lobby box's real content always stays above the watermark.
            '#agp-shell-box.agp-lobby-box > *:not(#er-lobby-watermark){position:relative;z-index:1;}',

            // Lobby title text/color is set by enhanceLobbyHeading() below
            // (replacing the h2's innerHTML — no change to the shared file).
            '#agp-shell-box.agp-lobby-box h2{text-shadow:none !important;letter-spacing:0.5px !important;',
            'font-family:"Cairo",sans-serif !important;}',
            // Title wave text ("لوبي الدخول") — animated purple/gold gradient,
            // matching the new design tokens; the game-name part next to it
            // stays plain gray. Built by enhanceLobbyHeading() below.
            '@keyframes er-lobby-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
            '.er-lobby-title-wave{background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5);',
            'background-size:200% 100%;-webkit-background-clip:text;background-clip:text;',
            'color:transparent !important;animation:er-lobby-wave 9s linear infinite;}',
            '.er-lobby-title-game{color:#8f88a3 !important;font-size:0.6em;text-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .er-lobby-subtitle{margin:9px 0 0;font-size:14px;',
            'line-height:1.85;color:#a79fbb;text-align:center;font-family:"IBM Plex Sans Arabic",sans-serif;}',
            '#agp-shell-box.agp-lobby-box .er-lobby-live-badge{display:inline-flex;align-items:center;',
            'gap:9px;margin:11px auto 0;padding:6px 15px;border-radius:999px;',
            'border:1px solid rgba(178,140,245,.35);background:rgba(122,63,212,.1);font-size:12.5px;',
            'color:#c6b4f2;font-family:"IBM Plex Sans Arabic",sans-serif;width:fit-content;}',
            '.er-lobby-live-dot{width:7px;height:7px;border-radius:50%;background:#7ee0a6;',
            'animation:er-lobby-blink 1.6s ease-in-out infinite;}',
            '@keyframes er-lobby-blink{0%,100%{opacity:.35}50%{opacity:1}}',

            // Keyword/player-count row — two capsules spread across the
            // width (keyword on the right, count on the left, per the new
            // design), built purely with CSS: the hint text forces its own
            // full-width line (order:-1), leaving the keyword badge and the
            // count badge as the row's only two items, spread apart via
            // justify-content:space-between.
            '#agp-shell-box.agp-lobby-box .agp-join-hint{display:flex !important;flex-wrap:wrap !important;',
            'justify-content:space-between !important;align-items:center !important;gap:10px !important;',
            'width:100% !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-hint-text{flex:0 0 100% !important;order:-1 !important;',
            'text-align:center !important;color:#a79fbb !important;font-weight:400 !important;',
            'font-size:14px !important;margin-bottom:2px !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge{order:0;display:inline-flex !important;',
            'align-items:center !important;gap:8px !important;background:rgba(178,140,245,.16) !important;',
            'border:1px solid rgba(178,140,245,.45) !important;border-radius:999px !important;',
            'padding:8px 18px !important;font-family:"Cairo",sans-serif !important;font-size:20px !important;',
            'font-weight:900 !important;color:#f0cd6a !important;box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-join-keyword-badge::before{content:"كلمة الدخول";',
            'font-family:"IBM Plex Sans Arabic",sans-serif;font-size:12.5px;font-weight:400;color:#cfc7e2;}',

            // Player-count badge — same element the shared file already
            // fills in (playerCountBadgeHtml, "current / max"); only its
            // position/colors change here, order:1 puts it on the left.
            '#agp-shell-box.agp-lobby-box #agp-lobby-count{position:static !important;order:1 !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge{display:inline-flex !important;',
            'align-items:center !important;gap:8px !important;background:rgba(126,224,166,.12) !important;',
            'border:1px solid rgba(126,224,166,.4) !important;border-radius:999px !important;',
            'padding:8px 18px !important;font-family:"Cairo",sans-serif !important;direction:ltr !important;',
            'font-size:24px !important;font-weight:900 !important;color:#7ee0a6 !important;',
            'box-shadow:none !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-count-badge::before{content:"عدد اللاعبين";',
            'direction:rtl;font-family:"IBM Plex Sans Arabic",sans-serif;font-size:12.5px;',
            'font-weight:400;color:#cfc7e2;}',

            /* ==================================================================
             * Player grid — 4 columns (matches the new design spec exactly:
             * grid-template-columns:repeat(4,minmax(0,1fr))), card size stays
             * 45px (unchanged setting, only the column count/colors move to
             * match the new design). Local !important override on the sizes
             * the shared AGP.playerCard component renders — its own default
             * (60px) and js/agp-player-card.js are untouched; same math it
             * already uses for 45px cards: pillW=145px, overlap=10px,
             * padStart=24px, padEnd=14px, plank height=36px, font=21px.
             * Scoped entirely to the lobby (.agp-lobby-box) — no effect on
             * the mid-match settings player list or any other use of the
             * card in this file.
             * ==================================================================== */
            '#agp-shell-box.agp-lobby-box .agp-shell-player-list{display:grid !important;',
            'grid-template-columns:repeat(4,minmax(0,1fr)) !important;gap:10px !important;',
            'justify-items:center !important;align-items:end !important;align-content:start !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic{width:45px !important;height:45px !important;',
            'border:1px solid rgba(255,255,255,.18) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-name-basic{width:145px !important;height:36px !important;',
            'margin-inline-start:-10px !important;padding-inline-start:24px !important;',
            'padding-inline-end:14px !important;font-size:21px !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;font-weight:700 !important;',
            'color:#f4f2fb !important;background:linear-gradient(180deg,rgba(255,255,255,.07),',
            'rgba(255,255,255,.03)) !important;border:1px solid rgba(255,255,255,.12) !important;}',
            '#agp-shell-box.agp-lobby-box .agp-pcard-avatar-basic--fallback{font-size:14px !important;}',
            // Manual-kick button (✕) on unframed cards — moved to the top
            // corner of the avatar circle (top:0;right:0) instead of the
            // shared file's default (top:-6px;left:-6px, outside the card
            // entirely), and recolored to the design's elimination red.
            // Scoped to :has(> .agp-pcard) so framed cards are untouched.
            '#agp-shell-box.agp-lobby-box li:has(> .agp-pcard) .agp-player-remove-btn{',
            'top:0 !important;left:auto !important;right:0 !important;',
            'width:16px !important;height:16px !important;font-size:9px !important;z-index:5;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn{',
            'background:rgba(224,115,111,.18) !important;border-color:rgba(224,115,111,.55) !important;',
            'color:#e0736f !important;}',
            '#agp-shell-box.agp-lobby-box .agp-player-remove-btn:hover{',
            'background:rgba(224,115,111,.3) !important;color:#ff9b96 !important;}',

            // Lobby bottom action row — the three buttons (back to
            // settings, start round, back to platform) sit in one row at a
            // fixed size (W360xH48) each, centered.
            '#agp-shell-box.agp-lobby-box .er-lobby-actions-row{flex:0 0 auto !important;',
            'display:flex;gap:14px;margin-top:14px;justify-content:center;',
            'flex-wrap:wrap;}',
            '.er-lobby-actions-row > *{width:360px !important;height:48px !important;',
            'max-width:360px !important;flex:0 0 360px !important;box-sizing:border-box !important;',
            'display:flex !important;align-items:center !important;justify-content:center !important;',
            'padding:0 14px !important;margin:0 !important;}',
            '.er-lobby-back-settings-btn{border-radius:999px;',
            'border:1px solid rgba(255,255,255,0.35);background:rgba(255,255,255,0.08);color:#fff;',
            'font-family:"Noto Kufi Arabic",sans-serif;font-weight:700;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.er-lobby-back-settings-btn:hover{background:rgba(255,255,255,0.18);}',
            '#agp-shell-box.agp-lobby-box .er-lobby-actions-row #agp-start-round-btn{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 22px 46px -24px rgba(122,63,212,1) !important;transition:background .25s !important;}',
            '#agp-shell-box.agp-lobby-box .er-lobby-actions-row #agp-start-round-btn:hover{',
            'background:#9a6cf0 !important;}',

            // "Back to platform" button — in the lobby it joins the same
            // three-button row (sized W360xH48 above); on the initial
            // settings screen it keeps its own default block layout (the
            // general rule below is the default, and .er-lobby-actions-row
            // above overrides it only inside the lobby row).
            '.er-back-to-platform-btn{display:block;margin:14px auto 0;padding:10px 22px;',
            'border-radius:999px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.08);',
            'color:#f3eefc;font-family:inherit;font-weight:800;font-size:0.9em;cursor:pointer;',
            'transition:background 0.15s;}',
            '.er-back-to-platform-btn:hover{background:rgba(255,255,255,0.18);}',

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
             * .er-settings-initial-box — no effect on the mid-match drawer
             * or the lobby screen.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-settings-initial-box){padding:0 !important;',
            'align-items:flex-start !important;justify-content:center !important;overflow:hidden !important;',
            'background:',
            'radial-gradient(60% 45% at 18% 8%,rgba(122,63,212,.22),transparent 70%),',
            'radial-gradient(50% 40% at 88% 40%,rgba(70,40,150,.22),transparent 72%),',
            'radial-gradient(55% 45% at 40% 104%,rgba(48,26,104,.26),transparent 74%),',
            'linear-gradient(rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(90deg,rgba(255,255,255,.028) 1px,transparent 1px),',
            'linear-gradient(180deg,#0d0a14 0%,#08060d 45%,#050508 100%) !important;',
            'background-size:auto,auto,auto,88px 88px,88px 88px,auto !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box{width:min(860px,94vw) !important;',
            'max-width:min(860px,94vw) !important;height:calc(100vh - 70px) !important;',
            'max-height:calc(100vh - 70px) !important;margin:70px 0 0 !important;overflow:visible !important;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;',
            'column-count:auto !important;column-gap:0 !important;',
            'background:none !important;border:none !important;border-radius:0 !important;',
            'box-shadow:none !important;padding:16px 4px 0 !important;box-sizing:border-box !important;',
            'font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box *{font-family:"IBM Plex Sans Arabic",sans-serif !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box > h2{flex:0 0 auto !important;margin:0 0 4px !important;',
            'max-width:none !important;width:100% !important;font-size:clamp(24px,3.6vw,40px) !important;',
            'font-weight:900 !important;line-height:1.4 !important;text-align:center !important;',
            'padding:0 !important;border-bottom:none !important;position:static;',
            'font-family:"Cairo",sans-serif !important;',
            'background:linear-gradient(90deg,#b28cf5,#f0cd6a,#d9a0f0,#b28cf5) !important;',
            'background-size:200% 100% !important;-webkit-background-clip:text !important;',
            'background-clip:text !important;-webkit-text-fill-color:transparent !important;',
            'animation:er-settings-wave 9s linear infinite !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box > h2::after{content:none !important;}',
            '@keyframes er-settings-wave{0%{background-position:0% 50%}100%{background-position:200% 50%}}',

            // Scroll area — flex:1 so the header/footer stay put and only
            // the fields scroll; scrollbar hidden (still scrolls via touch/
            // wheel), fade-out + thin glow line hint more content below.
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-scroll{position:relative;',
            'flex:1 1 auto;min-height:0;width:100%;margin-top:18px;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-scroll-inner{box-sizing:border-box;',
            'height:100%;overflow-y:auto;display:flex;flex-direction:column;gap:16px;',
            'padding:0 2px 26px;scrollbar-width:none;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-scroll-inner::-webkit-scrollbar{',
            'display:none;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-fade{position:absolute;inset:auto 0 0;',
            'height:44px;background:linear-gradient(transparent,#08060d);pointer-events:none;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-glowline{position:absolute;inset:auto 0 0;',
            'height:1px;background:linear-gradient(90deg,transparent,rgba(178,140,245,.55),transparent);',
            'pointer-events:none;}',

            // Plain rows — label right, control left, spaced only by the
            // scroll wrapper's gap (no divider lines, matching the design).
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field,',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-row{border-bottom:none !important;',
            'padding:2px 0 !important;max-width:none !important;margin:0 !important;display:flex !important;',
            'justify-content:space-between !important;align-items:center !important;width:100% !important;',
            'flex-wrap:wrap !important;gap:12px !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field{flex-direction:column !important;',
            'align-items:flex-start !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field label,',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-row-label{font-size:16px !important;',
            'font-weight:600 !important;color:#f4f2fb !important;text-align:right !important;',
            'font-family:"Noto Kufi Arabic",sans-serif !important;}',

            // Username/keyword text inputs — capsule pill, centered text.
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field input[type=text]{',
            'max-width:none !important;width:100% !important;background:rgba(255,255,255,.04) !important;',
            'border:1px solid rgba(255,255,255,.14) !important;border-radius:999px !important;',
            'padding:13px 18px !important;font-size:15px !important;font-weight:400 !important;',
            'text-align:center !important;transition:border-color .25s !important;color:#f4f2fb !important;',
            'box-sizing:border-box !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field input[type=text]:focus,',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-field input[type=text]:not(:placeholder-shown){',
            'border-color:rgba(178,140,245,.6) !important;outline:none !important;}',

            // Pill groups/buttons — capsule track, solid purple when active.
            '[id^="agp-shell-box"].er-settings-initial-box .agp-pill-group{gap:8px !important;padding:4px !important;',
            'border-radius:999px !important;',
            'background:linear-gradient(180deg,rgba(255,255,255,.06),rgba(255,255,255,.02)) !important;',
            'border:1px solid rgba(255,255,255,.12) !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 3px 10px -6px rgba(0,0,0,.6) !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-pill-btn{background:transparent !important;',
            'border:none !important;color:#a79fbb !important;padding:10px 16px !important;',
            'border-radius:999px !important;font-size:13.5px !important;font-weight:600 !important;',
            'transition:.25s !important;white-space:nowrap;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-pill-btn.agp-pill-active{',
            'background:#7a3fd4 !important;color:#f3ecff !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.3) inset,0 4px 10px -4px rgba(122,63,212,.7) !important;}',

            // Max-players counter — +/- buttons stay hidden (existing
            // behavior: type the number directly), pill-shaped field.
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-counter-row button{display:none !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-counter-row{justify-content:flex-end !important;',
            'flex:1;max-width:220px;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-count-input{',
            'background:rgba(255,255,255,.04) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'border-radius:999px !important;padding:13px 18px !important;width:100% !important;',
            'height:auto !important;color:#f4f2fb !important;font-size:15px !important;',
            'font-weight:400 !important;outline:none !important;text-align:center !important;',
            'box-sizing:border-box !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-count-input:focus{',
            'border-color:rgba(178,140,245,.55) !important;}',

            // Toggle switch — classic pill (50x28, 20px knob, 22px travel),
            // solid purple when on. Overrides the green ✓/✕ variant defined
            // above for this screen only (higher specificity via the ID).
            '[id^="agp-shell-box"].er-settings-initial-box .agp-toggle-switch{width:50px !important;',
            'height:28px !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-toggle-track{',
            'background:rgba(255,255,255,.07) !important;border:1px solid rgba(255,255,255,.14) !important;',
            'box-shadow:none !important;border-radius:999px !important;',
            'transition:background .25s,border-color .25s !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-toggle-track::before{content:none !important;',
            'background:#8f88a3 !important;box-shadow:none !important;width:20px !important;',
            'height:20px !important;left:3px !important;top:3px !important;border-radius:50% !important;',
            'transition:transform .25s,background .25s !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-toggle-switch input:checked + .agp-toggle-track{',
            'background:#7a3fd4 !important;border-color:#7a3fd4 !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-toggle-switch input:checked + .agp-toggle-track::before{',
            'background:#f3ecff !important;transform:translateX(-22px) !important;}',

            // "Card" sections (revive-by-gift, friend-revival) — bordered
            // rounded panel, built by wrapping the row(s) in .er-settings-card
            // inside layoutInitialSettingsFields().
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-card{width:100%;',
            'padding:16px 18px;border-radius:20px;border:1px solid rgba(255,255,255,.09);',
            'background:rgba(255,255,255,.03);box-sizing:border-box;display:flex;',
            'flex-direction:column;gap:12px;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-card > .agp-shell-row,',
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-card > .agp-shell-field{padding:0 !important;}',

            // Conditional fields (revive count + gift picker) — shown only
            // while the revive toggle is on, separated by a thin top divider
            // instead of the previous side accent bar.
            '[id^="agp-shell-box"].er-settings-initial-box .er-conditional-section{display:flex !important;',
            'flex-direction:column !important;gap:14px !important;margin-top:4px !important;',
            'padding-top:16px !important;border-top:1px solid rgba(255,255,255,.07) !important;',
            'border-right:none !important;padding-right:0 !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-conditional-section .agp-shell-row{',
            'border-bottom:none !important;padding:0 !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-gift-name-row{flex-direction:column !important;',
            'align-items:flex-start !important;gap:8px !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-gift-name-row .agp-shell-row-label{order:-1;}',

            // Gift picker trigger — dashed-border button spanning the row,
            // matching the design's "اختيار هدية من هدايا تيك توك" control.
            // The popup itself (all real TikTok gifts) is unchanged.
            '[id^="agp-shell-box"].er-settings-initial-box .er-gift-box-wrap{display:flex !important;',
            'width:100% !important;background:none !important;padding:0 !important;border:none !important;',
            'border-radius:0 !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-gift-box-wrap .agp-modal-trigger-btn{',
            'display:flex !important;width:100% !important;align-items:center !important;',
            'justify-content:space-between !important;gap:12px !important;',
            'background:rgba(122,63,212,.07) !important;border:1px dashed rgba(178,140,245,.4) !important;',
            'color:#e7e9ee !important;padding:12px 16px !important;border-radius:16px !important;',
            'font-size:13.5px !important;font-weight:400 !important;max-width:none !important;',
            'overflow:visible !important;text-overflow:clip !important;white-space:normal !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-gift-name-icon{width:16px !important;',
            'height:16px !important;flex-shrink:0 !important;}',

            // Caption under the "wheel shape" pills (enhanceWheelModeField).
            '[id^="agp-shell-box"].er-settings-initial-box .er-field-note{color:#8f88a3 !important;',
            'text-align:right !important;}',

            // Footer — the two bottom buttons side by side (primary button
            // on the right, back link on the left, per the design), instead
            // of the previous stacked column-spanning blocks.
            '[id^="agp-shell-box"].er-settings-initial-box .er-settings-footer{flex:0 0 auto !important;',
            'width:100% !important;display:flex !important;flex-wrap:wrap !important;',
            'align-items:center !important;justify-content:center !important;',
            'gap:clamp(16px,3vw,36px) !important;padding:20px 0 26px !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-btn-connect{',
            'order:1;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;justify-content:center !important;width:auto !important;',
            'max-width:none !important;margin:0 !important;padding:16px 42px !important;',
            'background:#7a3fd4 !important;color:#f3ecff !important;font-weight:700 !important;',
            'font-size:clamp(15px,1.8vw,17px) !important;border-radius:999px !important;',
            'letter-spacing:0.4px;font-family:"Noto Kufi Arabic",sans-serif !important;',
            'box-shadow:0 1px 0 rgba(255,255,255,.25) inset,0 22px 46px -24px rgba(122,63,212,1) !important;',
            'transition:background .25s,transform .25s !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .agp-shell-btn-connect:hover{',
            'background:#9a6cf0 !important;transform:translateY(-2px);}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-back-to-platform-btn{',
            'order:2;column-span:none !important;display:inline-flex !important;',
            'align-items:center !important;width:auto !important;margin:0 !important;padding:0 !important;',
            'border:none !important;background:transparent !important;font-size:14px !important;',
            'font-weight:400 !important;color:#a79fbb !important;transition:color .25s !important;}',
            '[id^="agp-shell-box"].er-settings-initial-box .er-back-to-platform-btn:hover{',
            'color:#d3bcff !important;background:transparent !important;}',

            /* ================================================================
             * Custom connecting layer (#er-conn-layer) — an element fully
             * separate from #agp-shell-box, added once to body. The shared
             * connecting/error box is hidden visually (not removed or
             * modified — just visibility:hidden) to avoid duplicating our
             * own layer. See ensureConnLayer/showConnLayer/syncConnLayer.
             * ================================================================ */
            '#agp-shell-box.agp-connecting-box,#agp-shell-box.agp-conn-error{visibility:hidden !important;}',
            '#er-conn-layer{position:fixed;inset:0;z-index:100010;display:none;',
            'align-items:center;justify-content:center;}',
            '#er-conn-layer.show{display:flex;}',
            '#er-conn-layer .er-conn-backdrop{position:absolute;inset:0;overflow:hidden;',
            'filter:blur(6px) brightness(0.55);pointer-events:none;}',
            '#er-conn-layer .er-conn-backdrop > *{pointer-events:none !important;}',
            '#er-conn-layer .er-conn-modal{position:relative;z-index:1;width:min(360px,90vw);',
            'background:linear-gradient(180deg,rgba(30,24,52,.98),rgba(11,10,18,.99));',
            'border:1px solid rgba(178,140,245,.32);border-radius:24px;',
            'padding:32px 26px;text-align:center;box-shadow:0 40px 90px -46px rgba(0,0,0,1);',
            'font-family:"Noto Kufi Arabic",sans-serif;}',
            '#er-conn-layer .er-conn-modal.er-conn-err{border-color:#ef4444;}',
            '#er-conn-layer::before{content:"";position:absolute;inset:0;background:rgba(5,2,8,0.45);}',
            '#er-conn-layer .er-conn-spinner{width:52px;height:52px;margin:0 auto 18px;',
            'border-radius:50%;border:4px solid rgba(178,140,245,.25);border-top-color:#b28cf5;',
            'animation:er-conn-spin 0.9s linear infinite;}',
            '@keyframes er-conn-spin{to{transform:rotate(360deg);}}',
            '#er-conn-layer .er-conn-err-icon{width:42px;height:42px;margin:0 auto 18px;',
            'border-radius:50%;background:rgba(239,68,68,0.15);color:#ef4444;font-size:22px;',
            'font-weight:900;display:flex;align-items:center;justify-content:center;}',
            '#er-conn-layer .er-conn-title{margin:0 0 6px;font-size:16.5px;font-weight:700;color:#f4f2fb;}',
            '#er-conn-layer .er-conn-modal.er-conn-err .er-conn-title{color:#ef4444;}',
            '#er-conn-layer .er-conn-sub{margin:0;font-size:13px;color:#8f88a3;',
            'font-family:"IBM Plex Sans Arabic",sans-serif;}',

            /* ================================================================
             * Mid-match settings drawer — same layout as Russian
             * Roulette/Tribe Roulette: slides in from the right edge, full
             * height, instead of a centered box. See enhanceReopenedDrawer above.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-inmatch-drawer){align-items:stretch !important;',
            'justify-content:flex-end !important;padding:0 !important;}',
            '#agp-shell-box.er-inmatch-drawer{position:fixed !important;top:0 !important;right:0 !important;',
            'left:auto !important;width:400px !important;max-width:90vw !important;height:100vh !important;',
            'max-height:100vh !important;border-radius:0 !important;margin:0 !important;',
            'background:rgba(15,8,20,0.96) !important;border:none !important;',
            'border-inline-start:1px solid rgba(0,215,255,0.35) !important;display:flex !important;',
            'flex-direction:column !important;overflow:hidden !important;padding:0 !important;',
            'animation:er-drawer-in .3s cubic-bezier(0.32,0.72,0,1);}',
            '@keyframes er-drawer-in{from{transform:translateX(105%);}to{transform:translateX(0);}}',
            '.er-drawer-header{display:flex;align-items:center;justify-content:space-between;',
            'padding:16px 18px;border-bottom:1px solid rgba(255,255,255,0.08);flex:none;}',
            '.er-drawer-header h2{font-size:1em !important;font-weight:900;margin:0 !important;',
            'padding:0 !important;color:#fff;}',
            '.er-drawer-tabs{display:flex;gap:6px;padding:10px 18px 0;flex:none;}',
            '.er-drawer-tabs button{flex:1;padding:8px 0;border-radius:8px 8px 0 0;border:none;cursor:pointer;',
            'background:transparent;color:#d9a9c6;font-family:inherit;font-weight:800;font-size:0.82em;',
            'border-bottom:2px solid transparent;}',
            '.er-drawer-tabs button.er-tab-active{color:#fff;border-bottom-color:#00D7FF;',
            'background:rgba(229,0,127,0.08);}',
            '.er-drawer-body,.er-drawer-players-tab{flex:1;min-height:0;overflow-y:auto;padding:14px 18px 18px;}',
            '.er-drawer-body .agp-shell-row,.er-drawer-players-tab .agp-shell-row,',
            '.er-drawer-body .agp-shell-field,.er-drawer-players-tab .agp-shell-field{display:flex !important;',
            'align-items:center !important;justify-content:space-between !important;gap:10px;',
            'padding:12px 0 !important;border-bottom:1px solid rgba(255,255,255,0.07);margin:0 !important;}',
            '.er-drawer-body .agp-shell-row-label,.er-drawer-players-tab .agp-shell-row-label,',
            '.er-drawer-body .agp-shell-field label,.er-drawer-players-tab .agp-shell-field label{',
            'font-size:0.82em !important;color:#d9a9c6 !important;font-weight:700 !important;}',
            '#agp-shell-box.er-inmatch-drawer:not(.er-tab-players) .er-drawer-players-tab{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer.er-tab-players .er-drawer-body{display:none !important;}',
            // The shared file's ready-made player-management field stays in
            // the settings tab (instead of moving to the players tab) —
            // only its internal list/counter are hidden, and the
            // "add new lobby" button (renamed) stays visible in its
            // original DOM position.
            '#agp-shell-box.er-inmatch-drawer .agp-settings-player-box{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer .agp-settings-player-row{display:block !important;}',
            '#agp-shell-box.er-inmatch-drawer #agp-settings-player-count{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer .agp-shell-field:has(#agp-settings-player-count) > label{display:none !important;}',
            '#agp-shell-box.er-inmatch-drawer #agp-reopen-registration-btn{width:100% !important;',
            'margin-top:6px !important;border:1px dashed rgba(0,215,255,0.5) !important;',
            'background:rgba(0,215,255,0.08) !important;color:#cdeeff !important;}',
            // ---- Custom players tab (search + filter + unified list) —
            // same layout as Tribe Roulette, recolored for this game. ----
            '#er-players-tab-search{width:100%;padding:8px 12px;border-radius:9px;',
            'background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);color:#fff;',
            'font-family:inherit;font-size:0.8em;margin-bottom:10px;box-sizing:border-box;}',
            '#er-players-tab-filter{display:flex;gap:5px;margin-bottom:10px;}',
            '#er-players-tab-filter button{flex:1;padding:5px 2px;border-radius:7px;',
            'border:1px solid rgba(255,255,255,0.14);background:transparent;color:#d9a9c6;',
            'font-family:inherit;font-weight:800;font-size:0.68em;cursor:pointer;}',
            '#er-players-tab-filter button.er-filter-active{background:rgba(0,215,255,0.14);',
            'border-color:#00D7FF;color:#fff;}',
            '.er-prow{display:flex;align-items:center;gap:8px;padding:7px 0;',
            'border-bottom:1px solid rgba(255,255,255,0.05);}',
            '.er-prow.er-prow-out{opacity:0.6;}',
            '.er-prow .er-prow-avatar{width:26px;height:26px;border-radius:50%;flex:none;overflow:hidden;}',
            '.er-prow.er-prow-out .er-prow-avatar{filter:grayscale(1);}',
            '.er-prow .er-prow-avatar .er-ring-avatar,.er-prow .er-prow-avatar .er-ring-avatar--fallback{',
            'width:100%;height:100%;font-size:0.7em;}',
            '.er-prow .er-prow-name{flex:1;font-size:0.8em;font-weight:700;overflow:hidden;',
            'text-overflow:ellipsis;white-space:nowrap;}',
            '.er-prow .er-prow-status{font-size:0.6em;padding:2px 8px;border-radius:999px;font-weight:800;flex:none;}',
            '.er-prow .er-prow-status.er-status-live{background:rgba(34,197,94,0.15);color:#4ade80;',
            'border:1px solid rgba(74,222,128,0.4);}',
            '.er-prow .er-prow-status.er-status-out{background:rgba(239,68,68,0.15);color:#f87171;',
            'border:1px solid rgba(248,113,113,0.4);}',
            '.er-prow .er-prow-action{width:22px;height:22px;border-radius:50%;border:none;',
            'color:#fff;font-weight:900;font-size:0.65em;cursor:pointer;flex:none;}',
            '.er-prow .er-prow-action.er-action-eliminate{background:#ef4444;}',
            '.er-prow .er-prow-action.er-action-revive{background:linear-gradient(135deg,#22c55e,#16a34a);}',

            /* ================================================================
             * "Add new lobby" window — 700x800, 70% transparency, single-color
             * border, 3-column grid of tightly-packed 45px cards (no row gap).
             * See enhanceMiniLobby above.
             * ================================================================ */
            '#agp-shell-overlay:has(#agp-shell-box.er-mini-lobby-active){align-items:center !important;',
            'justify-content:center !important;background:rgba(5,3,10,0.55) !important;',
            'padding:0 !important;}',
            '#agp-shell-box.er-mini-lobby-active{width:700px !important;max-width:94vw !important;',
            'height:800px !important;max-height:92vh !important;margin:0 !important;',
            'padding:28px 26px 22px !important;box-sizing:border-box !important;',
            'display:flex !important;flex-direction:column !important;',
            'background:rgba(42,20,67,0.7) !important;backdrop-filter:blur(18px);',
            '-webkit-backdrop-filter:blur(18px);border:1.5px solid #E5007F !important;',
            'border-radius:22px !important;',
            'box-shadow:0 0 0 1px rgba(229,0,127,0.15),0 0 40px rgba(229,0,127,0.25),',
            '0 20px 60px rgba(0,0,0,0.5) !important;position:relative;overflow:hidden;}',
            '#agp-shell-box.er-mini-lobby-active h2{flex:none !important;text-align:center !important;',
            'font-size:1.35em !important;margin:0 0 12px !important;max-width:none !important;',
            'background:linear-gradient(90deg,#E5007F,#f2cfe2 55%,#E5007F) !important;',
            '-webkit-background-clip:text !important;background-clip:text !important;',
            '-webkit-text-fill-color:transparent !important;}',
            '.er-mini-lobby-close-btn{position:absolute;top:16px;left:16px;width:34px;height:34px;',
            'border-radius:50%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.18);',
            'color:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;',
            'cursor:pointer;z-index:3;padding:0;font-family:inherit;}',
            '#agp-shell-box.er-mini-lobby-active .agp-join-hint{flex:none !important;text-align:center;',
            'display:flex !important;flex-direction:column !important;align-items:center !important;gap:8px;}',
            '#agp-shell-box.er-mini-lobby-active .agp-join-keyword-plain{display:inline-block;',
            'background:linear-gradient(90deg,#E5007F,#00D7FF);color:#150819;font-weight:900;',
            'padding:4px 16px;border-radius:999px;font-size:1.05em;letter-spacing:0.5px;}',
            '#agp-mini-lobby-count{display:block;color:#cbb8d6;font-size:0.75em;margin-top:4px;}',
            // Player grid — 3 columns, 45px cards (same real math used by
            // the lobby grid above: name plate 145px, overlap 10px,
            // padStart=24px, padEnd=14px, height=36px, font=21px), no row gap.
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-list{',
            'flex:1 1 auto !important;min-height:0 !important;overflow-y:auto !important;',
            'display:grid !important;grid-template-columns:repeat(3,1fr) !important;',
            'gap:0px 10px !important;margin:16px 0 0 !important;padding:4px 4px 10px !important;',
            'list-style:none;}',
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-list li{position:relative;',
            'display:flex !important;align-items:center;justify-content:center;}',
            '#agp-shell-box.er-mini-lobby-active .agp-pcard-avatar-basic{width:45px !important;',
            'height:45px !important;flex-shrink:0;position:relative;z-index:2;}',
            '#agp-shell-box.er-mini-lobby-active .agp-pcard-name-basic{width:145px !important;',
            'height:36px !important;margin-inline-start:-10px !important;',
            'padding-inline-start:24px !important;padding-inline-end:14px !important;',
            'font-size:21px !important;}',
            '#agp-shell-box.er-mini-lobby-active #agp-mini-lobby-done-btn{flex:none !important;',
            'display:block !important;width:100% !important;margin:16px 0 0 !important;',
            'padding:14px 0 !important;font-size:0.95em !important;letter-spacing:0.4px;',
            'background:linear-gradient(90deg,#E5007F,#00D7FF) !important;color:#150819 !important;',
            'border:none !important;border-radius:999px !important;',
            'box-shadow:0 10px 26px rgba(229,0,127,0.3),0 0 0 1px rgba(255,255,255,0.15) inset !important;}'
        ].join('');
        document.head.appendChild(style);
    }

    /* ======================================================================
     *  3) Main wheel screen
     * ==================================================================== */
    function ensureScaffolding() {
        injectStageStyles();
        if (!el('er-modal-overlay')) {
            var overlay = document.createElement('div');
            overlay.id = 'er-modal-overlay';
            overlay.innerHTML = '<div id="er-modal-chooser-card"></div><div id="er-modal-box"></div>';
            document.body.appendChild(overlay);
        }
        // The "choose who to eliminate/revive" box — fully independent
        // from #er-modal-overlay above. Its structure is built once here
        // (same pattern as #er-modal-overlay), then renderTurnModal()
        // updates only #er-select-chooser-slot/#er-select-candidates-grid
        // on each turn — no full rebuild, no re-wiring button listeners
        // each time.
        if (!el('er-select-overlay')) {
            var selectOverlay = document.createElement('div');
            selectOverlay.id = 'er-select-overlay';
            selectOverlay.innerHTML =
                '<div id="er-select-box">' +
                    '<div id="er-select-title"></div>' +
                    '<div id="er-chooser-row">' +
                        '<div id="er-select-chooser-slot"></div>' +
                        '<div id="er-select-actions">' +
                            '<button id="er-force-eliminate-btn" type="button">❌ إقصاء صاحب الدور</button>' +
                            '<button id="er-select-resume-btn" type="button">▶️ استئناف اللعبة</button>' +
                        '</div>' +
                    '</div>' +
                    '<div id="er-select-timer"></div>' +
                    '<div id="er-select-candidates-grid"></div>' +
                '</div>';
            document.body.appendChild(selectOverlay);
            el('er-force-eliminate-btn').addEventListener('click', handleForceEliminateClick);
            el('er-select-resume-btn').addEventListener('click', handleSelectResumeClick);
        }
        if (!el('er-toast-wrap')) {
            var toastWrap = document.createElement('div');
            toastWrap.id = 'er-toast-wrap';
            document.body.appendChild(toastWrap);
        }
        // The "player returned" splash — see the showReviveSplash()
        // comment below. Fully independent element, built once here like
        // every other piece in ensureScaffolding().
        if (!el('er-revive-splash-overlay')) {
            var splashOverlay = document.createElement('div');
            splashOverlay.id = 'er-revive-splash-overlay';
            splashOverlay.innerHTML = '<div id="er-revive-splash-box"></div>';
            document.body.appendChild(splashOverlay);
        }
    }

    function renderStage() {
        ensureScaffolding();
        ensureEventLog();
        var stage = el('er-stage');
        if (!stage) {
            stage = document.createElement('div');
            stage.id = 'er-stage';
            document.body.appendChild(stage);
        }
        stage.innerHTML =
            '<div id="er-wheel-wrap">' +
            '<div id="er-wheel-bezel"></div>' +
            '<div id="er-wheel-pointer"></div>' +
            '<div id="er-wheel"></div>' +
            '<button id="er-spin-hub" title="دوّر العجلة"><img src="../../logo.png" alt="ألعاب أيمن"><span>دور</span></button>' +
            '</div>' +
            '<div id="er-reel-wrap">' +
            '<div id="er-reel-pointer-line"></div>' +
            '<div id="er-reel-list"></div>' +
            '</div>' +
            '<div id="er-wheel-zoom-row">' +
            '<span>🔍−</span>' +
            '<input type="range" id="er-wheel-zoom-slider" min="' + WHEEL_SIZE_MIN + '" max="' + WHEEL_SIZE_MAX + '" step="10" value="' + _wheelSizePx + '" title="تكبير/تصغير العجلة">' +
            '<span>🔍+</span>' +
            '</div>' +
            '<button id="er-shuffle-btn" type="button">🔀 إعادة ترتيب عشوائية</button>' +
            '<button id="er-autoplay-btn" type="button"></button>';

        applyWheelSize(_wheelSizePx);
        renderWheelBulbs();
        renderWheelSlices();
        renderWheelLabels();
        renderReel();
        el('er-spin-hub').onclick = handleSpinClick;
        el('er-shuffle-btn').onclick = handleShuffleClick;
        el('er-autoplay-btn').onclick = function () {
            handleAutoPlayToggle(!_autoPlayActive);
            updateAutoPlayBtnLabel();
        };
        updateAutoPlayBtnLabel();
        // The wheel-shape field (wheelDisplayMode, in buildSettingsFields)
        // replaced the old floating toggle button. Restore the saved mode
        // (persists across renderStage() re-renders, like _wheelSizePx).
        var savedMode = _wheelDisplayMode;
        _wheelDisplayMode = 'wheel'; // the DOM always starts on the wheel shape
        if (savedMode === 'reel') setWheelDisplayMode('reel');
        el('er-wheel-zoom-slider').oninput = function () {
            handleWheelZoomChange(parseInt(this.value, 10));
        };
    }

    // Syncs the "auto-play" button's label/state with _autoPlayActive —
    // called on click and whenever auto-play stops from elsewhere
    // (stopAutoPlay on match end/reset) so it doesn't stay stuck on "stop".
    function updateAutoPlayBtnLabel() {
        var btn = el('er-autoplay-btn');
        if (!btn) return;
        btn.classList.toggle('er-autoplay-active', _autoPlayActive);
        btn.textContent = _autoPlayActive ? '⏸️ إيقاف التلقائي' : '▶️ العب التلقائي';
    }

    /**
     * Applies the wheel's size via inline style (overrides the CSS default),
     * clamped to a safe viewport-relative max (88vw) so it can't overflow
     * small screens even if the zoom slider is set higher.
     */
    function applyWheelSize(px) {
        var wrap = el('er-wheel-wrap');
        if (!wrap) return;
        var viewportSafeMax = Math.floor(window.innerWidth * 0.88);
        var applied = Math.max(WHEEL_SIZE_MIN, Math.min(px, viewportSafeMax));
        wrap.style.width = applied + 'px';
        wrap.style.height = applied + 'px';
    }

    function handleWheelZoomChange(px) {
        if (isNaN(px)) return;
        _wheelSizePx = Math.max(WHEEL_SIZE_MIN, Math.min(WHEEL_SIZE_MAX, px));
        applyWheelSize(_wheelSizePx);
        // Player-name radius is derived from the wheel's real clientWidth
        // (see renderWheelLabels) — must be recomputed for the new size.
        renderWheelLabels();
    }

    // Decorative fixed ring of 16 "bulbs" around the wheel — built once
    // (doesn't depend on player count).
    function renderWheelBulbs() {
        var bezel = el('er-wheel-bezel');
        if (!bezel || bezel.dataset.built) return;
        var n = 16;
        for (var i = 0; i < n; i++) {
            var angle = (360 / n) * i;
            var bulb = document.createElement('div');
            bulb.className = 'er-bulb';
            bulb.style.top = '50%';
            bulb.style.left = '50%';
            // Positioned via a transform built from the ring's own radius.
            bulb.style.transform =
                'translate(-50%,-50%) rotate(' + angle + 'deg) translate(0,-50%)';
            bezel.appendChild(bulb);
        }
        bezel.dataset.built = '1';
    }

    function renderWheelSlices() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        var n = _alive.length;
        if (!n) { wheel.style.background = '#2a1443'; return; }
        var anglePer = 360 / n;
        var stops = [];
        for (var i = 0; i < n; i++) {
            var color = WHEEL_PALETTE[i % WHEEL_PALETTE.length];
            var from = (anglePer * i).toFixed(2);
            var to = (anglePer * (i + 1)).toFixed(2);
            stops.push(color + ' ' + from + 'deg ' + to + 'deg');
        }
        wheel.style.background = 'conic-gradient(' + stops.join(',') + ')';
    }

    // Each player's name is rendered directly inside their wheel slice, as
    // children of #er-wheel itself (not a separate container) so they spin
    // automatically with the wheel (the parent's transform:rotate() applies
    // to all children) — same radial-positioning approach as
    // renderWheelBulbs().
    function renderWheelLabels() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        wheel.querySelectorAll('.er-wheel-label').forEach(function (n) { if (n.parentNode) n.parentNode.removeChild(n); });
        var n = _alive.length;
        if (!n) return;
        // A percentage translate(0,-X%) would be relative to the label's
        // own size, not the wheel's, so all names would collapse to a tiny
        // circle at the wheel's center (behind the spin button, invisible).
        // Compute an actual pixel radius from #er-wheel's real clientWidth
        // instead.
        var radiusPx = wheel.clientWidth ? (wheel.clientWidth / 2) * 0.62 : 130;
        var anglePer = 360 / n;
        _alive.forEach(function (p, i) {
            var angle = anglePer * i + anglePer / 2;
            var label = document.createElement('div');
            label.className = 'er-wheel-label';
            label.textContent = playerLabel(p);
            label.style.transform = 'translate(-50%,-50%) rotate(' + angle + 'deg) translate(0,-' + radiusPx.toFixed(1) + 'px)';
            wheel.appendChild(label);
        });
    }

    /**
     * Any change to the alive roster (elimination, revival, mid-match join,
     * shuffle) rebuilds the wheel's slices from scratch (renderWheelSlices/
     * renderWheelLabels), but the wheel's actual spin rotation
     * (_wheelRotation, from the last spin) used to stay as-is — so what
     * lands under the pointer after a roster change no longer matched the
     * real turn holder (the side "chooser" card was always correct, since
     * it's built from data, not the wheel's visual position — hence
     * reports like "the wheel stopped on one name but a different player
     * was picked"). Fix: reset the rotation to 0 on every roster change
     * (no visible animation — transition is disabled momentarily then
     * restored), so the wheel always matches its current roster until the
     * next real spin.
     */
    // Split out from realignWheelAfterRosterChange() so the rotation alone
    // can be reset without redrawing slices/labels when the roster itself
    // hasn't changed — see the handleSpinClick comment below for why this
    // reset is also needed after every turn ends, not just on roster changes.
    function resetWheelSpinPosition() {
        var wheel = el('er-wheel');
        if (!wheel) return;
        wheel.style.transition = 'none';
        _wheelRotation = 0;
        wheel.style.transform = 'rotate(0deg)';
        void wheel.offsetWidth; // force reflow so transition:none actually applies before it's restored
        wheel.style.transition = '';
    }

    function realignWheelAfterRosterChange() {
        renderWheelSlices();
        renderWheelLabels();
        resetWheelSpinPosition();
    }

    // "Shuffle" — reorders only the alive players (Fisher-Yates), then
    // redraws slices + labels in the new order. Disabled while a turn
    // window is open or the wheel is spinning (same guard as the spin
    // button) to avoid reordering mid-action.
    function shuffleArray(arr) {
        for (var i = arr.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = arr[i]; arr[i] = arr[j]; arr[j] = tmp;
        }
        return arr;
    }

    function handleShuffleClick() {
        if (!_matchActive || _pendingTurn) return;
        var spinBtn = el('er-spin-hub');
        if (spinBtn && spinBtn.disabled) return; // wheel is currently spinning
        if (_alive.length < 2) return;
        shuffleArray(_alive);
        realignWheelAfterRosterChange();
    }

    function showToast(message) {
        var wrap = el('er-toast-wrap');
        if (!wrap) return;
        var t = document.createElement('div');
        t.className = 'er-toast';
        t.textContent = message;
        wrap.appendChild(t);
        window.setTimeout(function () {
            if (t.parentNode) t.parentNode.removeChild(t);
        }, 4000);
    }

    /* ======================================================================
     *  4) Wheel spin
     * ==================================================================== */
    var _wheelRotation = 0;

    // Reduces (without fully preventing) the odds of the wheel/reel landing
    // on the same player who won the previous round. Their weight drops to
    // REPEAT_WINNER_WEIGHT of everyone else's (who remain equal among
    // themselves). Based on _lastWheelWinnerId (updated by
    // handleWheelLanded after each landing) — at this point it still holds
    // the *previous* round's winner, before being overwritten.
    var REPEAT_WINNER_WEIGHT = 0.35;

    function pickWeightedWinnerIndex() {
        var n = _alive.length;
        if (n <= 1) return 0;
        var weights = _alive.map(function (p) {
            return (p.id === _lastWheelWinnerId) ? REPEAT_WINNER_WEIGHT : 1;
        });
        var total = weights.reduce(function (a, b) { return a + b; }, 0);
        var r = Math.random() * total;
        for (var i = 0; i < n; i++) {
            r -= weights[i];
            if (r <= 0) return i;
        }
        return n - 1; // floating-point rounding fallback
    }

    /**
     * Fixed bug: the pointer would visually land on one player's name while
     * the selection window opened for a different actual chooser.
     *
     * Root cause: targetAngle below always assumed the wheel was currently
     * sitting at exactly 0deg, then added on top of _wheelRotation
     * accumulated from every previous spin. That assumption only holds if
     * _wheelRotation was actually reset before this spin (which happens in
     * realignWheelAfterRosterChange after a real roster change: eliminate/
     * revive/join/shuffle). But 3 turn-ending paths ("resume game", the
     * "skip turn only" timeout behavior, and the revival window timing out
     * with no pick) ended the turn without resetting the rotation even
     * though the roster hadn't changed — so _wheelRotation carried over
     * from the previous spin, the calculation wrongly assumed it was zero,
     * and the wheel visually landed on a completely different slice than
     * the real winnerIndex (which was always used correctly to determine
     * the turn holder from data — so the selection window itself always
     * showed the right name; only where the pointer visually stopped was
     * wrong). Fix: also call resetWheelSpinPosition() on all three paths,
     * so every spin actually starts from a true zero.
     */
    function handleSpinClick() {
        if (!_matchActive || _pendingTurn) return;
        if (_alive.length <= 1) return;
        if (_wheelDisplayMode === 'reel') handleReelSpinClick();
        else handleWheelSpinClick();
    }

    function handleWheelSpinClick() {
        var spinBtn = el('er-spin-hub');
        if (spinBtn) spinBtn.disabled = true;
        playSound('spin');

        var winnerIndex = pickWeightedWinnerIndex();
        var winner = _alive[winnerIndex];

        var n = _alive.length;
        var anglePer = 360 / n;
        var targetAngle = 360 * 5 + (360 - (winnerIndex * anglePer + anglePer / 2));
        _wheelRotation += targetAngle; // assumes _wheelRotation == 0 here (see comment above)

        var wheel = el('er-wheel');
        if (wheel) wheel.style.transform = 'rotate(' + _wheelRotation + 'deg)';

        window.setTimeout(function () {
            if (spinBtn) spinBtn.disabled = false;
            handleWheelLanded(winner);
        }, 3300);
    }

    // Same vertical-scroll-reel mechanism as Russian Roulette
    // (renderReel/handleReelSpinClick there) — ends in the same shared
    // handleWheelLanded as the wheel mode, so the "landed on..." logic
    // (repeat/friend-revival/elimination window) is identical regardless
    // of which shape is used.
    function renderReel() {
        var list = el('er-reel-list');
        if (!list || !_alive.length) return;
        var html = '';
        for (var r = 0; r < REEL_REPEATS; r++) {
            _alive.forEach(function (p, i) {
                html += '<div class="er-reel-item">' +
                    '<div class="er-reel-av">' + escapeHtml(playerLabel(p).slice(0, 1)) + '</div>' +
                    '<span class="er-reel-name">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="er-reel-num">' + (i + 1) + '</span>' +
                '</div>';
            });
        }
        list.innerHTML = html;
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
    }

    function handleReelSpinClick() {
        var spinBtn = el('er-spin-hub');
        if (spinBtn) spinBtn.disabled = true;
        playSound('spin');

        var winnerIndex = pickWeightedWinnerIndex();
        var winner = _alive[winnerIndex];
        var n = _alive.length;

        var list = el('er-reel-list');
        if (!list) { handleWheelLanded(winner); return; }
        list.style.transitionDuration = '0ms';
        list.style.transform = 'translateY(0px)';
        void list.offsetHeight;

        var targetRepeat = REEL_REPEATS - 1;
        var targetAbsoluteIndex = targetRepeat * n + winnerIndex;
        var viewportCenter = REEL_ITEM_H * 1.5;
        var translateY = -(targetAbsoluteIndex * REEL_ITEM_H) + viewportCenter - (REEL_ITEM_H / 2);

        list.style.transitionDuration = '3800ms';
        list.style.transform = 'translateY(' + translateY + 'px)';

        window.setTimeout(function () {
            if (spinBtn) spinBtn.disabled = false;
            var items = list.querySelectorAll('.er-reel-item');
            items.forEach(function (it) { it.classList.remove('er-reel-highlight'); });
            if (items[targetAbsoluteIndex]) items[targetAbsoluteIndex].classList.add('er-reel-highlight');
            handleWheelLanded(winner);
        }, 3800);
    }

    // Applies the wheel-shape field's value ('wheel'|'reel') immediately —
    // called from the real wheelDisplayMode settings field (see
    // enhanceWheelModeField below). No _pendingTurn check: it applies right
    // away even mid-turn. The "auto-play" button (er-autoplay-btn) stays
    // put under either shape; only the spin button itself (er-spin-hub)
    // actually moves (same element, not a copy) between under the wheel
    // and under the reel.
    function setWheelDisplayMode(mode) {
        if (mode !== 'wheel' && mode !== 'reel') return;
        _wheelDisplayMode = mode;
        var wheelWrap = el('er-wheel-wrap');
        var reelWrap = el('er-reel-wrap');
        var hub = el('er-spin-hub');
        var zoomRow = el('er-wheel-zoom-row');
        // The stage hasn't been built yet (before the match starts) —
        // _wheelDisplayMode is still recorded and applies automatically
        // the first time renderStage() runs.
        if (!wheelWrap || !reelWrap || !hub) return;

        if (mode === 'reel') {
            wheelWrap.style.display = 'none';
            if (zoomRow) zoomRow.style.display = 'none';
            reelWrap.style.display = 'block';
            renderReel();
            hub.classList.add('er-hub-standalone');
            reelWrap.insertAdjacentElement('afterend', hub);
        } else {
            wheelWrap.style.display = '';
            if (zoomRow) zoomRow.style.display = '';
            reelWrap.style.display = 'none';
            hub.classList.remove('er-hub-standalone');
            wheelWrap.appendChild(hub);
        }
    }

    // The "wheel shape" field (wheelDisplayMode, a real settings field)
    // shows automatically on both the initial settings screen and the
    // mid-match drawer, like any other pill-choice field. This function
    // adds the caption below it ("💡 scroll is the safe choice") and wires
    // an extra listener (addEventListener — doesn't conflict with the
    // shared file's own .onclick, which only saves the value into
    // _settingsValues) that calls setWheelDisplayMode() immediately,
    // instead of waiting for the next spin.
    function enhanceWheelModeField() {
        var box = el('agp-shell-box');
        if (!box) return;
        var pillBtns = box.querySelectorAll('[data-key="wheelDisplayMode"]');
        if (!pillBtns.length) return;
        var row = pillBtns[0].closest('.agp-shell-row');
        if (row && (!row.nextElementSibling || !row.nextElementSibling.classList.contains('er-field-note'))) {
            var note = document.createElement('div');
            note.className = 'er-field-note';
            note.textContent = '💡 السكرول خيار آمن';
            row.insertAdjacentElement('afterend', note);
        }
        pillBtns.forEach(function (btn) {
            // Guard against duplicate listeners: any secondary DOM change
            // inside #agp-shell-overlay (e.g. dragging the "volume" slider,
            // whose oninput updates textContent without a full rebuild)
            // re-triggers the MutationObserver, re-running
            // enhanceWheelModeField() on the same live buttons — without
            // this guard, each slider drag would stack another click
            // listener on the same button.
            if (btn.getAttribute('data-er-wired') === '1') return;
            btn.setAttribute('data-er-wired', '1');
            btn.addEventListener('click', function () {
                setWheelDisplayMode(btn.getAttribute('data-value'));
            });
        });
    }

    function handleWheelLanded(winner) {
        if (!winner) return;
        logEvent('spin', '🎡 وقفت العجلة عند ' + playerLabel(winner));

        var isRepeat = (_lastWheelWinnerId !== null && winner.id === _lastWheelWinnerId);
        _repeatStreak = isRepeat ? (_repeatStreak + 1) : 1;
        _lastWheelWinnerId = winner.id;

        if (_repeatStreak === 2 && liveSettings().friendRevivalEnabled) {
            _repeatStreak = 0; // consume the streak whether or not a revival window actually opens
            var eligibleForFriendRevival = _eliminated.filter(function (e) {
                return !_friendRevivedIds[e.player.id];
            });
            if (eligibleForFriendRevival.length > 0) {
                openRevivalWindow(winner, eligibleForFriendRevival.map(function (e) { return e.player; }), 'friend');
                return;
            }
            // No player is eligible for a "friend revival" (everyone already
            // used their chance, or no one is eliminated) — fall through to
            // normal elimination behavior instead of an empty revival window.
        }

        openEliminationWindow(winner);
    }

    /* ======================================================================
     *  4b) "Auto-play" — spins automatically after each turn (the generic
     *      button is defined in js/agp-game-shell.js via
     *      _config.midMatchToggleButton; this file only wires onToggle and
     *      performs the actual spin).
     * ==================================================================== */
    function handleAutoPlayToggle(isActive) {
        _autoPlayActive = isActive;
        if (_autoPlayActive) {
            maybeAutoSpin();
        } else if (_autoPlayTimer) {
            window.clearTimeout(_autoPlayTimer);
            _autoPlayTimer = null;
        }
    }

    function maybeAutoSpin() {
        if (!_autoPlayActive || !_matchActive || _pendingTurn) return;
        if (_alive.length <= 1) return;
        if (_autoPlayTimer) window.clearTimeout(_autoPlayTimer);
        _autoPlayTimer = window.setTimeout(function () {
            _autoPlayTimer = null;
            if (_autoPlayActive && _matchActive && !_pendingTurn && _alive.length > 1) {
                handleSpinClick();
            }
        }, 1800);
    }

    function stopAutoPlay() {
        _autoPlayActive = false;
        if (_autoPlayTimer) { window.clearTimeout(_autoPlayTimer); _autoPlayTimer = null; }
        updateAutoPlayBtnLabel();
    }

    /* ======================================================================
     *  5) Elimination window
     * ==================================================================== */
    function openEliminationWindow(chooser) {
        var candidates = _alive.filter(function (p) { return p.id !== chooser.id; });
        if (!candidates.length) return;

        _pendingTurn = { type: 'eliminate', candidates: candidates, chooser: chooser };
        renderTurnModal();
        startTurnTimer(function onTimeout() {
            applyEliminationTimeout(chooser);
        });
    }

    function applyEliminationTimeout(chooser) {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var behavior = liveSettings().eliminationTimeoutBehavior;
        closeTurnModal();
        if (behavior === 'eliminate_chooser') {
            // Uses STREAMER_ELIMINATOR_ID (instead of chooser.id) so the
            // announcement tab shows "the streamer" as the actual
            // eliminator — same effect as the red button.
            eliminatePlayer(chooser, STREAMER_ELIMINATOR_ID);
        } else {
            // 'skip_turn' — no elimination; auto-play continues the spin if active.
            // Must reset the wheel's rotation here too even though the
            // roster didn't change — see the handleSpinClick comment for
            // why (the pointer would otherwise visually land on the wrong
            // player).
            resetWheelSpinPosition();
            maybeAutoSpin();
        }
    }

    /**
     * @param {Object} target - the eliminated player
     * @param {string} [eliminatorId] - id of the turn holder who chose the
     *   elimination (for the "most eliminations" stat on the winner
     *   screen). Not counted if they eliminated themselves (timeout with
     *   the "eliminate chooser" behavior).
     */
    function eliminatePlayer(target, eliminatorId) {
        var idx = _alive.findIndex(function (p) { return p.id === target.id; });
        if (idx === -1) return;
        _alive.splice(idx, 1);
        _eliminated.push({ player: target });

        // The streamer (STREAMER_ELIMINATOR_ID) is excluded from the
        // "most eliminations" stat — not a real player in the match.
        if (eliminatorId && eliminatorId !== target.id && eliminatorId !== STREAMER_ELIMINATOR_ID) {
            _eliminationCounts[eliminatorId] = (_eliminationCounts[eliminatorId] || 0) + 1;
        }

        realignWheelAfterRosterChange();
        closeTurnModal();

        // STREAMER_ELIMINATOR_ID maps to an actual virtual card ("the
        // streamer") instead of the normal findPlayerByIdAnywhere lookup
        // (it doesn't exist as a real player in any array).
        var eliminatorPlayer = eliminatorId === STREAMER_ELIMINATOR_ID
            ? STREAMER_VIRTUAL_PLAYER
            : (eliminatorId ? findPlayerByIdAnywhere(eliminatorId) : null);
        logEvent('eliminate', '❌ ' + playerLabel(target) + ' تم إقصاؤه' +
            (eliminatorPlayer && eliminatorPlayer.id !== target.id ? (' بواسطة ' + playerLabel(eliminatorPlayer)) : ''));

        showResultAnnouncement('eliminate', {
            target: target,
            chooser: (eliminatorPlayer && eliminatorPlayer.id !== target.id) ? eliminatorPlayer : null
        }, function onDone() {
            if (_alive.length <= 1) {
                // This elimination might be the last one (ends the match).
                // Instead of declaring the winner immediately, wait an
                // extra FINAL_ELIMINATION_GIFT_GRACE_MS first — the gift
                // listener (wireGiftListener) keeps running the whole time
                // (the match is still _matchActive), so a valid revival
                // gift for the just-eliminated player arriving in that
                // window still revives them via the existing
                // revivePlayerByEntry. Re-check _alive.length after the
                // grace period: if a player came back, the match continues
                // normally (maybeAutoSpin) instead of declaring the wrong
                // winner; otherwise the result is announced exactly as before.
                window.setTimeout(function () {
                    if (_alive.length <= 1) {
                        endMatch(_alive[0] || null);
                    } else {
                        maybeAutoSpin();
                    }
                }, FINAL_ELIMINATION_GIFT_GRACE_MS);
            } else {
                maybeAutoSpin();
            }
        });
    }

    /* ======================================================================
     *  6) Revival window — "friend revival" (repeating the same name twice
     *     in a row; once per player per match)
     * ==================================================================== */
    function openRevivalWindow(chooser, candidates, via) {
        _pendingTurn = { type: 'revive', candidates: candidates, chooser: chooser, via: via };
        renderTurnModal();
        startTurnTimer(function onTimeout() {
            closeTurnModal(); // timing out with no pick just forfeits the revival chance
            // Same rotation reset needed on every path that doesn't change
            // the roster — see the handleSpinClick comment.
            resetWheelSpinPosition();
            maybeAutoSpin();
        });
    }

    function revivePlayer(target, chooserId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === target.id; });
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(target);
        _friendRevivedIds[target.id] = true; // used only for "friend revival" — once per lifetime

        realignWheelAfterRosterChange();
        closeTurnModal();

        var chooserPlayer = chooserId ? findPlayerByIdAnywhere(chooserId) : null;
        logEvent('revive', '💚 ' + playerLabel(target) + ' رجع للعبة' +
            (chooserPlayer ? (' بواسطة ' + playerLabel(chooserPlayer)) : ''));

        // The old "X revived Y" announcement tab (two-person cards,
        // showResultAnnouncement('revive',...)) was replaced by the
        // unified "player returned" splash below (see showReviveSplash()).
        // onDone (continuing auto-play) is unchanged, just called from the
        // new function instead of the old one.
        showReviveSplash(target, { reason: 'friend', chooser: chooserPlayer }, function onDone() {
            maybeAutoSpin();
        });
    }

    /* ======================================================================
     *  7) Shared turn window (eliminate or revive) — display + countdown +
     *     chat listener.
     *  Box (#er-select-overlay/box) ported from Russian Roulette's
     *  "selection phase" design, replacing the old layout for both the
     *  elimination and revival windows. Clicking a candidate card in the
     *  elimination window only selects it (red border + enables the red
     *  button's text) — the actual elimination happens via the button.
     *  The revival window has no red button at all (there's no meaningful
     *  "default target" for a revival): clicking a candidate card revives
     *  them immediately, and the only "resume game" button closes without
     *  reviving anyone (same effect as typing "skip" in chat, unchanged).
     *  ==================================================================== */
    function renderTurnModal() {
        ensureScaffolding();
        var overlay = el('er-select-overlay');
        var box = el('er-select-box');
        if (!overlay || !box || !_pendingTurn) return;

        var isRevive = _pendingTurn.type === 'revive';
        var roleClass = isRevive ? 'er-role-revive' : 'er-role-eliminate';
        box.className = roleClass;

        // One combined title line, no separate badge. The bold word names
        // the phase itself ("elimination phase"/"revival phase"), colored
        // by the same red=eliminate/green=revive system as the rest of
        // this window (see #er-select-title b in the CSS above).
        var titleLine = isRevive
            ? '<b>مرحلة الإنعاش</b> — اختر من الشات بكتابة الرقم، أو يدوياً بالنقر على بطاقة اللاعب'
            : '<b>مرحلة الإقصاء</b> — اختر من الشات بكتابة الرقم، أو يدوياً من الأزرار تحت';
        el('er-select-title').innerHTML = titleLine;

        el('er-select-chooser-slot').innerHTML = selectChooserCardHtml(_pendingTurn.chooser, roleClass);

        var grid = el('er-select-candidates-grid');
        grid.innerHTML = _pendingTurn.candidates.map(function (p, i) {
            return selectCandidateCardHtml(p, i, roleClass);
        }).join('');
        grid.querySelectorAll('.er-select-cand-card[data-index]').forEach(function (card) {
            card.onclick = function () {
                var idx = parseInt(card.getAttribute('data-index'), 10);
                // Clicking a candidate card in the elimination screen now
                // eliminates immediately (same resolveTurnSelection already
                // used by the revival screen — as if the turn holder typed
                // the player's number in chat) — replaces the old
                // select-then-confirm-with-button step entirely.
                resolveTurnSelection(idx);
            };
        });

        var forceBtn = el('er-force-eliminate-btn');
        forceBtn.style.display = isRevive ? 'none' : '';
        // The red button now exclusively eliminates the turn holder
        // themselves (there's no "selected candidate" state anymore, since
        // clicking a candidate card eliminates immediately) — fixed label.
        if (!isRevive) forceBtn.textContent = '❌ إقصاء صاحب الدور';

        if (AGP.playerCard) AGP.playerCard.fitAllNames(grid);

        overlay.style.display = 'flex';
    }

    // playerCardHtml is isolated in its own function — uses the shared
    // AGP.playerCard (js/agp-player-card.js) deliberately without a frame
    // (showFrame:false); still used by the result-announcement tab
    // (showResultAnnouncement, see below). The elimination/revival windows
    // have their own local card (selectCandidateCardHtml) instead, to
    // match Russian Roulette's layout.
    function playerCardHtml(p) {
        if (!AGP.playerCard) return '<span>' + escapeHtml(playerLabel(p)) + '</span>';
        return AGP.playerCard.renderHtml(p, { showFrame: false });
    }

    // The enlarged "turn holder" card inside the #er-chooser-row —
    // an 88px ring (same ringAvatarHtml used on the winner/announcement
    // screens) + their name + fixed number (playerNumber) side by side.
    function selectChooserCardHtml(chooser, roleClass) {
        return '<div class="er-select-chooser-card">' +
            '<div class="er-select-chooser-ring ' + roleClass + '">' + ringAvatarHtml(chooser) + '</div>' +
            '<div>' +
                '<div class="er-select-chooser-nmrow">' +
                    '<span class="er-select-chooser-nm" data-agp-pcard-name="1">' + escapeHtml(playerLabel(chooser)) + '</span>' +
                    '<span class="er-select-chooser-num ' + roleClass + '">' + playerNumber(chooser) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // Candidate card in the selection grid — 60px avatar overlapping a
    // pill name plate (standard-lobby-card-v1 style), with the fixed
    // number (playerNumber) a normal part of the plate's flow right after
    // the name (not absolutely positioned).
    function selectCandidateCardHtml(p, index, roleClass) {
        return '<div class="er-select-cand-card" data-index="' + index + '">' +
            '<div class="er-select-cand-row">' +
                '<div class="er-select-cand-avatar">' + ringAvatarHtml(p) + '</div>' +
                '<div class="er-select-cand-plate">' +
                    '<span class="er-select-cand-name" data-agp-pcard-name="1">' + escapeHtml(playerLabel(p)) + '</span>' +
                    '<span class="er-select-cand-num ' + roleClass + '">' + playerNumber(p) + '</span>' +
                '</div>' +
            '</div>' +
        '</div>';
    }

    // selectCandidateManually() was removed entirely — clicking a
    // candidate card now eliminates immediately (resolveTurnSelection), so
    // there's no more "selected but not confirmed" state needing visual
    // distinction or a changing button label.

    // The red button (elimination window only, hidden in the revival
    // window) — eliminates the turn holder themselves exclusively.
    // eliminatorId is STREAMER_ELIMINATOR_ID (not chooser.id) so the
    // announcement tab shows "the streamer" as the eliminator, with an
    // actual card — same effect as the elimination-timeout path (see
    // applyEliminationTimeout below).
    function handleForceEliminateClick() {
        if (!_pendingTurn || _pendingTurn.type !== 'eliminate') return;
        var chooser = _pendingTurn.chooser;
        if (!chooser) return;
        AGP.timerManager.stop(TIMER_NAME);
        eliminatePlayer(chooser, STREAMER_ELIMINATOR_ID);
    }

    // "Resume game" — the only button in the revival window, and one of
    // two in the elimination window. Closes the turn without eliminating
    // or reviving anyone. Elimination window only: resets the wheel's
    // rotation (see the handleSpinClick comment) and resumes auto-play if
    // active — the revival window does neither (matches typing "skip" in
    // chat, unchanged).
    function handleSelectResumeClick() {
        if (!_pendingTurn) return;
        var isRevive = _pendingTurn.type === 'revive';
        AGP.timerManager.stop(TIMER_NAME);
        closeTurnModal();
        if (!isRevive) {
            resetWheelSpinPosition();
            maybeAutoSpin();
        }
    }

    var _turnTickUnsub = null;
    var _turnEndUnsub = null;
    var _warningPlayedForSecond = null;

    // #er-modal-chooser-card is a leftover element from the old
    // elimination/revival window design — no longer filled by the current
    // renderTurnModal, but showResultAnnouncement/renderWinnerScreen still
    // call this defensively (in case it's left visible from a previous
    // state) — harmless to keep, cheaper than tracking down every caller.
    function hideChooserCard() {
        var card = el('er-modal-chooser-card');
        if (card) { card.style.display = 'none'; card.innerHTML = ''; }
    }

    function closeTurnModal() {
        var overlay = el('er-select-overlay');
        if (overlay) overlay.style.display = 'none';
        AGP.timerManager.stop(TIMER_NAME);
        if (typeof _turnTickUnsub === 'function') _turnTickUnsub();
        if (typeof _turnEndUnsub === 'function') _turnEndUnsub();
        _turnTickUnsub = null;
        _turnEndUnsub = null;
        _pendingTurn = null;
        _warningPlayedForSecond = null;
    }

    function startTurnTimer(onTimeout) {
        var seconds = liveSettings().eliminationTimerSeconds || 30;
        AGP.timerManager.start(TIMER_NAME, seconds);
        updateTimerDisplay(seconds);
        _turnTickUnsub = AGP.events.on('timer:tick', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            updateTimerDisplay(payload.remainingSeconds);
            // Last 10 seconds: a warning beep, once per second (the timer
            // itself already ticks every second, giving a "pulse" feel
            // until time runs out).
            if (payload.remainingSeconds > 0 && payload.remainingSeconds <= 10 && _warningPlayedForSecond !== payload.remainingSeconds) {
                _warningPlayedForSecond = payload.remainingSeconds;
                playSound('warning');
            }
        });
        _turnEndUnsub = AGP.events.on('timer:ended', function (payload) {
            if (payload.name !== TIMER_NAME) return;
            onTimeout();
        });
    }

    function updateTimerDisplay(seconds) {
        var t = el('er-select-timer');
        if (!t) return;
        t.textContent = '⏱️ ' + seconds + ' ث';
        t.classList.toggle('er-timer-warning', seconds > 0 && seconds <= 10);
    }

    /**
     * @param {number} index - the player's index within _pendingTurn.candidates (0-based)
     */
    function resolveTurnSelection(index) {
        if (!_pendingTurn) return;
        var target = _pendingTurn.candidates[index];
        if (!target) return;

        var type = _pendingTurn.type;
        var chooserId = _pendingTurn.chooser && _pendingTurn.chooser.id;
        AGP.timerManager.stop(TIMER_NAME);

        if (type === 'eliminate') {
            eliminatePlayer(target, chooserId);
        } else if (type === 'revive') {
            revivePlayer(target, chooserId);
        }
    }

    /* ======================================================================
     *  7b) Result-announcement tab (eliminate/revive) — 4 seconds + sound
     * ==================================================================== */
    /**
     * Redesigned: instead of the old big icon+title+name, a small box
     * (~650x300) with a single sentence "[avatar+name] eliminated/revived
     * [avatar+name]". Red+fade effect for the eliminated player's photo,
     * green effect + ring color shift red->green for the revived player.
     * @param {Object} data - {target, chooser} full player objects (not
     *   just strings like the old design). chooser may be null (e.g. the
     *   turn holder eliminating themselves on timeout).
     * This is no longer called at all with type='revive' (replaced by the
     * newer showReviveSplash() — see its comment). The revive branch in
     * this function (isEliminate===false) is currently dead code, kept
     * rather than removed (zero side effect, easy to revisit later). The
     * eliminate branch (type='eliminate') is still actively called,
     * unchanged.
     */
    function showResultAnnouncement(type, data, onDone) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) { if (typeof onDone === 'function') onDone(); return; }
        hideChooserCard();

        var isEliminate = type === 'eliminate';
        playSound(isEliminate ? 'eliminate' : 'revive');

        // Only the winner screen removes this class; the announcement tab
        // keeps its old solid look.
        overlay.classList.remove('er-winner-backdrop');

        // The sentence names both players directly ("X successfully
        // eliminated Y"); each side gets a person card (145px wide) with a
        // colored ring around the photo (112px, 5px padding) + a role
        // badge pill ("✅ eliminated"/"❌ was eliminated") + the name,
        // stacked vertically with an 8px gap, no separate icon between the
        // two photos (the two badges are enough to tell the roles apart).
        // Only the eliminated side's photo is desaturated (60%) + slightly
        // transparent.
        // The revive case uses the same structure (sentence + two
        // same-size cards), colored green for both sides since it's a
        // positive outcome for everyone, with two differently-worded
        // badges ("✅ revived"/"💚 returned") to tell the roles apart
        // instead of color.
        var actorName = data.chooser ? playerLabel(data.chooser) : '';
        var targetName = playerLabel(data.target);
        var titleHtml;
        if (data.chooser) {
            titleHtml = isEliminate
                ? ('قام ' + escapeHtml(actorName) + ' بإقصاء ' + escapeHtml(targetName) + ' بنجاح')
                : ('قام ' + escapeHtml(actorName) + ' بإرجاع ' + escapeHtml(targetName) + ' بنجاح');
        } else {
            titleHtml = isEliminate
                ? ('تم إقصاء ' + escapeHtml(targetName) + ' بنجاح')
                : ('تم إرجاع ' + escapeHtml(targetName) + ' بنجاح');
        }

        var actorCardHtml = data.chooser
            ? announcePersonCardHtml(data.chooser, {
                ringClass: 'er-announce-ring-green',
                badgeClass: 'er-announce-badge-green',
                badgeText: isEliminate ? '✅ أقصى' : '✅ رجّع'
            })
            : '';
        var targetCardHtml = isEliminate
            ? announcePersonCardHtml(data.target, {
                ringClass: 'er-announce-ring-red er-announce-ring-desaturate',
                badgeClass: 'er-announce-badge-red',
                badgeText: '❌ انقصى'
            })
            : announcePersonCardHtml(data.target, {
                ringClass: 'er-announce-ring-green',
                badgeClass: 'er-announce-badge-green',
                badgeText: '💚 رجع'
            });

        // The 💀 emoji between the two cards represents elimination —
        // eliminate case only (doesn't make sense for revive, so it's omitted there).
        var vsEmojiHtml = isEliminate ? '<span class="er-announce-vs-emoji">💀</span>' : '';
        box.className = 'er-announce-box ' + (isEliminate ? 'er-announce-eliminate' : 'er-announce-revive');
        box.innerHTML =
            '<div class="er-announce-title">' + titleHtml + '</div>' +
            '<div class="er-announce-row">' + actorCardHtml + vsEmojiHtml + targetCardHtml + '</div>';

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            overlay.style.display = 'none';
            box.className = '';
            if (typeof onDone === 'function') onDone();
        }, 3000);
    }

    // showResultAnnouncement() no longer uses this function (replaced by
    // announcePersonCardHtml below) — kept in place since it's harmless
    // and other code might still reference it later.
    function announcePersonHtml(player, effectClass) {
        return '<span class="er-announce-person">' +
            '<span class="er-announce-avatar-wrap ' + effectClass + '">' + ringAvatarHtml(player) + '</span>' +
            '<span class="er-announce-person-name">' + escapeHtml(playerLabel(player)) + '</span>' +
            '</span>';
    }

    /**
     * Person card for the result-announcement tab (colored ring around the
     * photo + role badge pill + name). See showResultAnnouncement() above
     * for full context.
     * @param {Object} opts - {ringClass, badgeClass, badgeText}
     */
    function announcePersonCardHtml(player, opts) {
        opts = opts || {};
        return '<div class="er-announce-person-card">' +
            '<div class="er-announce-ring ' + (opts.ringClass || '') + '">' + ringAvatarHtml(player) + '</div>' +
            '<div class="er-announce-role-badge ' + (opts.badgeClass || '') + '">' + (opts.badgeText || '') + '</div>' +
            '<div class="er-announce-person-name">' + escapeHtml(playerLabel(player)) + '</div>' +
            '</div>';
    }

    /* ======================================================================
     *  8) Listening to the stream chat — pick a number, or type "skip"
     *     (revival only)
     * ==================================================================== */
    function wireCommentListener() {
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_pendingTurn || !payload || typeof payload.text !== 'string') return;

            var chooser = _pendingTurn.chooser;
            if (!chooser || (payload.id !== chooser.id && payload.name !== chooser.name)) return;

            var text = payload.text.trim();

            // "skip" is only allowed in the revival window — closes it
            // without reviving anyone (same effect as the "resume game"
            // button; the button was added later as a manual alternative,
            // it didn't remove the chat "skip" command).
            if (_pendingTurn.type === 'revive' && text === 'تخطي') {
                AGP.timerManager.stop(TIMER_NAME);
                closeTurnModal();
                return;
            }

            var n = parseInt(text, 10);
            if (isNaN(n)) return;
            // The number typed in chat is matched against the player's
            // fixed number (playerNumber — see its comment near the top of
            // the file), the one actually shown on their card, not the
            // index into the temporary candidates array (which reorders
            // every round as _alive shrinks/changes) — that mismatch used
            // to make some numbers "not register".
            var idx = -1;
            for (var i = 0; i < _pendingTurn.candidates.length; i++) {
                if (playerNumber(_pendingTurn.candidates[i]) === n) { idx = i; break; }
            }
            if (idx === -1) return;
            resolveTurnSelection(idx);
        });
    }

    /* ======================================================================
     *  9) Gift-triggered revival — via the existing stream:giftReceived event
     * ==================================================================== */
    function wireGiftListener() {
        _giftUnsub = AGP.events.on('stream:giftReceived', function (payload) {
            var settings = liveSettings();
            if (!settings.giftRevivalEnabled) return;
            if (!payload || !payload.giftName) return;
            if (payload.giftName !== settings.giftRevivalGiftName) return;

            var entry = _eliminated.filter(function (e) {
                return e.player.id === payload.id || e.player.name === payload.name;
            })[0];
            if (!entry) return;

            // The match already ended (even after eliminatePlayer's
            // FINAL_ELIMINATION_GIFT_GRACE_MS window) before this gift
            // arrived — tell the host it arrived late instead of silently
            // dropping it with no trace.
            if (!_matchActive) {
                showToast('🎁 وصلت هدية إنعاش لـ' + playerLabel(entry.player) + ' بعد ما خلصت المباراة');
                return;
            }

            var maxCount = settings.giftRevivalMaxCount || 1;
            var usedCount = _giftReviveCounts[entry.player.id] || 0;
            if (usedCount >= maxCount) {
                showToast('⚠️ ' + playerLabel(entry.player) + ' استخدم كل مرات الإنعاش بالدعم المسموحة');
                return;
            }

            _giftReviveCounts[entry.player.id] = usedCount + 1;
            revivePlayerByEntry(entry);
        });
    }

    function revivePlayerByEntry(entry) {
        var idx = _eliminated.indexOf(entry);
        if (idx === -1) return;
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);

        realignWheelAfterRosterChange();

        logEvent('gift', '🎁 ' + playerLabel(entry.player) + ' رجع للعبة عن طريق الدعم');
        // See showReviveSplash() below — replaced the old
        // showGiftReviveCard() small bottom-of-screen toast.
        showReviveSplash(entry.player, { reason: 'gift' });
        // Not added to a currently-open elimination window's candidate
        // list — they'll appear starting the next wheel turn (already in
        // _alive now).
    }

    /**
     * "Player returned" — a unified celebratory window for any successful
     * revival, regardless of cause (gift, or "friend revival" from the
     * selection window). Replaces two previously separate designs: (a) the
     * old showGiftReviveCard() (small bottom-of-screen toast, gift case
     * only), and (b) the revive branch of showResultAnnouncement()
     * (two-person "who revived whom" cards, friend-revival case only) —
     * one unified window instead of two different designs. The eliminate
     * branch of showResultAnnouncement() is unaffected and still works as
     * before.
     *
     * A gift-triggered revival can happen at any moment — even mid-turn
     * with a selection window open — so it can't reuse the #er-modal-box
     * tab (would interrupt the current turn). For that same reason,
     * #er-revive-splash-overlay is a fully independent element with
     * pointer-events:none: it never intercepts a click or interrupts
     * whatever window is open underneath it — it just floats visually
     * above it for two seconds, then disappears on its own.
     * @param {Object} player - the player who returned to the match
     * @param {Object} opts - {reason: 'gift'|'friend', chooser?: player}
     *   chooser (optional, 'friend' case only) - the turn holder who chose
     *   to revive them, shown by name in the reason text (same info the
     *   old "who revived whom" card used to show).
     * @param {Function} [onDone] - called after the tab auto-closes
     *   (exactly two seconds later) — same role as showResultAnnouncement()'s
     *   onDone, keeps the game flow going (e.g. maybeAutoSpin() after a
     *   friend revival). The gift case doesn't pass onDone since nothing
     *   further follows it in the original code (it just showed the toast).
     */
    function showReviveSplash(player, opts, onDone) {
        opts = opts || {};
        ensureScaffolding();
        var overlay = el('er-revive-splash-overlay');
        var box = el('er-revive-splash-box');
        if (!overlay || !box || !player) {
            if (typeof onDone === 'function') onDone();
            return;
        }

        playSound('revive');

        var reasonHtml;
        if (opts.reason === 'friend' && opts.chooser) {
            reasonHtml = '💚 ' + escapeHtml(playerLabel(opts.chooser)) + ' أرجعه للعبة عن طريق إنعاش صديق!';
        } else if (opts.reason === 'friend') {
            reasonHtml = '💚 رجع للعبة عن طريق إنعاش صديق!';
        } else {
            reasonHtml = '🎁 رجع للعبة عن طريق الدعم!';
        }

        // Order: heart (PNG) at the top, reason text right below it, then
        // the player's photo, then their name under the photo — same
        // template for both the 'gift' and 'friend' cases.
        box.innerHTML =
            '<img class="er-revive-splash-heart" src="revive-heart.png" alt="">' +
            '<div class="er-revive-splash-reason">' + reasonHtml + '</div>' +
            '<div class="er-revive-splash-avatar">' + ringAvatarHtml(player) + '</div>' +
            '<div class="er-revive-splash-name">' + escapeHtml(playerLabel(player)) + '</div>';

        overlay.style.display = 'flex';
        // Restart the pop-in animation if this window shows twice in quick
        // succession (e.g. two revival gifts within two seconds) — remove
        // the class, force a reflow via offsetWidth, then re-add it.
        box.classList.remove('er-revive-splash-anim');
        void box.offsetWidth;
        box.classList.add('er-revive-splash-anim');

        if (_reviveSplashTimer) window.clearTimeout(_reviveSplashTimer);
        _reviveSplashTimer = window.setTimeout(function () {
            overlay.style.display = 'none';
            _reviveSplashTimer = null;
            if (typeof onDone === 'function') onDone();
        }, 2000);
    }

    /* ======================================================================
     *  10) Syncing a player removal (the 🗑️ button on the settings screen
     *      mid-match — js/agp-game-shell.js via AGP.player.removePlayer,
     *      which emits player:removed) — a full, permanent removal,
     *      outside the elimination/revival flow.
     * ==================================================================== */
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;

        var aliveIdx = _alive.findIndex(function (p) { return p.id === removedPlayer.id; });
        if (aliveIdx !== -1) _alive.splice(aliveIdx, 1);

        var elimIdx = _eliminated.findIndex(function (e) { return e.player.id === removedPlayer.id; });
        if (elimIdx !== -1) _eliminated.splice(elimIdx, 1);

        if (aliveIdx === -1 && elimIdx === -1) return; // wasn't part of an active match anyway (e.g. removed before the round started)

        realignWheelAfterRosterChange();

        // If the exact turn holder was the one removed while their window
        // is open, cancel the turn entirely (no elimination/revival)
        // instead of leaving an inconsistent state.
        //
        // Fixed bug: an early return here used to skip the end-of-match
        // check below entirely — if removing the turn holder themselves
        // (the permanent 🗑️ delete button, not a manual elimination) was
        // the last decrement bringing _alive to 1 or fewer, the match hung
        // forever (the turn window closed, but no winner screen ever
        // showed and no spin resumed) because endMatch() was never called
        // on this path. Fix: always fall through to the end-of-match
        // check below, instead of an early return that blocked it.
        if (_pendingTurn && _pendingTurn.chooser && _pendingTurn.chooser.id === removedPlayer.id) {
            closeTurnModal();
        } else if (_pendingTurn) {
            // If they were just one of the candidates in an open window, rebuild it without them.
            _pendingTurn.candidates = _pendingTurn.candidates.filter(function (p) { return p.id !== removedPlayer.id; });
            if (!_pendingTurn.candidates.length) closeTurnModal();
            else renderTurnModal();
        }

        if (_matchActive && _alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }

    /**
     * Fixes a mid-match player-join bug (the "add new lobby" button on the
     * settings screen) — see the player:joined listener comment above.
     * Does nothing unless a match is actually active and the player isn't
     * already present (neither alive nor eliminated — guards against a
     * false duplicate if the event fires more than once for any reason).
     */
    function handlePlayerJoinedMidMatch(newPlayer) {
        if (!newPlayer || !newPlayer.id || !_matchActive) return;
        var alreadyAlive = _alive.some(function (p) { return p.id === newPlayer.id; });
        var alreadyEliminated = _eliminated.some(function (e) { return e.player.id === newPlayer.id; });
        if (alreadyAlive || alreadyEliminated) return;
        _alive.push(newPlayer);
        assignPlayerNumber(newPlayer); // see the _playerNumbers comment
        realignWheelAfterRosterChange();
    }

    /* ======================================================================
     *  10b) Match event log — a fixed side panel (450px) from below the
     *       logo to the bottom of the screen, on the same side as the logo.
     *       Continuously logs 5 event types: spin, eliminate, revive,
     *       player join, gifts.
     * ==================================================================== */
    var EVENT_ICONS = { spin: '🎡', eliminate: '❌', revive: '💚', join: '➕', gift: '🎁' };
    var EVENT_LOG_MAX = 60;

    // The log is hidden by default (see the er-log-visible CSS) — a small
    // fixed round button toggles it. The log itself is position:fixed,
    // entirely outside #er-stage's layout, so showing/hiding it never
    // displaces anything else on the game screen; the toggle button stays
    // put and clickable regardless of the log's state (higher z-index).
    function ensureEventLog() {
        if (!el('er-event-log')) {
            var log = document.createElement('div');
            log.id = 'er-event-log';
            log.innerHTML = '<h3>📋 أحداث المباراة</h3><div id="er-event-log-list"></div>';
            document.body.appendChild(log);
        }
        if (!el('er-event-log-toggle')) {
            var btn = document.createElement('button');
            btn.id = 'er-event-log-toggle';
            btn.type = 'button';
            btn.title = 'إظهار/إخفاء أحداث المباراة';
            btn.textContent = '📋';
            btn.onclick = function () {
                var logEl = el('er-event-log');
                if (!logEl) return;
                var visible = logEl.classList.toggle('er-log-visible');
                btn.classList.toggle('er-log-toggle-active', visible);
            };
            document.body.appendChild(btn);
        }
    }

    function logEvent(type, text) {
        ensureEventLog();
        var list = el('er-event-log-list');
        if (!list) return;
        var item = document.createElement('div');
        item.className = 'er-event-log-item';
        item.innerHTML = '<span class="er-event-icon">' + (EVENT_ICONS[type] || '•') + '</span><span>' + escapeHtml(text) + '</span>';
        list.insertBefore(item, list.firstChild);
        while (list.children.length > EVENT_LOG_MAX) {
            list.removeChild(list.lastChild);
        }
    }

    /* ======================================================================
     *  11) Max players — actually closes joining (not AGP.lobby.close()
     *      alone — see the note at the top of the file; the real
     *      checkKeyword() in agp-keyword-manager.js never checks AGP.lobby).
     * ==================================================================== */
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
     *  12) Match end + points reporting (same real dashboard-core path —
     *      no change to the point values themselves, just the shared
     *      general system). The call used to be fire-and-forget without
     *      reading the result — now we actually await it (result.awarded)
     *      before rendering the winner screen, so the card can show the
     *      points actually earned.
     * ==================================================================== */
    function endMatch(winner) {
        _matchActive = false;
        stopAutoPlay();
        closeTurnModal();
        if (typeof _commentUnsub === 'function') _commentUnsub();
        if (typeof _giftUnsub === 'function') _giftUnsub();

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                return {
                    tiktokUsername: tiktokUsernameFor(p),
                    won: Boolean(winner) && p.id === winner.id
                };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () {
                    // Fail silently (network/backend) — doesn't block
                    // showing the match result (same pattern as
                    // dashboard-core.js), but returns null so the winner
                    // screen can tell "failed" apart from "no linked account".
                    return null;
                });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });

        pointsPromise.then(function (pointsResult) {
            renderWinnerScreen(winner, pointsResult);
        });
    }

    /**
     * Looks up this player's entry in result.awarded (matched by
     * tiktokUsername only — the same key sent in the participants list
     * above). Only present if the account is linked and verified (see
     * authService.findVerifiedUserByTikTok on the backend) — otherwise
     * returns null ("no linked account").
     */
    function findAwardedFor(pointsResult, player) {
        if (!pointsResult || pointsResult.success !== true || !Array.isArray(pointsResult.awarded)) return null;
        var uname = tiktokUsernameFor(player);
        if (!uname) return null;
        return pointsResult.awarded.filter(function (a) { return a.tiktokUsername === uname; })[0] || null;
    }

    /**
     * Points text next to the card — 3 cases:
     *  1) pointsResult === null (the shared points system call failed, or
     *     AGPAuth isn't available at all) -> neutral "couldn't fetch
     *     points right now" text, since we genuinely don't know whether
     *     they have an account (distinct from case 3).
     *  2) The account is linked/verified and has an entry in awarded ->
     *     real points earned + "shows on your profile".
     *  3) The account isn't linked/verified (the call succeeded but has no
     *     entry for this player) -> "needs to create an account" prompt.
     */
    // Class names here (agp-trophy-points/agp-points-*) match the shared
    // format defined in js/agp-player-card.js
    // (AGP.playerCard.renderTrophyCard) — this HTML is passed to it via
    // opts.pointsHtml, so it must use the exact same class names.
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

    /**
     * A circular avatar with a simple ring (deliberately not using
     * AGP.playerCard here — that builds a "pill: photo+name side by side"
     * card, while this design needs a standalone circular photo inside a
     * ring, with the name as separate text below it).
     */
    function ringAvatarHtml(player) {
        var name = playerLabel(player);
        var avatarUrl = player && player.avatarUrl;
        var initials = (name || '').trim().slice(0, 2).toUpperCase() || '؟';
        return avatarUrl
            ? '<img class="er-ring-avatar" src="' + escapeHtml(avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.outerHTML=\'<div class=&quot;er-ring-avatar er-ring-avatar--fallback&quot;>' + escapeForInlineOnerrorJs(initials) + '</div>\';">'
            : '<div class="er-ring-avatar er-ring-avatar--fallback">' + escapeHtml(initials) + '</div>';
    }

    // The old local ringHtml()/trophyCardHtml() (the "300x400 glass card +
    // colored ring") were removed entirely — that design moved to the
    // shared AGP.playerCard.renderTrophyCard() in js/agp-player-card.js,
    // called directly by renderWinnerScreen() below. ringAvatarHtml()
    // above is kept as-is (still used elsewhere — the elimination/revival
    // announcement and the floating revival card).

    function computeMostEliminations() {
        var bestId = null, bestCount = 0;
        Object.keys(_eliminationCounts).forEach(function (id) {
            if (_eliminationCounts[id] > bestCount) { bestCount = _eliminationCounts[id]; bestId = id; }
        });
        if (!bestId) return null;
        var player = findPlayerByIdAnywhere(bestId);
        return player ? { player: player, count: bestCount } : null;
    }

    // Confetti effect on winning — replaces the old card's removed
    // background/border. Pure CSS/JS colored pieces (no external images,
    // consistent with this project's "no stock images" rule), launched
    // from the card's center at random angles/distances.
    // Winner's crown icon — a fixed PNG (a flat gold crown with an orange
    // base and a purple gem), embedded here as a base64 data URI directly
    // in this file — no external link or separate image file (keeps the
    // file self-contained). Resized locally (512x512 original -> 160x160 +
    // color compression) just to shrink it before embedding — the visual
    // design itself is unchanged.
    var CROWN_ICON_DATA_URI = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAACgCAMAAAC8EZcfAAAAwFBMVEX80xb84zX81h7431z7lAD72FL+5zT94Vj95Fn8jwCZZ578kgDUr3azh4n9mgH/qFb5XAC4uAp1Paj/f3/HoIR/fwD///+/fwD//6oAAAD95Fn91AL9mQD93i/6xwD7iAH+5DP//wD+pwn/qQD/fwCBS6GQWrP+mAD+vgD/4QL/AAD//1T//n79mAH91AL7iQH/82D+1wN6Q6X/vz/6yAD+tgH6yAD7yQL91QL90gP7igD+1AT95FH91AP93jD+5WB9Tnm4AAAAQHRSTlNhE6HtKBjXWqih/2r//8sDAwP/Av8CAQQDAP7+/v79/v4B/gMC//9IBP4BAwKvz8P+D/8E0f8rDrFRVi0QjtL+LQhbUQAAC01JREFUeNrtnIl22joQhmUgSbM16XIXYexY2JcYk9DSkBCapHn/t7qSVy0zsth6OfegnqatS6yPf2Z+jQSB0D0f5AB4AIRGnB0U3Agw6aVZtr+AMb0dnvKvewuY0I/DQY+xfQWMaW8wGJ5zzj0FTOn9cDD42IvZfgIm9JzzDXgWJmwPAa/zAOeDBzneN0AR1fPBoCakbAXHzpLkNyjYOx3c3JSAw4+3+6Vglpx/u8lHRTj4eB6zzPm59dapfLJKdQxuqlGF+dHVbhJ6+/gx2TFg7/RmoAByCXvOgMLds3jHOcgRG8Lh4L63mrvf090CitUtr5KccMjVo8xNP5YLOBiskYWrKciT6I+SUMhn5hSbTAD7Zr3C3d0zYv2VJE5oQfgtBuLF6i+qfPS2TFrwWW13qbvOermCkBZ39KjT8fgfsjld53lRe6d7XqzbLOR2MziF+Y750Ahp7zwv/orRvbLWBGRMSNjLEogvCoJIJsyyxptqe7+/XUHDtTrq0+E3U0BW8AnCo5owtxfD3e/pTgGTrHdvZmBc8QVB90NDyK6r9bEiHA5OexnbJSA47mq+qN///uFVzsOfkr0P+fK9+10dixMbn0r4F+8mzitA4TN0pV6cbF+/grCJMr2+pr0S8JSu2ohvBZDpfBohT9ifOeA3Gu96JXHk0wmvi/Wnx//y+wFBviIPWXOY08sDvOt2CzZuD+LLCZt840u4cPf/BJB2jiE+QUivGvP8Ofi2s46aeezLxLvDAH9FMGC/K9s5+9mrQ85SxvjvLQGyKi4TBq98JCoIDcATeoc1vvm4YtsA5DfxSKf74eTIbPVKE0QINb7KYfhNXsjz9Jm8IDdcDZBRrxNFUf/79z43DvCGDzDhCf8P+IZv/tj3+e+3h3ZC0lqjr8fH5czfu69fwBt6EOEJvwy1Gmw2FXh8BMcdr/UUrw3wLq/RegGDkwoiRPgo+/O55OPfcNxp6nw9wCvqRXKBniA3NAiR+uAhXTZ8QRR5bUFuAZzQTiTpwiWcUBdCjI/jlAIWrWPUgRPVFTCjV79kwH53gj1jQRhUhFh8RYX4jYAc8NdmCvL7BUqI+6/YDRn7O6gMu0vvGLbjmpUFUgG2xbgN8LW4UzvgFfOaGB8xNMIVYBniXw8bAdbrWLN4MXu25o/FU5V/+1RRsLNhkXAPPpaK8zuaXEmZDOUjj7B5U/o2lnOQbFYkopeS5+3fMZca6XdPsHnrGEdlCrYdgLYZ9aS2jyifFw3dn0pPg6dCSsm4SkJhg7GbUTPGHAg54BH2KE8SMI8xUiaLKsYcjwf4Cj2wYw1g0ZkxROyJ6BaqqbEclEvE6uiMksoIo46HPagAyr+SouWZzVie6fDk9Dhqsn/SXiJ4maR06VdG+Isi8RUYs8Wi6MwI/URT3p350+dlAicOY0dBs5yAhA9KiZT1/gDp91Lx5QWCiNwjnTAM52QmBGf0aV60Z+PpE0jIlIah+wpkF7sy2v4ucIIVN3wR/+Uh03GgUAx/zjcJhD7xvxVj7L9AtVLKUwF2j9iXthKBy4Rli6m00PESmYB8YcEnuF4omXFcvyKcwoBaR3Onb070EoHLhHuq1ArmgEDFJbNSvzAHSgnxawX5hSVQKEwFFFN7+ooNtfzass1SqvCJZS6GbNKv8MQgZB7KgM9mWlQdjSSOZjZmiUBlwioDLPngToar4Ut8/pTIuPzfsXlIrzXVxUomE7IHcGfcVfKFlStI3ciAVcLoIlSJdMCZ8T1qjQA7jkkGCag5kmSA9QCqpAL0NcBGUQYAqiloTH4FlIheJqlkgA2g2e8zmuqAc5kQzEEGAXLCchn9Qj3sZKEuk5g++UonjTaDcZGDTUgJ8WXCZZy21kht2MxSIkqZ8B5ravKBVZLGRAFcktp2csolnRkbYy+Cj66Oio0H8/DDo+IRCVtM1QJGq4TFVAYcTxdEMm5xfUk1rwZrpEyxB1a0Y7CAIg+yiciRyTPEl1fJJ/0cSC6KsVhJ8qXPbwjftBMduEaa478YKZGmTFLdANEqSemsIy0j4+cnmhBROKQzrwHFVfnkrtw29SFCbjbIKtKUyd3CMEAZMFFO5Z6aZW7K26vcPYv2iy2e5hW4v5RErDae4PT9E3uExVOY4Xz8xql0jF2Hl2NMn6oGtemoSbPEvC1oihzOGISvaInkZeIBBt0ASkczKV106i5mTDhb8YYSUjfZ0pqSd4bMXiNVGdgEFP//AhiguZbw6pXCy9uspNqAkGY7qFh4FWa8RsrusGMFfP8wtfCJJPSM8IrRrLikSdG5ssa8pXmYLTVSDLuA/b6Nr1pLlPAWC1pi7ItTrc8ZT1/yzaitRsQI7IDvAWgwslWzT2p4+dxvdQ3IgMRXl2mfiAMDa43UAuIP6Fv4qipRw5snGDMAE7E5UQHHPMyxvUbaBCwAMT5RJXET3mbmGRDijKZzDTAPs7VGHATsB36AD56EZG7wyVsjgjY6ZZiPrYDtAtaPQQCN8GpNH6GWJKwLcCNAC2EUmHi+sOkUVJCEEKAg3CDCNkCYT+yGIQUTYztQj80E7GMeE/kwnz8DAQ2rbid0ExCREJPP95/lHofgW1KF8N1RwMtLRwlxPtmmFUCsSopEdAO8+Pz5wkVCPLyqTWsKPoUoICSiGeGLH//88+OiHRCXT68RGTDTGhp9dN/bBOyeCcCzbluM7XzTlGbwIXoCWjUaZlPAS87HCS/tElrDm9t0jJzyW5PQDLMh4EXOx8eFDdAun2bTKiBq1ZKI7zhgt8QbjYAgN3y+nU+kIKagxaqBMBsRPvtRAY7OMMAoaOXz1fMrGTDL6LwNsAmzLuBlwzcafYXLpC28eY2o+3Kibpw7fjthEWZdwAuZbzTqQhK2h1e3aQOQOAAWYdYE7J6pgEYaRpJ8tgnGSwtgi1UrYdYANb7R6NIMsgOebtMG4MINsN6lVa9NXOh8o5HuNb4b33RhAaz6hXZAX91tNg7TDD3ITni6TeuAblUivWBeTv71swmoV3LXKTiaTZuAxA0wspcIWCZuybO0Kpg4JmGgnycAOdg1tvAuqePrLzMQ/ZXauRMg0idIhF+xU5CWGtEPhQl4yB6uFmHAZ87AHXLr0G3aAHRLwgDYi2iF3IWOwhwAly2AsZNVg5s5JQ0vLCddq9i0mYMuVRLAR25SkC9tJ13WFJy1AFZddbiygDyCox94P+gmoWHTJqCLVWNnlpaO2rFMDJs2AT+1V0mAnprjexJXCZfGa2NmiFurBD/vQHd1zoCzVkBeJy1WHVhOpbF9sWuZTM2XPwnyemi4hoAiyJ8/X1qPaVa0aQCw1artx/qXly3nSCvWCKSgPQkDxxOttSR8cQhxm1W7HQmuCeg5APKHzC0xDqLNAG1lAr0hAQC0W/WmAtokhGoEALRbdbQpoE3CpZOC1r1nEG1WInYJZ8AbsyDABW7VGwtoA5wytzfZWs6qtyEgGmOegp+cAC1WHWxBQFRCyKZBQMsx4TYijEv4Ar0jEwwxZtWbriItEs4cAekfRUMT7kZAFPAZfBcyAd9L3EFfVtyGgHDHANo0Boi87rklAREJl9TRZlCr3h4gKOGTc4gz2KqjcmzO994HbTpz/mmI8pM5mjHc/Xg8hd+pjwA2P9mvfADBLsf9ngMOD4AHwAPgAXCPAQePj9rdHocbX3hUL2wCOOArZajcjF94tF545BeG1guhdmETQDG9cjMxm6/PFlov+NpTGBoXNgXU5QhXAwx1jbcJePOo3VxMpyZQ6IctFzRg8STDHVbxcOsXDj54ADwAHgAPgP8nwDj/DMRm3JjLwPYBz+GfeCfIp6T8VMftzkePZmt9EMTvG9lqn1QRJ8qIdz6SNT9K4z8fB8D/PeC/QZ+CRt3wTxkAAAAASUVORK5CYII=';

    var CONFETTI_COLORS = ['#ffd400', '#ff4dff', '#00c2ff', '#7c3aed', '#4ade80', '#ff6b8a'];
    function spawnConfetti(container, count) {
        if (!container) return;
        count = count || 26;
        for (var i = 0; i < count; i++) {
            var piece = document.createElement('span');
            piece.className = 'er-confetti-piece';
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

    function renderWinnerScreen(winner, pointsResult) {
        ensureScaffolding();
        hideChooserCard();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        var mostElim = computeMostEliminations();

        // The winner/most-eliminations cards are built via the shared
        // AGP.playerCard.renderTrophyCard() (js/agp-player-card.js): crown
        // (winner only) -> photo -> name -> points only. The same info
        // (game name + who won) moved to a single line above the card row
        // (the h2 below) instead of repeating it inside each card.
        var cardsHtml = '';
        if (winner) {
            cardsHtml += AGP.playerCard.renderTrophyCard(winner, {
                cls: 'er-trophy-winner', kind: 'winner', cardId: 'er-trophy-card-winner',
                showCrown: true, crownIconDataUri: CROWN_ICON_DATA_URI,
                pointsHtml: pointsHtmlFor(pointsResult, winner)
            });
        }
        if (mostElim) {
            cardsHtml += AGP.playerCard.renderTrophyCard(mostElim.player, {
                cls: 'er-trophy-most', kind: 'most', cardId: 'er-trophy-card-most',
                pointsHtml: pointsHtmlFor(pointsResult, mostElim.player)
            });
        }

        // The winner screen specifically has no panel/box behind the two
        // cards — instead of the shared solid box (er-modal-box: purple
        // gradient + border + shadow), the background (the game screen
        // behind it) gets blurred (backdrop-filter) and the two cards
        // float directly over it. The er-winner-panel/er-winner-backdrop
        // classes are scoped to this screen only (removed as soon as
        // renderTurnModal/showResultAnnouncement/openGiftPickerModal open)
        // — every other tab in this game keeps its old solid look, unchanged.
        box.className = 'er-winner-panel';
        box.style.textAlign = 'center';
        overlay.classList.add('er-winner-backdrop');
        box.innerHTML =
            '<div id="er-winner-box">' +
            '<h2>🏁 انتهت المباراة .. الشخص الرهيب الي فاز بلعبة "' + escapeHtml(GAME_NAME) + '"</h2>' +
            '<div class="er-trophy-cards">' + (cardsHtml || '<p style="color:#fff;font-weight:800;">بدون فائز</p>') + '</div>' +
            '<div class="er-winner-actions">' +
            '<button class="er-btn-secondary" id="er-home-btn">⬅️ رجوع لمنصة الألعاب</button>' +
            '<button class="er-btn-secondary" id="er-new-match-btn">🆕 بدء مباراة جديدة</button>' +
            '<button class="er-btn-secondary" id="er-replay-same-btn">🔄 إعادة المباراة بنفس اللاعبين</button>' +
            '</div></div>';

        document.getElementById('er-replay-same-btn').onclick = handleReplaySamePlayers;
        document.getElementById('er-new-match-btn').onclick = function () {
            AGP.gameManager.resetSession(); // emits game:reset — automatically calls onDestroy()
            window.location.reload();
        };
        // "Back to the games platform" — closes the game entirely, same
        // behavior as the persistent header's 🏠 button
        // (agp-game-shell.js: injectPersistentHeader -> agp-header-home-btn),
        // instead of duplicating the navigation logic (homeUrl) locally here.
        document.getElementById('er-home-btn').onclick = function () {
            var headerHomeBtn = document.getElementById('agp-header-home-btn');
            if (headerHomeBtn) headerHomeBtn.click();
        };

        overlay.style.display = 'flex';

        window.setTimeout(function () {
            if (winner) spawnConfetti(el('er-trophy-card-winner'), 28);
            if (mostElim) spawnConfetti(el('er-trophy-card-most'), 20);
        }, 120);
    }

    /**
     * "Replay with the same players" — skips the settings/lobby screens
     * entirely, goes straight back to the wheel screen with the same
     * roster (everyone from the previous match, alive or eliminated —
     * manually-removed players are excluded automatically since they were
     * actually removed from _alive/_eliminated at removal time). Treated
     * as a fully new match: every piece of state (eliminations/revivals/
     * counters) resets.
     */
    function handleReplaySamePlayers() {
        var roster = _alive.concat(_eliminated.map(function (e) { return e.player; }));
        if (!roster.length) return;

        var overlay = el('er-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        var selectOverlay = el('er-select-overlay');
        if (selectOverlay) selectOverlay.style.display = 'none';

        stopAutoPlay();
        resetMatchState();
        _alive = roster;
        _alive.forEach(function (p) { assignPlayerNumber(p); }); // a fully new match — new numbers in this list's order
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();

        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    /* ======================================================================
     *  13) Game registration + settings screen (agp-game-shell.js)
     * ==================================================================== */
    function giftLabelFor(value) {
        var match = COMMON_GIFTS.filter(function (g) { return g.value === value; })[0];
        if (!match) return value || 'اختر هدية';
        return match.label + ' · ' + giftCoinsText(match);
    }

    /**
     * Gift-picker window — a popup tab built entirely here (in response to
     * the 'modal-trigger' field type in agp-game-shell.js — the shared
     * file knows nothing about gifts themselves). Works even before the
     * match starts (opened from the initial settings screen), so it builds
     * its own elements (ensureScaffolding) instead of relying on renderStage.
     */
    function openGiftPickerModal(currentValue) {
        ensureScaffolding();
        var overlay = el('er-modal-overlay');
        var box = el('er-modal-box');
        if (!overlay || !box) return;

        // Each gift's icon is a real Twemoji image (MIT + CC-BY 4.0
        // license, not official TikTok assets) + the gift name + its real
        // coin value (per actual research — see the note above
        // COMMON_GIFTS).
        var itemsHtml = COMMON_GIFTS.map(function (g) {
            var active = g.value === currentValue ? 'agp-pill-active' : '';
            return '<button type="button" class="agp-pill-btn er-gift-btn ' + active + '" data-gift-value="' + escapeHtml(g.value) + '">' +
                '<img class="er-gift-icon" src="' + giftIconUrl(g) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
                '<span class="er-gift-name">' + escapeHtml(g.label) + '</span>' +
                '<span class="er-gift-coins">' + giftCoinsText(g) + '</span>' +
                '</button>';
        }).join('');

        // Only the winner screen removes this class; the gift picker keeps
        // its old solid look.
        overlay.classList.remove('er-winner-backdrop');

        box.className = '';
        box.style.textAlign = 'center';
        box.innerHTML =
            '<h2>🎁 اختر هدية الإنعاش</h2>' +
            '<div id="er-modal-sub">اضغط على الهدية المطلوبة — تُغلق النافذة تلقائياً بعد الاختيار</div>' +
            '<div style="display:flex;flex-wrap:wrap;justify-content:center;gap:4px;margin-top:14px;">' + itemsHtml + '</div>';

        box.querySelectorAll('[data-gift-value]').forEach(function (btn) {
            btn.onclick = function () {
                var value = btn.getAttribute('data-gift-value');
                AGP.gameShell.setSetting('giftRevivalGiftName', value);
                overlay.style.display = 'none';
                box.style.textAlign = '';
            };
        });

        overlay.style.display = 'flex';
    }

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
                // Rendered as pill-choice rather than toggle (two explicit
                // options instead of an on/off switch), but the underlying
                // value is still a plain Boolean (friendRevivalEnabled) —
                // no change to the game logic that reads it.
                key: 'friendRevivalEnabled', type: 'pill-choice', label: '🎗️ عند تكرار اسم لاعب لمرتين متتاليتين',
                options: [
                    { label: 'ينعش صديق مُقصى', value: true },
                    { label: 'لا شيء', value: false }
                ],
                default: false
            },
            {
                key: 'giftRevivalEnabled', type: 'toggle', label: '🎁 الإنعاش عن طريق الدعم',
                default: false
            },
            {
                key: 'giftRevivalGiftName', type: 'modal-trigger', label: 'اختار نوع الدعم',
                default: COMMON_GIFTS[0].value,
                formatValue: giftLabelFor,
                onOpen: openGiftPickerModal,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'giftRevivalMaxCount', type: 'counter', label: 'كم مرة مسموح له بالعودة',
                min: 1, default: 1,
                showWhen: { key: 'giftRevivalEnabled', equals: true }
            },
            {
                key: 'eliminationTimerSeconds', type: 'pill-group', label: '⏱️ موقّت الإقصاء',
                options: ELIMINATION_TIMER_OPTIONS, default: 30
            },
            {
                key: 'eliminationTimeoutBehavior', type: 'pill-choice', label: 'عند انتهاء الوقت',
                options: [
                    { label: 'يُقصى صاحب الدور', value: 'eliminate_chooser' },
                    { label: 'يتخطى دوره فقط', value: 'skip_turn' }
                ],
                default: 'eliminate_chooser'
            },
            {
                // A real settings field (shows on both the initial
                // settings screen and the mid-match drawer) instead of a
                // floating button. Applied immediately on the game screen
                // itself (doesn't wait for the next spin) via
                // enhanceWheelModeField/setWheelDisplayMode above, since
                // the shared file has no onChange hook for settings fields.
                key: 'wheelDisplayMode', type: 'pill-choice', label: '🎡 شكل عجلة الحظ',
                options: [
                    { label: '🎡 عجلة', value: 'wheel' },
                    { label: '📜 سكرول', value: 'reel' }
                ],
                default: 'wheel'
            },
            {
                // Only shown in the settings drawer reopened mid-match
                // (onlyMidMatch) — hidden entirely on the initial settings
                // screen before the match starts.
                key: 'soundVolume', type: 'slider', label: '🔊 مستوى الصوت',
                min: 0, max: 10, default: 7, onlyMidMatch: true
            }
        ];
    }

    function handleStartRound(settingsValues) {
        resetMatchState();
        _settings = settingsValues;
        _alive = AGP.gameManager.getPlayers().slice();
        _alive.forEach(function (p) { assignPlayerNumber(p); }); // fixed number in lobby join order
        _startedAt = Date.now();
        _matchActive = true;

        wireCommentListener();
        wireGiftListener();
        renderStage();
    }

    /* ======================================================================
     *  Enhancements for the shared settings/lobby screens
     *  (js/agp-game-shell.js) — specific to this game only, no edits to the
     *  shared file itself. Same technique already proven in Fruit
     *  Roulette (same platform, entirely different file): a
     *  MutationObserver watches #agp-shell-overlay (created once at
     *  init(), stays in the DOM the whole time) and reapplies these
     *  enhancements every time #agp-shell-box's content is fully rebuilt
     *  (every navigation between settings/connecting/lobby screens wipes
     *  the content). Every function here is idempotent (checks its
     *  element isn't already there before adding it) — zero edits to
     *  js/agp-game-shell.js, and zero effect on any other game sharing
     *  that file (this code exists only in this game's own file, and is
     *  never loaded except on this game's page).
     * ==================================================================== */
    function homeNavigate() {
        var homeBtn = el('agp-header-home-btn');
        if (homeBtn) { homeBtn.click(); }
        else { window.location.href = '../../index.html'; }
    }

    function makeBackToPlatformBtn() {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'er-back-to-platform-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', homeNavigate);
        return btn;
    }

    /**
     * Lays out the initial settings screen to match the new design handoff:
     * a single scrollable column (.er-settings-scroll, hidden scrollbar +
     * fade) holding the field rows, and a footer row (.er-settings-footer)
     * holding the connect button + back-to-platform link side by side.
     * Field elements are moved (not rebuilt) via appendChild, so existing
     * event listeners survive — no change to js/agp-game-shell.js, field
     * keys/defaults, or field order (buildSettingsFields()'s own order).
     * The gift-enabled toggle + its conditional fields, and the
     * friend-revival row, are each wrapped in a bordered ".er-settings-card"
     * to match the design's toggle-card sections.
     * Idempotent via the scroll wrapper's presence: the shared file rebuilds
     * every field element from scratch on each renderSettingsScreen() call
     * (e.g. any toggle click), so this runs again each time and re-groups
     * the fresh elements to match their current conditional visibility.
     */
    function layoutInitialSettingsFields(box) {
        var connectBtn = el('agp-connect-btn');
        if (!connectBtn) return;
        if (connectBtn.closest('.er-settings-footer')) return;

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
        var friendRevivalRow = rowFor('[data-key="friendRevivalEnabled"]');
        var giftEnabledRow = rowFor('[data-key="giftRevivalEnabled"]');
        var giftMaxCountRow = rowFor('[data-key="giftRevivalMaxCount"]');
        var giftNameTrigger = box.querySelector('[data-trigger-key="giftRevivalGiftName"]');
        var giftNameRow = giftNameTrigger ? giftNameTrigger.closest('.agp-shell-row') : null;
        var timerRow = rowFor('[data-key="eliminationTimerSeconds"]');
        var timeoutRow = rowFor('[data-key="eliminationTimeoutBehavior"]');
        var wheelModeRow = rowFor('[data-key="wheelDisplayMode"]');

        // Visual wrapper around the gift-picker trigger button itself — does
        // not touch the button or its click listener, just adds a parent.
        if (giftNameTrigger) {
            giftNameRow.classList.add('er-gift-name-row');
            var giftBoxWrap = document.createElement('div');
            giftBoxWrap.className = 'er-gift-box-wrap';
            giftNameTrigger.parentNode.insertBefore(giftBoxWrap, giftNameTrigger);
            giftBoxWrap.appendChild(giftNameTrigger);
        }

        var scroll = document.createElement('div');
        scroll.className = 'er-settings-scroll';
        var scrollInner = document.createElement('div');
        scrollInner.className = 'er-settings-scroll-inner';
        scroll.appendChild(scrollInner);

        [usernameField, keywordField, maxPlayersRow, followersRow]
            .filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        // "Card" section — friend-revival row alone.
        if (friendRevivalRow) {
            var friendCard = document.createElement('div');
            friendCard.className = 'er-settings-card';
            friendCard.appendChild(friendRevivalRow);
            scrollInner.appendChild(friendCard);
        }

        // "Card" section — gift-revival toggle + its conditional fields
        // (revive count, gift picker) together, matching the design.
        if (giftEnabledRow) {
            var giftCard = document.createElement('div');
            giftCard.className = 'er-settings-card';
            giftCard.appendChild(giftEnabledRow);
            if (giftMaxCountRow || giftNameRow) {
                var conditionalSection = document.createElement('div');
                conditionalSection.className = 'er-conditional-section';
                [giftMaxCountRow, giftNameRow].filter(Boolean).forEach(function (fieldEl) { conditionalSection.appendChild(fieldEl); });
                giftCard.appendChild(conditionalSection);
            }
            scrollInner.appendChild(giftCard);
        }

        [timerRow, timeoutRow, wheelModeRow].filter(Boolean).forEach(function (fieldEl) { scrollInner.appendChild(fieldEl); });

        var fade = document.createElement('div');
        fade.className = 'er-settings-fade';
        var glowline = document.createElement('div');
        glowline.className = 'er-settings-glowline';
        scroll.appendChild(fade);
        scroll.appendChild(glowline);
        box.appendChild(scroll);

        var footer = document.createElement('div');
        footer.className = 'er-settings-footer';
        footer.appendChild(connectBtn);
        box.appendChild(footer);
    }

    /**
     * The shared file's gift-picker trigger button (modal-trigger)
     * deliberately shows only escapeHtml-safe text (see renderField in
     * js/agp-game-shell.js) — no <img> can be injected via formatValue. To
     * show the gift's actual icon inside the button, this rebuilds the
     * button's content locally here after every render, using the current
     * real value (AGP.gameShell.getSettings()). Idempotent: checks the
     * displayed icon already matches the current value before rewriting,
     * to avoid unnecessary flicker on every mutation.
     */
    function enhanceGiftNameBox(box) {
        var btn = box.querySelector('.er-gift-name-row .agp-modal-trigger-btn');
        if (!btn || !AGP.gameShell || typeof AGP.gameShell.getSettings !== 'function') return;
        var currentValue = AGP.gameShell.getSettings().giftRevivalGiftName;
        var match = COMMON_GIFTS.filter(function (g) { return g.value === currentValue; })[0];
        if (!match) return;
        var existingIcon = btn.querySelector('.er-gift-name-icon');
        if (existingIcon && existingIcon.getAttribute('data-gift-value') === match.value) return;
        btn.innerHTML =
            '<img class="er-gift-name-icon" data-gift-value="' + escapeHtml(match.value) + '" ' +
            'src="' + giftIconUrl(match) + '" alt="" loading="lazy" onerror="this.style.display=\'none\';">' +
            '<span class="er-gift-name-text">' + escapeHtml(giftLabelFor(match.value)) + '</span>';
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
        box.classList.toggle('er-settings-initial-box', isInitial);
        if (isInitial) {
            layoutInitialSettingsFields(box);
            enhanceGiftNameBox(box);
        }
        if (box.querySelector('.er-back-to-platform-btn')) return;
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

    // The local enhanceLobbyList()/applyLobbyNameMarquee()/
    // normalizeFramedCardWidths() helpers that used to live here were
    // removed entirely — the shared js/agp-game-shell.js and
    // js/agp-player-card.js now provide the same three features natively
    // (removable player-list buttons, automatic name marquee, and
    // mathematically-computed framed-card widths), so a local duplicate
    // would only visually conflict with them.

    // Lobby heading — replaces the shared file's default h2 text with the
    // new design's title (animated purple/gold gradient "لوبي الدخول" +
    // gray game name), plus a subtitle line and a live player-count badge
    // that the shared file doesn't render at all. DOM-only change (h2
    // innerHTML + two new sibling elements) — no touch to
    // js/agp-game-shell.js. The heading/subtitle are built once (guarded by
    // data-er-heading); the live badge's count is refreshed on every call
    // since applyShellEnhancements() re-runs on every player join/leave.
    function enhanceLobbyHeading() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2) return;

        if (h2.getAttribute('data-er-heading') !== '1') {
            h2.innerHTML = '<span class="er-lobby-title-wave">لوبي الدخول</span>' +
                '<span class="er-lobby-title-game">— ' + escapeHtml(GAME_NAME) + '</span>';
            h2.setAttribute('data-er-heading', '1');

            var subtitle = document.createElement('p');
            subtitle.className = 'er-lobby-subtitle';
            subtitle.textContent = 'اكتب كلمة الدخول في التعليقات وتنضم على طول';
            h2.insertAdjacentElement('afterend', subtitle);

            var liveBadge = document.createElement('div');
            liveBadge.className = 'er-lobby-live-badge';
            liveBadge.innerHTML = '<span class="er-lobby-live-dot"></span><span id="er-lobby-live-count-text"></span>';
            subtitle.insertAdjacentElement('afterend', liveBadge);
        }

        var countText = el('er-lobby-live-count-text');
        if (countText) {
            countText.textContent = AGP.gameManager.getPlayers().length + ' لاعب في اللوبي';
        }
    }

    // Transparent "Ayman Games" logo watermark in the middle of the lobby
    // box, plus the bottom action row: "back to match settings" (reloads
    // the page after user confirmation — cancels the current stream
    // connection and returns to the initial screen, since there's no
    // clean public way to reopen the full connecting screen from outside
    // the shared file), the original start button (same element and
    // onclick defined in the shared file, just new text/color), and "back
    // to the Ayman Games platform" underneath.
    function enhanceLobbyWatermarkAndActions() {
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;

        if (!box.querySelector('#er-lobby-watermark')) {
            var img = document.createElement('img');
            img.id = 'er-lobby-watermark';
            img.src = '../../logo.png';
            img.alt = '';
            box.insertBefore(img, box.firstChild);
        }

        var startBtn = el('agp-start-round-btn');
        if (!startBtn) return;

        if (startBtn.textContent.indexOf('اغلاق اللوبي') === -1) {
            startBtn.textContent = '🔒 اغلاق اللوبي وبدء المباراة';
        }

        var row = box.querySelector('.er-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'er-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);

            var backSettingsBtn = document.createElement('button');
            backSettingsBtn.type = 'button';
            backSettingsBtn.className = 'er-lobby-back-settings-btn';
            backSettingsBtn.textContent = '⚙️ العودة لاعدادات المباراة';
            backSettingsBtn.addEventListener('click', function () {
                if (window.confirm('بيرجّعك لشاشة إعدادات المباراة الأولى، ويلغي الاتصال الحالي بالبث ' +
                    'ويقفل اللوبي — بيحتاج اتصال جديد بعدها. تكمل؟')) {
                    window.location.reload();
                }
            });

            row.appendChild(backSettingsBtn);
            row.appendChild(startBtn); // moves the original element (same onclick) into the new row
        }

        // "Back to platform" joins the same row (three buttons in one row,
        // uniform W360xH48) instead of a separate element below it.
        if (!row.querySelector('.er-back-to-platform-btn')) {
            row.appendChild(makeBackToPlatformBtn());
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
    var _erDrawerTab = 'settings';
    var _erPlayersTabFilter = 'all';

    function enhanceReopenedDrawer() {
        var box = el('agp-shell-box');
        if (!box || !document.getElementById('agp-settings-player-list')) return;
        box.classList.remove('er-mini-lobby-active');
        box.classList.add('er-inmatch-drawer');
        box.classList.toggle('er-tab-players', _erDrawerTab === 'players');

        if (box.firstElementChild && box.firstElementChild.classList.contains('er-drawer-header')) {
            box.querySelectorAll('.er-drawer-tabs button').forEach(function (b) {
                b.classList.toggle('er-tab-active', b.getAttribute('data-tab') === _erDrawerTab);
            });
            if (_erDrawerTab === 'players') renderReopenedPlayersTab();
            return;
        }

        var originalChildren = Array.prototype.slice.call(box.children);
        var closeBtn = document.getElementById('agp-settings-close-btn');
        var h2 = originalChildren.filter(function (n) { return n.tagName === 'H2'; })[0];
        var fieldNodes = originalChildren.filter(function (n) { return n !== closeBtn && n !== h2; });
        box.innerHTML = '';

        var header = document.createElement('div');
        header.className = 'er-drawer-header';
        if (h2) header.appendChild(h2);
        if (closeBtn) header.appendChild(closeBtn);
        box.appendChild(header);

        var tabs = document.createElement('div');
        tabs.className = 'er-drawer-tabs';
        tabs.innerHTML =
            '<button type="button" data-tab="settings">⚙️ الإعدادات</button>' +
            '<button type="button" data-tab="players">👥 اللاعبون</button>';
        tabs.querySelectorAll('button').forEach(function (btn) {
            btn.classList.toggle('er-tab-active', btn.getAttribute('data-tab') === _erDrawerTab);
            btn.onclick = function () {
                _erDrawerTab = btn.getAttribute('data-tab');
                box.classList.toggle('er-tab-players', _erDrawerTab === 'players');
                tabs.querySelectorAll('button').forEach(function (b) { b.classList.toggle('er-tab-active', b === btn); });
                if (_erDrawerTab === 'players') renderReopenedPlayersTab();
            };
        });
        box.appendChild(tabs);

        // ---- Scrollable body: every settings field + the full
        // player-management field (its internal list hidden via CSS, the
        // "add new lobby" button stays visible in its original spot, renamed). ----
        var bodyWrap = document.createElement('div');
        bodyWrap.className = 'er-drawer-body';
        fieldNodes.forEach(function (n) { bodyWrap.appendChild(n); });
        var reopenBtn = bodyWrap.querySelector('#agp-reopen-registration-btn');
        if (reopenBtn) reopenBtn.textContent = '➕ فتح دخول لاعبين جدد';
        box.appendChild(bodyWrap);

        var playersTab = document.createElement('div');
        playersTab.className = 'er-drawer-players-tab';
        playersTab.id = 'er-players-tab';
        playersTab.innerHTML =
            '<input type="text" id="er-players-tab-search" placeholder="🔍 دوّر على لاعب...">' +
            '<div id="er-players-tab-filter">' +
            '<button type="button" data-filter="all">الكل</button>' +
            '<button type="button" data-filter="live">🟢 نشطون</button>' +
            '<button type="button" data-filter="out">🔴 مقصون</button>' +
            '</div>' +
            '<div id="er-players-tab-list"></div>';
        playersTab.querySelector('#er-players-tab-search').oninput = function () { renderReopenedPlayersTab(); };
        playersTab.querySelectorAll('#er-players-tab-filter button').forEach(function (b) {
            b.classList.toggle('er-filter-active', b.getAttribute('data-filter') === _erPlayersTabFilter);
            b.onclick = function () { _erPlayersTabFilter = b.getAttribute('data-filter'); renderReopenedPlayersTab(); };
        });
        box.appendChild(playersTab);

        if (_erDrawerTab === 'players') renderReopenedPlayersTab();
    }

    /**
     * Same layout as Tribe Roulette — merges _alive and _eliminated into
     * one list (everyone who took part in the match), name search filter +
     * status filter, Arabic alphabetical sort. Active row = red × button
     * (manuallyEliminatePlayer), eliminated row = green ↩ button (manuallyRevivePlayer).
     */
    function renderReopenedPlayersTab() {
        var listEl = el('er-players-tab-list');
        if (!listEl) return;

        var query = ((el('er-players-tab-search') || {}).value || '').trim().toLowerCase();
        var rows = _alive.map(function (p) { return { player: p, status: 'live' }; })
            .concat(_eliminated.map(function (e) { return { player: e.player, status: 'out' }; }));

        if (_erPlayersTabFilter !== 'all') {
            rows = rows.filter(function (r) { return r.status === _erPlayersTabFilter; });
        }
        if (query) {
            rows = rows.filter(function (r) { return playerLabel(r.player).toLowerCase().indexOf(query) !== -1; });
        }
        rows.sort(function (a, b) { return playerLabel(a.player).localeCompare(playerLabel(b.player), 'ar'); });

        var filterWrap = el('er-players-tab-filter');
        if (filterWrap) {
            filterWrap.querySelectorAll('button').forEach(function (b) {
                b.classList.toggle('er-filter-active', b.getAttribute('data-filter') === _erPlayersTabFilter);
            });
        }

        if (!rows.length) {
            listEl.innerHTML = '<div style="text-align:center;color:#6b6280;font-size:0.78em;padding:20px 0;">ولا لاعب مطابق</div>';
            return;
        }

        listEl.innerHTML = rows.map(function (r) {
            var isLive = r.status === 'live';
            var actionHtml = isLive
                ? '<button type="button" class="er-prow-action er-action-eliminate" data-id="' + escapeHtml(r.player.id) + '" title="إقصاء يدوي">✕</button>'
                : '<button type="button" class="er-prow-action er-action-revive" data-id="' + escapeHtml(r.player.id) + '" title="إرجاع يدوي">↩</button>';
            return '<div class="er-prow' + (isLive ? '' : ' er-prow-out') + '">' +
                '<span class="er-prow-avatar">' + ringAvatarHtml(r.player) + '</span>' +
                '<span class="er-prow-name">' + escapeHtml(playerLabel(r.player)) + '</span>' +
                '<span class="er-prow-status ' + (isLive ? 'er-status-live' : 'er-status-out') + '">' + (isLive ? 'نشط' : 'مقصى') + '</span>' +
                actionHtml +
                '</div>';
        }).join('');

        listEl.querySelectorAll('.er-action-eliminate').forEach(function (btn) {
            btn.onclick = function () { manuallyEliminatePlayer(btn.getAttribute('data-id')); };
        });
        listEl.querySelectorAll('.er-action-revive').forEach(function (btn) {
            btn.onclick = function () { manuallyRevivePlayer(btn.getAttribute('data-id')); };
        });
    }

    /**
     * A quiet manual elimination from the settings panel — unlike
     * eliminatePlayer(), no announcement tab or celebratory sound; just
     * moves the player from _alive to _eliminated + updates the
     * wheel/reel + a simple log line.
     */
    function manuallyEliminatePlayer(playerId) {
        var idx = _alive.findIndex(function (p) { return p.id === playerId; });
        if (idx === -1) return;
        var player = _alive[idx];
        _alive.splice(idx, 1);
        _eliminated.push({ player: player });

        realignWheelAfterRosterChange();
        logEvent('eliminate', '🗑️ ' + playerLabel(player) + ' تم إقصاؤه يدوياً من لوحة الإعدادات');
        renderReopenedPlayersTab();

        // Fixed bug: unlike handlePlayerRemoved (the permanent delete
        // button), this path used to leave an open turn window
        // untouched — manually eliminating the turn holder or one of
        // their candidates here while their window was open left their
        // card showing as if still alive (clicking it or typing their
        // number in chat silently did nothing since eliminatePlayer later
        // rejected them), and they could still be counted as an eliminator
        // in the stats despite already being eliminated. Same handling as
        // handlePlayerRemoved.
        if (_pendingTurn && _pendingTurn.chooser && _pendingTurn.chooser.id === playerId) {
            closeTurnModal();
        } else if (_pendingTurn) {
            _pendingTurn.candidates = _pendingTurn.candidates.filter(function (p) { return p.id !== playerId; });
            if (!_pendingTurn.candidates.length) closeTurnModal();
            else renderTurnModal();
        }

        if (_matchActive && _alive.length <= 1) {
            endMatch(_alive[0] || null);
        }
    }

    /**
     * An immediate manual revival from the settings panel — no
     * _friendRevivedIds check (unlike the automatic "friend revival"
     * mechanic on the wheel/reel), no "player returned" splash — a quiet
     * administrative action.
     */
    function manuallyRevivePlayer(playerId) {
        var idx = _eliminated.findIndex(function (e) { return e.player.id === playerId; });
        if (idx === -1) return;
        var entry = _eliminated[idx];
        _eliminated.splice(idx, 1);
        _alive.push(entry.player);

        realignWheelAfterRosterChange();
        logEvent('gift', '↩️ ' + playerLabel(entry.player) + ' تم إرجاعه يدوياً من لوحة الإعدادات');
        renderReopenedPlayersTab();
    }

    // "Add new lobby" window — a centered 700x800 window, 70% transparency
    // (same layout as Russian Roulette's rr-mini-lobby-active), single-color
    // border, 3-column grid of tightly-packed 45px cards. The ✕ close
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
        box.classList.remove('er-inmatch-drawer', 'er-tab-players');
        box.classList.add('er-mini-lobby-active');

        var doneBtn = document.getElementById('agp-mini-lobby-done-btn');
        if (doneBtn && doneBtn.textContent.indexOf('حفظ') === -1) {
            doneBtn.textContent = '💾 حفظ وإكمال المباراة';
        }
        if (!box.querySelector('.er-mini-lobby-close-btn')) {
            var closeBtn = document.createElement('button');
            closeBtn.type = 'button';
            closeBtn.className = 'er-mini-lobby-close-btn';
            closeBtn.textContent = '✕';
            closeBtn.onclick = closeMiniLobbyToSettings;
            box.insertBefore(closeBtn, box.firstChild);
        }
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceReopenedDrawer();
        enhanceMiniLobby();
        enhanceWheelModeField();
        // No manual handling needed for the lobby list anymore — the
        // shared file (renderLobbyPlayerList) builds the delete button,
        // marquee, and card sizes natively itself.
        enhanceLobbyHeading();
        enhanceLobbyWatermarkAndActions();
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
    var _erConnLayer = null;
    var _erConnKeywordBackup = '';
    var _erConnKeywordPending = false;
    var _erConnErrorShown = false;
    var _erConnErrorTimer = null;

    function ensureConnLayer() {
        if (_erConnLayer) return _erConnLayer;
        var layer = document.createElement('div');
        layer.id = 'er-conn-layer';
        layer.innerHTML =
            '<div class="er-conn-backdrop"></div>' +
            '<div class="er-conn-modal">' +
                '<div class="er-conn-icon"></div>' +
                '<h3 class="er-conn-title"></h3>' +
                '<p class="er-conn-sub"></p>' +
            '</div>';
        document.body.appendChild(layer);
        _erConnLayer = layer;
        return layer;
    }

    function showConnLayer(isError, title, sub) {
        var layer = ensureConnLayer();
        var modal = layer.querySelector('.er-conn-modal');
        var icon = layer.querySelector('.er-conn-icon');
        modal.classList.toggle('er-conn-err', isError);
        icon.className = 'er-conn-icon ' + (isError ? 'er-conn-err-icon' : 'er-conn-spinner');
        icon.textContent = isError ? '✕' : '';
        layer.querySelector('.er-conn-title').textContent = title;
        layer.querySelector('.er-conn-sub').textContent = sub || '';
        layer.classList.add('show');
    }

    function hideConnLayer() {
        if (_erConnLayer) _erConnLayer.classList.remove('show');
    }

    // Captured only at the moment of the click (before the shared file
    // wipes the box's content) — a non-interactive visual copy
    // (pointer-events:none via CSS) shown blurred behind our layer,
    // without touching the real elements (the shared file reads the
    // username/keyword from the original elements right after us, unaffected).
    document.addEventListener('click', function (e) {
        if (!e.target || e.target.id !== 'agp-connect-btn') return;
        var box = el('agp-shell-box');
        if (!box || !box.classList.contains('er-settings-initial-box')) return;
        var kInput = el('agp-keyword');
        _erConnKeywordBackup = kInput ? kInput.value : '';
        var ghost = box.cloneNode(true);
        // A distinct id (not a duplicate of the real box's, which would
        // confuse getElementById callers) that still matches this game's
        // [id^="agp-shell-box"] design-scoping selectors, so the cloned
        // snapshot keeps its styling instead of rendering as bare
        // unstyled HTML around the connecting spinner.
        ghost.id = 'agp-shell-box-ghost';
        var layer = ensureConnLayer();
        var backdrop = layer.querySelector('.er-conn-backdrop');
        backdrop.innerHTML = '';
        backdrop.appendChild(ghost);
        _erConnErrorShown = false;
        showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
    }, true);

    // Called from applyShellEnhancements() (watched via the existing
    // MutationObserver on any #agp-shell-box content change) — syncs our
    // layer's state with the actual current connection state.
    function syncConnLayer() {
        var box = el('agp-shell-box');
        if (!box) return;

        if (box.classList.contains('agp-conn-error')) {
            if (!_erConnErrorShown) {
                _erConnErrorShown = true;
                var subEl = box.querySelector('.agp-shell-status');
                showConnLayer(true, 'تعذّر الاتصال', subEl ? subEl.textContent : 'تحقّق من اليوزرنيم وحاول مرة أخرى.');
                clearTimeout(_erConnErrorTimer);
                _erConnErrorTimer = setTimeout(function () {
                    hideConnLayer();
                    if (AGP.gameShell && typeof AGP.gameShell.setSetting === 'function') {
                        var s = AGP.gameShell.getSettings();
                        var firstKey = Object.keys(s)[0];
                        if (firstKey !== undefined) AGP.gameShell.setSetting(firstKey, s[firstKey]);
                    }
                    _erConnKeywordPending = true;
                }, 2400);
            }
            return;
        }

        if (box.classList.contains('agp-connecting-box')) {
            // Fixed bug: if a new "connecting" state arrived (an automatic
            // reconnect) while the settings-recovery timer from a previous
            // error state (_erConnErrorTimer) was still pending, it stayed
            // scheduled and later fired renderSettingsScreen() on top of an
            // already-in-progress new connection attempt — canceled here immediately.
            clearTimeout(_erConnErrorTimer);
            _erConnErrorShown = false;
            // A connection is in progress (either the first click, or an
            // automatic reconnect with no new click) — the layer is
            // already showing if this came from the button click; if it
            // came from an external event (no new ghost), show it with
            // whatever's currently available.
            if (!_erConnLayer || !_erConnLayer.classList.contains('show')) {
                showConnLayer(false, 'جاري الاتصال بالبث', 'انتظر قليلاً...');
            }
            return;
        }

        // Fully out of the connecting/error states.
        clearTimeout(_erConnErrorTimer);
        _erConnErrorShown = false;
        if (box.classList.contains('agp-lobby-box')) {
            hideConnLayer();
        }
        if (_erConnKeywordPending && box.classList.contains('er-settings-initial-box')) {
            var kInput = el('agp-keyword');
            if (kInput) kInput.value = _erConnKeywordBackup;
            _erConnKeywordPending = false;
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

    function registerGame() {
        // Fixed bug: this used to be called for the first time only when
        // the first match started (renderStage -> ensureScaffolding), so
        // the "friend revival"/"gift revival" toggle styling (CSS in the
        // same injected stylesheet) never showed on the initial settings
        // screen (before any match starts) — now also called here
        // (idempotent, already guards against duplicates) so the styles
        // are ready from the very first page load.
        injectStageStyles();
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'elimination-games',

            onLoad: function () {
                AGP.log('Elimination Roulette: onLoad.');
            },
            onPlayerJoin: function () {
                enforceMaxPlayers();
            },
            onRoundEnd: function () {
                AGP.log('Elimination Roulette: onRoundEnd.');
            },
            onDestroy: function () {
                resetMatchState();
                AGP.log('Elimination Roulette: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Elimination Roulette: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        // Listened to permanently, once (not scoped to an active match),
        // since the delete button on the settings screen is technically
        // available even before the round starts.
        AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });

        // Logs every player join to the match event banner. A general
        // "any gift arrives in chat" listener was removed from here — it
        // logged every real gift regardless of relevance to the match
        // (unrelated spam), since the banner should only show "match
        // events". Only a gift that actually triggers a revival for a
        // still-eliminated player (see revivePlayerByEntry below) is
        // logged — that's a real match event, unlike a random gift in chat.
        //
        // Fixed bug: this listener used to only log to the banner, with no
        // actual link connecting the new player to the internal alive
        // array — a player joining via "add new lobby" during an active
        // match would show up only in the settings mini-lobby list and
        // never enter the wheel. Fix: handlePlayerJoinedMidMatch below —
        // checks a match is actually active and the player isn't a
        // duplicate (neither alive nor eliminated), then adds them to
        // _alive and realigns the wheel (the same
        // realignWheelAfterRosterChange used by every other roster change,
        // to keep the wheel visually consistent).
        AGP.events.on('player:joined', function (payload) {
            var p = payload && payload.player;
            if (!p) return;
            logEvent('join', '➕ ' + playerLabel(p) + ' انضم للعبة');
            handlePlayerJoinedMidMatch(p);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات لعبة روليت الإقصاء',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين، فيختار رقم لاعب آخر ليقصيه من الشات. ' +
                'لو وقفت العجلة على نفس الشخص مرتين متتاليتين (ولو مفعّلة ميزة انعاش صديق)، يقدر يرجّع مُقصى بدل الإقصاء ' +
                '(كل مُقصى يترجّع بهذي الطريقة مرة واحدة فقط طول المباراة). ' +
                'المُقصى يقدر يرجع بإرسال هدية معيّنة لو مفعّلة ميزة الإنعاش بالدعم. تستمر المباراة حتى يبقى لاعب واحد.',
            connectButtonLabel: 'الاتصال بالبث والانتقال للوبي',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
            // midMatchToggleButton (the "auto-play" button inside the
            // settings drawer) was removed from here — the button is now
            // its own standalone element directly under the wheel on the
            // game screen (see renderStage/updateAutoPlayBtnLabel above),
            // entirely outside the settings drawer. handleAutoPlayToggle
            // itself is unchanged — only where it's called from changed.
        });

        // Wires the settings/lobby screen enhancements ("back to
        // platform" link, manual-elimination ✕, transparent watermark) —
        // see the detailed comments above each function's definition.
        wireSharedShellEnhancements();
    }

    AGP.events.on('platform:ready', function () {
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager && !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        registerGame();
    }

}(window.AymanGamesPlatform));
