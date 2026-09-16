/**
 * AGP ENTRANCE — "entrance" intro animation for players with one active
 * (backend/collectibles: user_entrances). Player joins with
 * player.entrance set -> large intro banner for a few seconds (PLAY_MS)
 * -> fades and settles into a small permanent glowing badge for as long
 * as they stay, removed automatically when they leave.
 *
 * The 4 visual templates (gold/neon/fire/ice) match
 * entrance-animations-preview.html exactly (colors/timing/sequence),
 * already reviewed and approved separately — not reinvented here.
 *
 * Scoped deliberately: only runs if #agp-entrance-stage and
 * #agp-entrance-settled-list exist on the page (currently only the main
 * lobby screen, js/agp-game-shell.js: renderLobbyScreen). Silently no-ops
 * elsewhere — no manual wiring needed per page.
 *
 * Requires js/agp-core.js and js/agp-player-manager.js (player:joined/
 * removed/listReset events) only.
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var STYLE_ID = 'agp-entrance-styles';
    var STAGE_ID = 'agp-entrance-stage';
    var LIST_ID = 'agp-entrance-settled-list';

    var VALID_TEMPLATES = { gold: true, neon: true, fire: true, ice: true };

    // Matches entrance-animations-preview.html's playMs per template exactly
    var PLAY_MS = { gold: 4300, neon: 3800, fire: 3900, ice: 4300 };

    function el(id) { return document.getElementById(id); }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function injectStyles() {
        if (el(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '#' + STAGE_ID + '{position:absolute;top:14px;left:16px;right:16px;z-index:5;',
            'display:flex;flex-direction:column;align-items:center;gap:8px;pointer-events:none;}',

            '.agp-entrance-box{display:flex;align-items:center;gap:12px;padding:10px 20px;',
            'border-radius:999px;opacity:0;max-width:90%;position:relative;font-family:Cairo,sans-serif;direction:rtl;}',
            '.agp-entrance-avatar{width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0;',
            'border:2px solid rgba(255,255,255,.5);background:#5a2585;}',
            '.agp-entrance-text{text-align:right;display:flex;flex-direction:column;}',
            '.agp-entrance-name{font-weight:800;font-size:15px;}',
            '.agp-entrance-msg{font-size:12px;opacity:.9;margin-top:2px;}',

            /* ---- المستقرة (بطاقات صغيرة دائمة، أسفل البانر) ---- */
            '#' + LIST_ID + '{display:flex;flex-wrap:wrap;gap:8px;position:relative;z-index:4;',
            'margin-top:2px;pointer-events:none;}',
            '.agp-entrance-settled{display:inline-flex;align-items:center;border-radius:999px;',
            'padding:5px 14px;font-size:11px;font-weight:800;font-family:Cairo,sans-serif;',
            'animation:agpEntranceSettleIn .5s ease-out;}',
            '@keyframes agpEntranceSettleIn{0%{opacity:0;transform:scale(.6);}100%{opacity:1;transform:scale(1);}}',

            /* ================= الذهبي الفخم (المؤسس) ================= */
            '.agp-entrance-tpl-gold{background:linear-gradient(90deg,rgba(45,32,8,.97),rgba(80,58,10,.97));border:1.5px solid #ffd97a;}',
            '.agp-entrance-tpl-gold .agp-entrance-name,.agp-entrance-tpl-gold .agp-entrance-msg{color:#ffe9b0;}',
            '.agp-entrance-tpl-gold .agp-entrance-avatar{border-color:#ffd97a;width:44px;height:44px;}',
            '.agp-entrance-tpl-gold.play{animation:agpGoldIn 1.1s cubic-bezier(.2,1.4,.4,1) forwards,',
            'agpGoldGlow 1.4s ease-in-out .9s 2,agpGoldOut .7s ease-in forwards 3.6s;}',
            '@keyframes agpGoldIn{0%{opacity:0;transform:translateY(-30px) scale(.7);}',
            '60%{opacity:1;transform:translateY(4px) scale(1.06);}100%{opacity:1;transform:translateY(0) scale(1);}}',
            '@keyframes agpGoldGlow{0%,100%{box-shadow:0 0 16px 3px rgba(255,217,122,.4),0 0 40px 10px rgba(255,180,50,.15);}',
            '50%{box-shadow:0 0 34px 10px rgba(255,217,122,.85),0 0 70px 24px rgba(255,180,50,.35);}}',
            '@keyframes agpGoldOut{0%{opacity:1;transform:translateY(0);}100%{opacity:0;transform:translateY(-14px);}}',
            '.agp-entrance-sparkle{position:absolute;width:4px;height:4px;background:#fff6d8;border-radius:50%;',
            'opacity:0;box-shadow:0 0 6px 2px #ffe9b0;}',
            '.agp-entrance-tpl-gold.play .agp-entrance-sparkle{animation:agpSparkle 1.6s ease-in-out infinite;}',
            '.agp-entrance-sparkle.s1{top:6px;left:20%;animation-delay:.2s !important;}',
            '.agp-entrance-sparkle.s2{top:70%;left:70%;animation-delay:.6s !important;}',
            '.agp-entrance-sparkle.s3{top:20%;left:85%;animation-delay:1s !important;}',
            '@keyframes agpSparkle{0%,100%{opacity:0;transform:scale(.5);}50%{opacity:1;transform:scale(1.3);}}',
            '.agp-entrance-settled-gold{background:linear-gradient(90deg,#2d2008,#4a3308);border:1.5px solid #ffd97a;',
            'color:#ffe9b0;animation:agpEntranceSettleIn .5s ease-out,agpGoldGlow 2.2s ease-in-out infinite .5s;}',

            /* ================= النيون المستقبلي ================= */
            '.agp-entrance-tpl-neon{background:rgba(10,14,26,.95);border:1px solid #35e0ff;}',
            '.agp-entrance-tpl-neon .agp-entrance-name{color:#35e0ff;text-shadow:0 0 8px #35e0ff;}',
            '.agp-entrance-tpl-neon .agp-entrance-msg{color:#c98bff;text-shadow:0 0 6px #c98bff;}',
            '.agp-entrance-tpl-neon .agp-entrance-avatar{border-color:#35e0ff;}',
            '.agp-entrance-tpl-neon.play{animation:agpNeonIn .35s steps(3) forwards,',
            'agpNeonFlicker 1.8s linear .35s 1,agpNeonOut .5s ease-in forwards 3.3s;}',
            '@keyframes agpNeonIn{0%{opacity:0;transform:translateX(-40px) skewX(6deg);}',
            '60%{opacity:1;transform:translateX(6px) skewX(-2deg);}100%{opacity:1;transform:translateX(0) skewX(0);}}',
            '@keyframes agpNeonFlicker{0%,100%{filter:brightness(1);}5%{filter:brightness(1.6);}',
            '8%{filter:brightness(.6);}12%{filter:brightness(1.3);}50%{filter:brightness(1);}}',
            '@keyframes agpNeonOut{0%{opacity:1;}100%{opacity:0;transform:translateX(30px);}}',
            '.agp-entrance-settled-neon{background:#0e1220;border:1px solid #35e0ff;color:#35e0ff;',
            'animation:agpEntranceSettleIn .5s ease-out,agpNeonPulse 2s ease-in-out infinite .5s;}',
            '@keyframes agpNeonPulse{0%,100%{box-shadow:0 0 6px 1px rgba(53,224,255,.4);}',
            '50%{box-shadow:0 0 14px 4px rgba(53,224,255,.8);}}',

            /* ================= الناري القوي ================= */
            '.agp-entrance-tpl-fire{background:linear-gradient(90deg,rgba(50,10,0,.95),rgba(90,25,0,.95));border:1px solid #ff7a1a;}',
            '.agp-entrance-tpl-fire .agp-entrance-name{color:#ffb347;}',
            '.agp-entrance-tpl-fire .agp-entrance-msg{color:#ff9a5a;}',
            '.agp-entrance-tpl-fire .agp-entrance-avatar{border-color:#ff7a1a;}',
            '.agp-entrance-tpl-fire.play{animation:agpFireShake .5s ease-in-out forwards,',
            'agpFireBurn 1.8s ease-in-out .5s 2,agpFireOut .5s ease-in forwards 3.4s;}',
            '@keyframes agpFireShake{0%{opacity:0;transform:scale(.7) rotate(-3deg);}',
            '40%{opacity:1;transform:scale(1.08) rotate(2deg);}60%{transform:scale(.98) rotate(-1deg);}',
            '100%{transform:scale(1) rotate(0);}}',
            '@keyframes agpFireBurn{0%,100%{box-shadow:0 0 14px 2px rgba(255,122,26,.4);}',
            '50%{box-shadow:0 0 30px 10px rgba(255,90,0,.8);}}',
            '@keyframes agpFireOut{0%{opacity:1;transform:scale(1);}100%{opacity:0;transform:scale(.85);}}',
            '.agp-entrance-settled-fire{background:#2a0e00;border:1px solid #ff7a1a;color:#ffb347;',
            'animation:agpEntranceSettleIn .5s ease-out,agpFirePulse 1.8s ease-in-out infinite .5s;}',
            '@keyframes agpFirePulse{0%,100%{box-shadow:0 0 6px 1px rgba(255,122,26,.4);}',
            '50%{box-shadow:0 0 16px 5px rgba(255,90,0,.75);}}',

            /* ================= الجليدي الملكي ================= */
            '.agp-entrance-tpl-ice{background:linear-gradient(90deg,rgba(10,25,45,.95),rgba(20,45,70,.95));border:1px solid #8fd9ff;}',
            '.agp-entrance-tpl-ice .agp-entrance-name{color:#c9f2ff;}',
            '.agp-entrance-tpl-ice .agp-entrance-msg{color:#8fd9ff;}',
            '.agp-entrance-tpl-ice .agp-entrance-avatar{border-color:#8fd9ff;}',
            '.agp-entrance-tpl-ice.play{animation:agpIceIn 1s cubic-bezier(.2,.8,.2,1) forwards,',
            'agpIceShimmer 1.6s ease-in-out .8s 2,agpIceOut .8s ease-in forwards 3.5s;}',
            '@keyframes agpIceIn{0%{opacity:0;transform:translateY(-30px) scale(.9);filter:blur(6px);}',
            '100%{opacity:1;transform:translateY(0) scale(1);filter:blur(0);}}',
            '@keyframes agpIceShimmer{0%,100%{box-shadow:0 0 10px 2px rgba(143,217,255,.35);}',
            '50%{box-shadow:0 0 24px 6px rgba(143,217,255,.7);}}',
            '@keyframes agpIceOut{0%{opacity:1;}100%{opacity:0;transform:translateY(-12px);filter:blur(4px);}}',
            '.agp-entrance-settled-ice{background:#0c1e30;border:1px solid #8fd9ff;color:#c9f2ff;',
            'animation:agpEntranceSettleIn .5s ease-out,agpIcePulse 2.4s ease-in-out infinite .5s;}',
            '@keyframes agpIcePulse{0%,100%{box-shadow:0 0 6px 1px rgba(143,217,255,.35);}',
            '50%{box-shadow:0 0 14px 4px rgba(143,217,255,.7);}}'
        ].join('');
        document.head.appendChild(style);
    }

    var _settledByPlayerId = {}; // playerId -> badge element

    function settleBadge(player, templateKey) {
        var list = el(LIST_ID);
        if (!list) return; // left the lobby screen while the banner was playing
        var badge = document.createElement('span');
        badge.className = 'agp-entrance-settled agp-entrance-settled-' + templateKey;
        badge.setAttribute('data-agp-entrance-player-id', escapeHtml(String(player.id)));
        badge.textContent = player.name || player.id;
        list.appendChild(badge);
        _settledByPlayerId[player.id] = badge;
    }

    function removeSettledBadge(playerId) {
        var badge = _settledByPlayerId[playerId];
        if (badge && badge.parentNode) badge.parentNode.removeChild(badge);
        delete _settledByPlayerId[playerId];
    }

    function clearAllSettledBadges() {
        Object.keys(_settledByPlayerId).forEach(removeSettledBadge);
    }

    function playEntrance(player) {
        var stage = el(STAGE_ID);
        if (!stage) return; // not on the main lobby screen right now

        var entrance = player && player.entrance;
        var templateKey = entrance && entrance.templateKey;
        if (!VALID_TEMPLATES[templateKey]) return; // no active entrance, or unknown value

        injectStyles();

        var avatarHtml = player.avatarUrl
            ? '<img class="agp-entrance-avatar" src="' + escapeHtml(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer" onerror="this.style.visibility=\'hidden\';">'
            : '';
        var msg = (entrance.entranceText || '').trim();

        var box = document.createElement('div');
        box.className = 'agp-entrance-box agp-entrance-tpl-' + templateKey;
        box.innerHTML =
            (templateKey === 'gold'
                ? '<span class="agp-entrance-sparkle s1"></span><span class="agp-entrance-sparkle s2"></span><span class="agp-entrance-sparkle s3"></span>'
                : '') +
            avatarHtml +
            '<span class="agp-entrance-text"><span class="agp-entrance-name">' + escapeHtml(player.name || player.id) + '</span>' +
            (msg ? '<span class="agp-entrance-msg">' + escapeHtml(msg) + '</span>' : '') +
            '</span>';

        stage.appendChild(box);
        void box.offsetWidth; // force reflow so the animation always restarts from 0
        box.classList.add('play');

        var duration = PLAY_MS[templateKey] || 4000;
        setTimeout(function () {
            if (box.parentNode) box.parentNode.removeChild(box);
            settleBadge(player, templateKey);
        }, duration);
    }

    AGP.events.on('player:joined', function (payload) {
        var player = payload && payload.player;
        if (player) playEntrance(player);
    });

    AGP.events.on('player:removed', function (payload) {
        var player = payload && payload.player;
        if (player) removeSettledBadge(player.id);
    });

    AGP.events.on('player:listReset', function () {
        clearAllSettledBadges();
    });

    AGP.playerEntrance = {
        /**
         * Syncs settled badges with the current player list. Called once
         * whenever the lobby screen is rebuilt (agp-game-shell.js:
         * renderLobbyScreen), to cover players who joined before the
         * lobby screen was open (they missed the big intro banner but
         * still get the settled badge).
         * @param {Array<Object>} players - current AGP.gameManager.getPlayers()
         */
        syncSettled: function (players) {
            var list = el(LIST_ID);
            if (!list) return;
            (players || []).forEach(function (player) {
                if (!player || _settledByPlayerId[player.id]) return; // already settled or banner in progress
                var templateKey = player.entrance && player.entrance.templateKey;
                if (!VALID_TEMPLATES[templateKey]) return;
                injectStyles();
                settleBadge(player, templateKey);
            });
        }
    };

    AGP.log('AGP Entrance loaded (intro banner + settled badge for players with an active entrance, main lobby screen only).');

}(window.AymanGamesPlatform));
