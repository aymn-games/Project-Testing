/**
 * AGP ELIM CARD — owned "elimination card" (backend/collectibles:
 * user_elim_cards). Shown only when the eliminating player owns an
 * enabled card (player.elimCard = {cardKey}, attached per comment by the
 * TikTok connector); everyone else keeps the game's normal announcement.
 *
 * Shared by any game with an elimination moment:
 *   if (AGP.elimCard && AGP.elimCard.canShow(actor)) {
 *       box.innerHTML = AGP.elimCard.renderHtml(actor, target);
 *   }
 * Layout: the eliminator's photo in the right circle, the eliminated
 * player's in the left circle, "<actor> أقصى <target>" in the bottom banner.
 *
 * Every position is a percentage of the card image's own pixel size
 * (CARD_TEMPLATES), so the card scales to any width. Photos sit behind the
 * frame, 8px larger than each circular hole on every side so their edges
 * hide under the gold rim.
 *
 * Requires js/agp-core.js (and js/agp-events.js for join-time preloading).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var STYLE_ID = 'agp-elim-card-styles';

    // Resolved from this script's own URL so games at any depth
    // (games/<id>/index.html) load the image without passing a basePath.
    var ASSETS_BASE = (function () {
        var script = document.currentScript;
        var src = script && script.src;
        return src ? src.replace(/js\/agp-elim-card\.js(\?.*)?$/, 'assets/elim-cards/') : '../../assets/elim-cards/';
    }());

    // Keys must match ELIM_CARD_CATALOG in backend/collectibles/collectibles-service.js.
    // Boxes are in the image's own pixels: {x, y, w, h}.
    var CARD_TEMPLATES = {
        'ksa-green': {
            image: 'elim-card-ksa-green.png',
            width: 1672,
            height: 941,
            actorHole: { x: 1101, y: 341, w: 312, h: 293 },  // right circle
            targetHole: { x: 257, y: 341, w: 311, h: 294 },  // left circle
            holeBleed: 8,
            textBox: { x: 490, y: 700, w: 682, h: 95 },      // safe area inside the bottom banner
            textColor: 'linear-gradient(180deg,#fff3c4 0%,#e9c77b 45%,#b8863b 100%)'
        },
        // بطاقة الأرنب الأزرق — 1536×896. "عملية إقصاء" مطبوعة بالصورة نفسها،
        // فالجملة "X أقصى Y" تنكتب بالمساحة الكريمية تحت الخط الفاصل السفلي
        // (أضيق من لوح السعودية → fontScale)، بلون أزرق يناسب الخلفية الفاتحة.
        'blue-bunny': {
            image: 'elim-card-blue-bunny.png',
            width: 1536,
            height: 896,
            actorHole: { x: 1036, y: 249, w: 240, h: 240 },  // right circle
            targetHole: { x: 259, y: 250, w: 241, h: 240 },  // left circle
            holeBleed: 6,
            textBox: { x: 560, y: 498, w: 416, h: 74 },      // under the lower divider, above the bunny
            textColor: 'linear-gradient(180deg,#6f9be0 0%,#3d68b8 55%,#2a4c8f 100%)',
            textFilter: 'drop-shadow(0 .1cqw .12cqw rgba(255,255,255,.9))',
            fontScale: 0.66,
            sound: 'elim-card-blue-bunny.wav'                  // "poof" ناعم + أجراس سحرية
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

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = [
            '.agp-elimcard{position:relative;width:100%;container-type:inline-size;direction:rtl;}',
            '.agp-elimcard-frame{position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;display:block;}',
            '.agp-elimcard-avatar{position:absolute;z-index:1;border-radius:50%;overflow:hidden;background:#0d3b2c;}',
            '.agp-elimcard-avatar img{width:100%;height:100%;object-fit:cover;display:block;}',
            '.agp-elimcard-avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;',
            'color:#e9c77b;font-weight:800;font-size:6cqw;}',
            '.agp-elimcard-text{position:absolute;z-index:3;display:flex;align-items:center;justify-content:center;',
            'text-align:center;font-family:"Cairo","Noto Kufi Arabic",sans-serif;font-weight:900;line-height:1.1;',
            'white-space:nowrap;overflow:hidden;-webkit-background-clip:text;background-clip:text;color:transparent;',
            'filter:drop-shadow(0 .15cqw .2cqw rgba(0,0,0,.7));}'
        ].join('');
        document.head.appendChild(style);
    }

    function holeStyle(hole, bleed, tpl) {
        return 'left:' + pct(hole.x - bleed, tpl.width) + ';top:' + pct(hole.y - bleed, tpl.height) +
            ';width:' + pct(hole.w + bleed * 2, tpl.width) + ';height:' + pct(hole.h + bleed * 2, tpl.height) + ';';
    }

    function avatarHtml(player, hole, tpl) {
        var name = playerName(player);
        var initials = escapeHtml(name.trim().slice(0, 2).toUpperCase() || '؟');
        var fallback = '<div class="agp-elimcard-avatar-fallback">' + initials + '</div>';
        var inner = player && player.avatarUrl
            ? '<img src="' + escapeHtml(player.avatarUrl) + '" alt="" referrerpolicy="no-referrer" ' +
              'onerror="this.parentNode.innerHTML=this.parentNode.getAttribute(\'data-fallback\');">'
            : fallback;
        return '<div class="agp-elimcard-avatar" style="' + holeStyle(hole, tpl.holeBleed, tpl) + '" data-fallback="' + escapeHtml(fallback) + '">' + inner + '</div>';
    }

    // Font shrinks for long names so the sentence always fits the banner
    // (3.4cqw fits ~20 characters across textBox.w).
    function fontSizeFor(text, scale) {
        var len = Array.from(text).length;
        var k = scale || 1;
        return (Math.max(1.2, Math.min(3.4, 64 / Math.max(len, 1))) * k).toFixed(2) + 'cqw';
    }

    function templateFor(player) {
        var key = player && player.elimCard && player.elimCard.cardKey;
        return (key && CARD_TEMPLATES[key]) || null;
    }

    // صوت خاص لكل بطاقة (اختياري: tpl.sound) — نسخة Audio وحدة لكل ملف.
    var _audio = {};
    function audioFor(tpl) {
        if (!tpl.sound || typeof Audio === 'undefined') return null;
        if (!_audio[tpl.sound]) {
            _audio[tpl.sound] = new Audio(ASSETS_BASE + tpl.sound);
            _audio[tpl.sound].preload = 'auto';
        }
        return _audio[tpl.sound];
    }

    function preload(tpl) {
        var img = new Image();
        img.src = ASSETS_BASE + tpl.image;
        audioFor(tpl);
    }

    AGP.elimCard = {
        /** True only when the eliminating player owns a known, enabled card. */
        canShow: function (actor) {
            return Boolean(templateFor(actor));
        },

        /**
         * @param {Object} actor - the eliminating player (must own a card)
         * @param {Object} target - the eliminated player
         * @returns {string} HTML for the card; fills its container's width
         */
        renderHtml: function (actor, target) {
            var tpl = templateFor(actor);
            if (!tpl) return '';
            injectStyles();

            var text = playerName(actor) + ' أقصى ' + playerName(target);
            var tb = tpl.textBox;
            var textStyle = 'left:' + pct(tb.x, tpl.width) + ';top:' + pct(tb.y, tpl.height) +
                ';width:' + pct(tb.w, tpl.width) + ';height:' + pct(tb.h, tpl.height) +
                ';font-size:' + fontSizeFor(text, tpl.fontScale) + ';background-image:' + tpl.textColor + ';' +
                (tpl.textFilter ? 'filter:' + tpl.textFilter + ';' : '');

            return '<div class="agp-elimcard" style="aspect-ratio:' + tpl.width + '/' + tpl.height + ';">' +
                avatarHtml(actor, tpl.actorHole, tpl) +
                avatarHtml(target, tpl.targetHole, tpl) +
                '<img class="agp-elimcard-frame" src="' + escapeHtml(ASSETS_BASE + tpl.image) + '" alt="">' +
                '<div class="agp-elimcard-text" style="' + textStyle + '">' + escapeHtml(text) + '</div>' +
                '</div>';
        },

        /** True when the eliminating player's card has its own sound. */
        hasSound: function (actor) {
            var tpl = templateFor(actor);
            return Boolean(tpl && tpl.sound);
        },

        /**
         * Plays the card's own sound once — call when the card appears (not
         * on every re-render). volume 0..1 (default 1); 0 skips play()
         * entirely (iOS takes over the audio session on any play() call).
         * @returns {boolean} true if a card sound was started
         */
        playSound: function (actor, volume) {
            var tpl = templateFor(actor);
            var a = tpl && audioFor(tpl);
            var v = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1;
            if (!a || v <= 0) return false;
            try {
                a.volume = v;
                a.currentTime = 0;
                var p = a.play();
                if (p && typeof p.catch === 'function') p.catch(function () {});
            } catch (e) { return false; }
            return true;
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
            AGP.elimCard.preloadFor(payload && payload.player);
        });
    }
}(window.AymanGamesPlatform));
