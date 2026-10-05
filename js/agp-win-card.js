/**
 * AGP WIN CARD — owned "win card" (backend/collectibles: user_win_cards).
 * Shown only when the winning player owns an enabled card
 * (player.winCard = {cardKey}, attached per comment by the TikTok
 * connector); everyone else keeps the game's normal win screen.
 *
 * Shared by every game at its winner moment:
 *   if (AGP.winCard) AGP.winCard.announce(winners, function (p) {
 *       return [p.score + ' نقطة', 'المركز الأول'];   // bottom-panel lines
 *   });
 * announce() takes over the whole screen with the card (it replaces the
 * win screen visually) for each winner who owns a card, one after another;
 * "متابعة" closes it and reveals the game's own win screen underneath so
 * its buttons (play again, back) stay reachable. Winners without a card are
 * skipped, so calling it for every game end is always safe.
 *
 * Layout: the winner's photo inside the circle, the name in the middle
 * banner, detail lines (points/rank) in the large bottom panel. Every
 * position is a percentage of the card image's own pixel size
 * (CARD_TEMPLATES), so the card scales to any width. The photo sits behind
 * the frame, slightly larger than the circular hole so its edge hides under
 * the rim.
 *
 * Requires js/agp-core.js (and js/agp-events.js for join-time preloading).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var STYLE_ID = 'agp-win-card-styles';
    var OVERLAY_ID = 'agp-wincard-overlay';

    // Resolved from this script's own URL so games at any depth load the
    // image without passing a basePath.
    var ASSETS_BASE = (function () {
        var script = document.currentScript;
        var src = script && script.src;
        return src ? src.replace(/js\/agp-win-card\.js(\?.*)?$/, 'assets/win-cards/') : '../../assets/win-cards/';
    }());

    // Keys must match WIN_CARD_CATALOG in backend/collectibles/collectibles-service.js.
    // Boxes are in the image's own pixels: {x, y, w, h}.
    var CARD_TEMPLATES = {
        // فوز الريس (أزرق) — 1024×1536. "فوز الريس" مطبوعة بالصورة نفسها؛
        // الدائرة شفافة (الصورة خلفها)، الاسم بالشريط الأوسط، والنقاط/الترتيب
        // بالكرت السفلي الكبير.
        'rais-blue': {
            image: 'win-card-rais-blue.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 287, y: 387, w: 450, h: 450 },
            holeBleed: 8,
            nameBox: { x: 215, y: 926, w: 594, h: 90 },
            detailBox: { x: 190, y: 1180, w: 644, h: 195 },
            textColor: 'linear-gradient(180deg,#ffffff 0%,#e6edf7 45%,#a9bad3 100%)',
            detailColor: 'linear-gradient(180deg,#ffffff 0%,#cfe0f7 50%,#8fb2e6 100%)',
            fallbackBg: '#0b2350',
            fallbackColor: '#cfe0f7'
        }
    };

    function escapeHtml(value) {
        return String(value === null || value === undefined ? '' : value)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function playerName(player) {
        return (player && (player.name || player.id)) || '—';
    }

    function pct(value, total) {
        return (value / total * 100).toFixed(3) + '%';
    }

    function boxStyle(box, tpl) {
        return 'left:' + pct(box.x, tpl.width) + ';top:' + pct(box.y, tpl.height) +
            ';width:' + pct(box.w, tpl.width) + ';height:' + pct(box.h, tpl.height) + ';';
    }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.agp-wincard{position:relative;width:100%;container-type:inline-size;direction:rtl;}',
            '.agp-wincard-frame{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;display:block;}',
            '.agp-wincard-avatar{position:absolute;z-index:1;border-radius:50%;overflow:hidden;}',
            '.agp-wincard-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.agp-wincard-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
            'font-weight:800;font-size:14cqw;font-family:"Cairo","Noto Kufi Arabic",sans-serif;}',
            '.agp-wincard-text{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;',
            'text-align:center;font-family:"Cairo","Noto Kufi Arabic",sans-serif;font-weight:900;line-height:1.15;',
            'white-space:nowrap;overflow:hidden;-webkit-background-clip:text;background-clip:text;color:transparent;',
            'filter:drop-shadow(0 .3cqw .35cqw rgba(0,0,0,.75));}',
            '.agp-wincard-detail{position:absolute;z-index:3;display:flex;flex-direction:column;align-items:center;',
            'justify-content:center;gap:1.2cqw;text-align:center;font-family:"Cairo","Noto Kufi Arabic",sans-serif;}',
            '.agp-wincard-line{max-width:100%;font-weight:800;line-height:1.15;white-space:nowrap;overflow:hidden;',
            '-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 .3cqw .35cqw rgba(0,0,0,.75));}',
            // Full-screen takeover — replaces the game's win screen until "متابعة".
            '#' + OVERLAY_ID + '{position:fixed;inset:0;z-index:2147483000;display:flex;flex-direction:column;align-items:center;',
            'justify-content:center;gap:14px;padding:16px;box-sizing:border-box;direction:rtl;',
            'background:radial-gradient(ellipse at center,rgba(10,30,70,.96) 0%,rgba(3,8,20,.98) 70%);',
            'animation:agpWinCardFade .35s ease-out;}',
            '#' + OVERLAY_ID + ' .agp-wincard-stage{width:min(92vw,calc((100vh - 110px) * 2 / 3),620px);',
            'animation:agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1);}',
            '#' + OVERLAY_ID + ' .agp-wincard-next{min-width:160px;height:46px;padding:0 26px;border-radius:999px;cursor:pointer;',
            'font-family:"Cairo","Noto Kufi Arabic",sans-serif;font-size:17px;font-weight:800;color:#0b2350;',
            'border:1px solid rgba(255,255,255,.7);background:linear-gradient(180deg,#ffffff 0%,#cfdcef 100%);',
            'box-shadow:0 6px 22px rgba(80,140,255,.35);}',
            '@keyframes agpWinCardFade{from{opacity:0}to{opacity:1}}',
            '@keyframes agpWinCardPop{from{opacity:0;transform:scale(.7)}to{opacity:1;transform:scale(1)}}'
        ].join('');
        document.head.appendChild(style);
    }

    function avatarHtml(player, tpl) {
        var name = playerName(player);
        var initials = escapeHtml(name.trim().slice(0, 2).toUpperCase() || '؟');
        var fallback = '<div class="agp-wincard-avatar-fallback" style="background:' + tpl.fallbackBg +
            ';color:' + tpl.fallbackColor + ';">' + initials + '</div>';
        var inner = player && player.avatarUrl
            ? '<img src="' + escapeHtml(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
              'onerror="this.parentNode.innerHTML=this.parentNode.getAttribute(\'data-fallback\');">'
            : fallback;
        var b = tpl.holeBleed;
        var hole = { x: tpl.photoHole.x - b, y: tpl.photoHole.y - b, w: tpl.photoHole.w + b * 2, h: tpl.photoHole.h + b * 2 };
        return '<div class="agp-wincard-avatar" style="' + boxStyle(hole, tpl) + 'background:' + tpl.fallbackBg +
            ';" data-fallback="' + escapeHtml(fallback) + '">' + inner + '</div>';
    }

    // Font shrinks for long names so the name always fits the banner
    // (6.4cqw fits ~12 characters across nameBox.w).
    function nameFontSize(text) {
        var len = Array.from(text).length;
        return Math.max(2.6, Math.min(6.4, 76 / Math.max(len, 1))).toFixed(2) + 'cqw';
    }

    // Bottom-panel lines: the first line is the headline, the rest smaller.
    function lineFontSize(text, index, count) {
        var len = Array.from(text).length;
        var max = index === 0 ? (count > 2 ? 6 : 7) : (count > 2 ? 4.4 : 5);
        var fit = (index === 0 ? 112 : 84) / Math.max(len, 1);
        return Math.max(2.4, Math.min(max, fit)).toFixed(2) + 'cqw';
    }

    function templateFor(player) {
        var key = player && player.winCard && player.winCard.cardKey;
        return (key && CARD_TEMPLATES[key]) || null;
    }

    function preload(tpl) {
        var img = new Image();
        img.src = ASSETS_BASE + tpl.image;
    }

    function normalizeLines(lines) {
        return (Array.isArray(lines) ? lines : [lines])
            .filter(function (l) { return l !== null && l !== undefined && String(l).trim() !== ''; })
            .map(String)
            .slice(0, 3);
    }

    var _queue = [];
    var _showing = false;

    function closeOverlay() {
        var el = document.getElementById(OVERLAY_ID);
        if (el && el.parentNode) el.parentNode.removeChild(el);
    }

    function showNext() {
        var item = _queue.shift();
        if (!item) {
            _showing = false;
            closeOverlay();
            return;
        }
        _showing = true;
        injectStyles();
        closeOverlay();

        var overlay = document.createElement('div');
        overlay.id = OVERLAY_ID;
        overlay.innerHTML = '<div class="agp-wincard-stage">' + AGP.winCard.renderHtml(item.player, item.lines) + '</div>' +
            '<button type="button" class="agp-wincard-next">' + (_queue.length ? 'التالي' : 'متابعة') + '</button>';
        overlay.querySelector('.agp-wincard-next').addEventListener('click', function (e) {
            e.stopPropagation();
            showNext();
        });
        document.body.appendChild(overlay);
    }

    AGP.winCard = {
        /** True only when the winning player owns a known, enabled card. */
        canShow: function (player) {
            return Boolean(templateFor(player));
        },

        /**
         * @param {Object} player - the winning player (must own a card)
         * @param {Array<string>|string} [lines] - up to 3 detail lines for
         *   the bottom panel (points, rank, team...). First line is largest.
         * @returns {string} HTML for the card; fills its container's width
         */
        renderHtml: function (player, lines) {
            var tpl = templateFor(player);
            if (!tpl) return '';
            injectStyles();

            var name = playerName(player);
            var nameStyle = boxStyle(tpl.nameBox, tpl) + 'font-size:' + nameFontSize(name) +
                ';background-image:' + tpl.textColor + ';';

            var list = normalizeLines(lines);
            var detailHtml = list.map(function (line, i) {
                return '<div class="agp-wincard-line" style="font-size:' + lineFontSize(line, i, list.length) +
                    ';background-image:' + tpl.detailColor + ';">' + escapeHtml(line) + '</div>';
            }).join('');

            return '<div class="agp-wincard" style="aspect-ratio:' + tpl.width + '/' + tpl.height + ';">' +
                avatarHtml(player, tpl) +
                '<img class="agp-wincard-frame" src="' + escapeHtml(ASSETS_BASE + tpl.image) + '" alt="">' +
                '<div class="agp-wincard-text" style="' + nameStyle + '">' + escapeHtml(name) + '</div>' +
                (detailHtml ? '<div class="agp-wincard-detail" style="' + boxStyle(tpl.detailBox, tpl) + '">' + detailHtml + '</div>' : '') +
                '</div>';
        },

        /**
         * Shows the card full-screen for every winner who owns one (in
         * order), replacing the win screen until "متابعة". Safe to call at
         * every game end: winners without a card are skipped.
         * @param {Object|Array<Object>} winners - winning player(s)
         * @param {Function|Array<string>} [linesFor] - (player, index) =>
         *   detail lines, or a fixed array used for every winner
         * @returns {number} how many cards were queued
         */
        announce: function (winners, linesFor) {
            var list = (Array.isArray(winners) ? winners : [winners]).filter(Boolean);
            var seen = {};
            var added = 0;
            list.forEach(function (player, i) {
                if (!templateFor(player)) return;
                var key = player.id || player.name;
                if (key && seen[key]) return;
                if (key) seen[key] = true;
                var lines = typeof linesFor === 'function' ? linesFor(player, i) : linesFor;
                _queue.push({ player: player, lines: lines });
                added++;
            });
            if (added && !_showing) showNext();
            return added;
        },

        /** Removes any visible card (e.g. when the game resets mid-display). */
        dismiss: function () {
            _queue = [];
            _showing = false;
            closeOverlay();
        },

        /** Warm the image cache so the card shows without a load flash. */
        preloadFor: function (player) {
            var tpl = templateFor(player);
            if (tpl) preload(tpl);
        }
    };

    // Owners get their card image cached as soon as they join.
    if (AGP.events && typeof AGP.events.on === 'function') {
        AGP.events.on('player:joined', function (payload) {
            AGP.winCard.preloadFor(payload && payload.player);
        });
    }
}(window.AymanGamesPlatform));
