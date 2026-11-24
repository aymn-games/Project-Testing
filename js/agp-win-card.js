/**
 * AGP WIN CARD — owned "win card" (backend/collectibles: user_win_cards).
 * Shown only when the winning player owns an enabled card
 * (player.winCard = {cardKey}, attached per comment by the TikTok
 * connector); everyone else keeps the game's normal winner card.
 *
 * The game keeps its own win screen — only the winner's card inside it is
 * swapped. Games using the shared AGP.playerCard.renderTrophyCard() get this
 * automatically (kind 'winner', detail lines via opts.winCardLines). Games
 * with their own winner card do:
 *   if (AGP.winCard && AGP.winCard.canShow(winner)) {
 *       box.innerHTML = AGP.winCard.renderHtml(winner, ['المركز الأول', '12 نقطة']);
 *   }
 *
 * Layout: the winner's photo inside the circle, the name in the middle
 * banner, up to 3 detail lines (points/rank) in the large bottom panel.
 * Every position is a percentage of the card image's own pixel size
 * (CARD_TEMPLATES), so the card fills any container width. The photo sits
 * behind the frame, slightly larger than the circular hole so its edge
 * hides under the rim.
 *
 * Requires js/agp-core.js (and js/agp-events.js for join-time preloading).
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    var STYLE_ID = 'agp-win-card-styles';

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
        },
        // فوز بنات (أزرق) — 1024×1536. الدائرة شفافة (الصورة خلفها)، الاسم
        // باللوح الكريمي الأوسط، والنقاط/الترتيب بالكرت السفلي الأزرق الفاتح.
        // اللوحان فاتحان — نص أزرق غامق بدل الأبيض.
        'girls-blue': {
            image: 'win-card-girls-blue.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 270, y: 340, w: 484, h: 484 },
            holeBleed: 8,
            nameBox: { x: 225, y: 990, w: 574, h: 95 },
            detailBox: { x: 175, y: 1185, w: 674, h: 200 },
            textColor: 'linear-gradient(180deg,#3a5fa8 0%,#2b4a86 50%,#16306a 100%)',
            detailColor: 'linear-gradient(180deg,#3a5fa8 0%,#2b4a86 50%,#16306a 100%)',
            fallbackBg: '#dce7f7',
            fallbackColor: '#2b4a86'
        },
        // ساكورا الوردي — منح محدود (حصري لشخص واحد). 1024×1536. الدائرة
        // شفافة (281→743 × 304→773)، الاسم داخل اللوح البيضاوي، والنقاط/الترتيب
        // بالكرت السفلي. اللوحان زهري فاتح — نص وردي غامق.
        'sakura-pink': {
            image: 'win-card-sakura-pink.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 280, y: 306, w: 465, h: 465 },
            holeBleed: 8,
            nameBox: { x: 240, y: 950, w: 545, h: 100 },
            detailBox: { x: 180, y: 1185, w: 640, h: 185 },
            textColor: 'linear-gradient(180deg,#8a3a5c 0%,#6b2546 50%,#4a1530 100%)',
            detailColor: 'linear-gradient(180deg,#8a3a5c 0%,#6b2546 50%,#4a1530 100%)',
            fallbackBg: '#f7dbe4',
            fallbackColor: '#6b2546'
        },
        // القطة الزرقاء — منح محدود. 1024×1536. الدائرة شفافة (256→765 ×
        // 274→778)، الاسم داخل اللوح البيضاوي تحت القطة (222→782 × 964→1056)،
        // والنقاط/الترتيب بالكرت السفلي (108→916 × 1204→1410) بعيداً عن
        // النجوم. اللوحان أزرق فاتح — نص أزرق غامق.
        'blue-kitty': {
            image: 'win-card-blue-kitty.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 256, y: 274, w: 510, h: 505 },
            holeBleed: 8,
            nameBox: { x: 250, y: 968, w: 524, h: 86 },
            detailBox: { x: 175, y: 1215, w: 674, h: 185 },
            textColor: 'linear-gradient(180deg,#3a5fa8 0%,#2b4a86 50%,#16306a 100%)',
            detailColor: 'linear-gradient(180deg,#3a5fa8 0%,#2b4a86 50%,#16306a 100%)',
            fallbackBg: '#dce7f7',
            fallbackColor: '#2b4a86'
        },
        // الخفاش الذهبي — منح محدود. الأصل JPG 832×1248 بمربعات «شفافية»
        // مرسومة: فُرّغت الخلفية والدائرة لشفافية حقيقية، وكُبّرت على 1024×1536.
        // الدائرة 195→826 × 351→961، الاسم باللوح الأسود الأول (161→863 ×
        // 986→1149)، والنقاط/الترتيب باللوح الثاني (116→909 × 1188→1445).
        // اللوحان أسود — نص ذهبي.
        'gold-bat': {
            image: 'win-card-gold-bat.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 195, y: 351, w: 631, h: 610 },
            holeBleed: 8,
            nameBox: { x: 190, y: 1000, w: 644, h: 135 },
            detailBox: { x: 150, y: 1205, w: 724, h: 225 },
            textColor: 'linear-gradient(180deg,#fff3c4 0%,#f3c43a 50%,#b8863b 100%)',
            detailColor: 'linear-gradient(180deg,#fff3c4 0%,#f3c43a 50%,#b8863b 100%)',
            fallbackBg: '#111216',
            fallbackColor: '#f3c43a'
        },
        // التاج المجنّح — منح محدود. الأصل PNG 1024×1536 بخلفية سوداء: فُرّغت
        // الخلفية والدائرة لشفافية حقيقية، وتمدّد بالطول 4% عشان يعبّي البطاقة
        // كاملة مثل باقي البطاقات. الدائرة 219→800 × 275→826، واللوح الكريمي
        // 159→864 × 944→1299: الاسم بأعلاه والنقاط/الترتيب تحته. لوح فاتح — نص
        // بني ذهبي. الصوت مقطع صاحب المشروع كامل (5.4 ثانية) بمستوى -16 LUFS.
        'winged-crown': {
            image: 'win-card-winged-crown.png',
            width: 1024,
            height: 1536,
            photoHole: { x: 219, y: 275, w: 581, h: 551 },
            holeBleed: 8,
            nameBox: { x: 200, y: 975, w: 624, h: 125 },
            detailBox: { x: 200, y: 1110, w: 624, h: 185 },
            textColor: 'linear-gradient(180deg,#b8801f 0%,#8a5a12 50%,#5c3a08 100%)',
            detailColor: 'linear-gradient(180deg,#b8801f 0%,#8a5a12 50%,#5c3a08 100%)',
            fallbackBg: '#f3e6c8',
            fallbackColor: '#8a5a12',
            sound: 'win-card-winged-crown.mp3'
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
            '.agp-wincard-pop{animation:agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1) both;}',
            '@keyframes agpWinCardPop{from{opacity:0;transform:scale(.8)}to{opacity:1;transform:scale(1)}}'
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
        // One line each — long text (e.g. "لا يوجد حساب مرتبط…") shrinks to fit.
        var fit = (index === 0 ? 112 : 84) / Math.max(len, 1);
        return Math.max(2.2, Math.min(max, fit)).toFixed(2) + 'cqw';
    }

    function templateFor(player) {
        var key = player && player.winCard && player.winCard.cardKey;
        return (key && CARD_TEMPLATES[key]) || null;
    }

    function preload(tpl) {
        var img = new Image();
        img.src = ASSETS_BASE + tpl.image;
        audioFor(tpl);
    }

    // صوت خاص لكل بطاقة (اختياري: tpl.sound) — نسخة Audio وحدة لكل ملف.
    // يشتغل تلقائياً مرة وحدة لما تظهر البطاقة (renderHtml)، بدون أي تعديل
    // بملفات الألعاب. إعادة رسم نفس البطاقة (pop:false، أو نفس الفائز خلال
    // SOUND_GAP_MS) ما تعيد الصوت.
    var SOUND_GAP_MS = 15000;
    var _audio = {};
    var _lastPlayed = {};
    function audioFor(tpl) {
        if (!tpl.sound || typeof Audio === 'undefined') return null;
        if (!_audio[tpl.sound]) {
            _audio[tpl.sound] = new Audio(ASSETS_BASE + tpl.sound);
            _audio[tpl.sound].preload = 'auto';
        }
        return _audio[tpl.sound];
    }
    function playOnce(player, tpl, volume) {
        var a = audioFor(tpl);
        if (!a) return false;
        var key = ((player && player.id) || playerName(player)) + '|' + tpl.image;
        var now = Date.now();
        if (_lastPlayed[key] && now - _lastPlayed[key] < SOUND_GAP_MS) return false;
        _lastPlayed[key] = now;
        try {
            a.volume = typeof volume === 'number' ? Math.max(0, Math.min(1, volume)) : 1;
            a.currentTime = 0;
            var p = a.play();
            if (p && typeof p.catch === 'function') p.catch(function () {});
        } catch (e) { return false; }
        return true;
    }

    function normalizeLines(lines) {
        return (Array.isArray(lines) ? lines : [lines])
            .filter(function (l) { return l !== null && l !== undefined && String(l).trim() !== ''; })
            .map(String)
            .slice(0, 3);
    }

    // نص نقاط المنصة المكتسبة من pointsHtml الخاص باللعبة (نفس نص البطاقة
    // العادية: "+14 نقطة" / "تعذّر جلب النقاط الآن" / ...) بدون السطر الفرعي.
    function pointsLineFromHtml(html) {
        if (!html) return '';
        var box = document.createElement('div');
        box.innerHTML = html;
        var sub = box.querySelectorAll('.agp-points-sub');
        for (var i = 0; i < sub.length; i++) sub[i].parentNode.removeChild(sub[i]);
        return (box.textContent || '').replace(/\s+/g, ' ').trim();
    }

    AGP.winCard = {
        pointsLineFromHtml: pointsLineFromHtml,

        /** True only when the winning player owns a known, enabled card. */
        canShow: function (player) {
            return Boolean(templateFor(player));
        },

        /**
         * @param {Object} player - the winning player (must own a card)
         * @param {Array<string>|string} [lines] - up to 3 detail lines for
         *   the bottom panel (rank, earned points, game...). First line is largest.
         * @param {Object} [opts]
         * @param {boolean} [opts.pop=true] - false skips the pop-in animation (for
         *   re-renders, e.g. when the earned points arrive after the card is shown)
         * @param {boolean} [opts.silent=false] - true never plays the card's sound
         * @returns {string} HTML for the card; fills its container's width
         */
        renderHtml: function (player, lines, opts) {
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

            var pop = !(opts && opts.pop === false);
            if (tpl.sound && pop && !(opts && opts.silent)) playOnce(player, tpl, opts && opts.volume);
            return '<div class="agp-wincard' + (pop ? ' agp-wincard-pop' : '') + '" style="aspect-ratio:' + tpl.width + '/' + tpl.height + ';">' +
                avatarHtml(player, tpl) +
                '<img class="agp-wincard-frame" src="' + escapeHtml(ASSETS_BASE + tpl.image) + '" alt="">' +
                '<div class="agp-wincard-text" style="' + nameStyle + '">' + escapeHtml(name) + '</div>' +
                (detailHtml ? '<div class="agp-wincard-detail" style="' + boxStyle(tpl.detailBox, tpl) + '">' + detailHtml + '</div>' : '') +
                '</div>';
        },

        /** True when the winner's card has its own sound. */
        hasSound: function (player) {
            var tpl = templateFor(player);
            return Boolean(tpl && tpl.sound);
        },

        /** Plays the card's sound now (e.g. a profile button), ignoring the repeat gap. */
        playSound: function (player, volume) {
            var tpl = templateFor(player);
            if (!tpl || !tpl.sound) return false;
            _lastPlayed[((player && player.id) || playerName(player)) + '|' + tpl.image] = 0;
            return playOnce(player, tpl, volume);
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
