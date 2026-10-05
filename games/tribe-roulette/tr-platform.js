/**
 * روليت القبائل (النسخة الثانية) — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * المباراة) منقولة من ملفات التصميم المعتمدة وتشتغل عبر support.js.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة (نفس روليت الإقصاء):
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - الهدايا (الإنعاش عن طريق الدعم): الحدث 'stream:giftReceived' +
 *    أيقونات الهدايا الحقيقية المشتركة (assets/tiktok-gifts) — نفس قائمة التصميم.
 *  - بيانات اللاعبين (id/صورة/إطار/بطاقة فوز/فيديو فوز) تُحفظ بـ
 *    'tribe2-players' بجانب 'tribe2-roster' (أسماء فقط، كما في عقد البيانات).
 *  - بطاقة اللاعب صاحب الإطار: TR.frameCard() عبر AGP.playerCard المشترك.
 *  - بطاقة الفوز المملوكة: TR.winCard() عبر AGP.winCard المشترك.
 * يحتاج تحميل ملفات js/agp-*.js + الأدابتر + auth/auth-client.js +
 * js/agp-player-card.js + js/agp-win-card.js + assets/tiktok-gifts/tiktok-gifts.js قبله.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';

    function readJSON(key, fallback) {
        try {
            var raw = localStorage.getItem(key);
            return raw ? JSON.parse(raw) : fallback;
        } catch (e) { return fallback; }
    }
    function writeJSON(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
    }

    function getSavedConnection() {
        var data = readJSON(STREAM_CONNECTION_STORAGE_KEY, null);
        return data && typeof data.username === 'string' && data.username ? data : null;
    }

    // تطبيع النص قبل المقارنة — كلمة الدخول ورقم اللاعب بالشات.
    // التشكيل والتطويل والرموز غير المرئية والترقيم · أ إ آ ٱ ← ا · ة ← ه · ى ← ي · ؤ ← و · ئ ← ي · حذف ء
    // الحروف الفارسية (ی ک ہ) · الأرقام العربية والفارسية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
    }

    /** رقم لاعب مكتوب بالشات (أرقام عربية/فارسية/إنجليزية، مع مسافات أو رموز حوله) أو null. */
    function chatNumber(text) {
        // كل أشكال الأرقام: إنجليزية 0-9، عربية ٠-٩، فارسية ۰-۹، وعريضة ０-９ (عبر NFKC)
        var t = String(text == null ? '' : text).normalize('NFKC').trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); });
        if (t.replace(/[\s0-9#.\-]/g, '').length) return null;
        t = t.replace(/[^0-9]/g, '');
        if (!t || t.length > 4) return null;
        var n = parseInt(t, 10);
        return n > 0 ? n : null;
    }

    /**
     * بطاقة لاعب بإطاره من المنصة (عنصر React يُمرَّر للقالب) — تُرسم عبر
     * AGP.playerCard.renderHtml(showFrame) المشترك مع باقي الألعاب، ويُحسب
     * حجمها من عرض الخانة الفعلي حتى تتوافق مع شبكة بطاقات اللوبي.
     * onKick (اختياري): زر الإقصاء × داخل حدود الإطار نفسه على الطرف
     * الداخلي للوح الاسم (يُقاس موضع اللوح بعد الرسم بكل إطار).
     * ارتفاع البطاقة المؤطّرة ثابت 100px (LOBBY_CARD_HEIGHT_PX في
     * js/agp-player-card.js) والإطار يتوسّط داخله.
     */
    var FRAME_CARD_HEIGHT = 100; // نفس LOBBY_CARD_HEIGHT_PX في js/agp-player-card.js
    var FRAME_CARD_WIDTH_RATIO = 4.96; // عرض البطاقة ≈ 4.95 × حجم الصورة (basicCardTotalWidth)
    var X_SIZE = 24; // مساحة زر × داخل لوح الاسم
    var _FrameCard = null;
    function frameCard(player, onKick) {
        var React = window.React;
        if (!React || !AGP.playerCard) return null;
        if (!_FrameCard) {
            _FrameCard = function (props) {
                var ref = React.useRef(null), boxRef = React.useRef(null);
                var st = React.useState(0), w = st[0], setW = st[1];
                var xs = React.useState(null), xPos = xs[0], setXPos = xs[1];
                React.useLayoutEffect(function () {
                    var node = ref.current;
                    if (!node) return;
                    var measure = function () { setW(Math.floor(node.clientWidth)); };
                    measure();
                    if (!window.ResizeObserver) return;
                    var ro = new ResizeObserver(measure);
                    ro.observe(node);
                    return function () { ro.disconnect(); };
                }, []);
                // خط الاسم يتبع ارتفاع لوح الاسم بكل إطار، ثم الأسماء الطويلة تتحرك داخل اللوح (fitAllNames).
                React.useEffect(function () {
                    if (!w || !ref.current) return;
                    var plates = ref.current.querySelectorAll('[data-agp-pcard-name="1"]');
                    for (var i = 0; i < plates.length; i++) {
                        var ph = plates[i].clientHeight;
                        if (ph) { plates[i].style.fontSize = Math.max(9, Math.min(14, Math.round(ph * 0.65))) + 'px'; plates[i].style.lineHeight = '1.2'; }
                        // مساحة × تُقتطع من عرض اللوح نفسه حتى الاسم وحركته ما يدخلون تحت ×
                        if (props.onKick) { var pl = plates[i]; if (!pl.dataset.w) pl.dataset.w = pl.style.width; pl.style.width = 'calc(' + pl.dataset.w + ' - ' + X_SIZE + 'px)'; }
                    }
                    AGP.playerCard.fitAllNames(ref.current);
                    if (props.onKick && plates[0] && boxRef.current) {
                        var b = boxRef.current.getBoundingClientRect(), r = plates[0].getBoundingClientRect();
                        var next = { left: Math.round(r.right - b.left), top: Math.round(r.top - b.top + r.height / 2 - X_SIZE / 2) };
                        if (!xPos || xPos.left !== next.left || xPos.top !== next.top) setXPos(next);
                    }
                });
                var p = props.player;
                var H = FRAME_CARD_HEIGHT;
                var html = w ? AGP.playerCard.renderHtml(
                    { id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame },
                    { showFrame: true, basePath: '../../', size: Math.max(20, Math.floor(w / FRAME_CARD_WIDTH_RATIO)) }
                ) : '';
                var h = React.createElement;
                var hov = React.useState(false), hover = hov[0], setHover = hov[1];
                var kick = props.onKick && xPos ? h('button', {
                    key: 'x', type: 'button', 'aria-label': 'إقصاء ' + p.name, onClick: props.onKick,
                    onMouseEnter: function () { setHover(true); }, onMouseLeave: function () { setHover(false); },
                    style: { position: 'absolute', top: xPos.top, left: xPos.left, zIndex: 10, width: X_SIZE, height: X_SIZE, border: 'none', background: 'transparent', padding: 0,
                        color: '#fca5a5', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: hover ? 1 : 0.75,
                        transform: hover ? 'scale(1.15)' : 'none', transition: 'opacity .2s, transform .2s', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.9))' }
                }, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', 'aria-hidden': true },
                    h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }), h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }))) : null;
                return h('div', {
                    ref: ref,
                    style: { width: '100%', minWidth: 0, height: H, display: 'flex', justifyContent: 'center', alignItems: 'center', direction: 'ltr', overflow: 'visible' }
                }, h('div', { ref: boxRef, style: { position: 'relative', lineHeight: 0 } }, [
                    h('div', { key: 'card', dangerouslySetInnerHTML: { __html: html } }),
                    kick
                ]));
            };
        }
        return React.createElement(_FrameCard, { key: 'fc-' + player.name, player: player, onKick: onKick });
    }

    /**
     * بطاقة الفوز المملوكة (js/agp-win-card.js) كعنصر React بعرض 240px —
     * تحل محل بطاقة الفائز العادية بنفس مكانها بشاشة الفوز، فقط لو الفائز
     * يملك بطاقة مفعّلة. player: {name, avatarUrl, winCard}. lines: أسطر
     * الكرت السفلي (الترتيب/النقاط). ترجع null لو ما يملك بطاقة.
     */
    function winCard(player, lines, key, width) {
        var React = window.React;
        if (!React || !AGP.winCard || !player || !AGP.winCard.canShow(player)) return null;
        // الحركة على الغلاف (مرة وحدة عند الظهور) — المحتوى يتحدّث بدونها لما توصل النقاط.
        return React.createElement('div', { key: key || 'wc', style: { width: width || 240, maxWidth: '100%', lineHeight: 0, animation: 'agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1) both' }, dangerouslySetInnerHTML: { __html: AGP.winCard.renderHtml(player, lines, { pop: false }) } });
    }
    function hasWinCard(player) {
        return !!(player && AGP.winCard && AGP.winCard.canShow(player));
    }

    var _connected = false;
    function connect() {
        var saved = getSavedConnection();
        if (_connected || !saved || !AGP.streamConnector) return false;
        _connected = true;
        AGP.streamConnector.connect('tiktok', { username: saved.username });
        return true;
    }

    /** cb(payload) لكل تعليق من شات البث. ترجع دالة لإلغاء الاستماع. */
    function onComment(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            cb(payload);
        });
    }

    /** cb(payload) لكل هدية من البث ({id, name, giftName, ...}). ترجع دالة لإلغاء الاستماع. */
    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:giftReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    // أنواع الدعم = هدايا تيك توك الحقيقية المشتركة (assets/tiktok-gifts) بصورها.
    // GIFT_NAMES: أسماء الهدية كما يرسلها تيك توك (giftName) لو تختلف عن المعرّف.
    var GIFT_NAMES = {
        'ice-cream': ['Ice Cream Cone', 'Ice Cream'],
        'donut': ['Doughnut', 'Donut'],
        'finger-heart': ['Finger Heart'],
        'heart-in-your-hands-a': ['Heart In Your Hands', 'Heart in Your Hands'],
        'heart-in-your-hands-b': ['Heart In Your Hands', 'Heart in Your Hands'],
        'hand-hearts': ['Hand Hearts'],
        'drama-queen': ['Drama Queen'],
        'little-crown': ['Little Crown'],
        'music-note': ['Music Note'],
        'money-gun': ['Money Gun'],
        'sports-car': ['Sports Car'],
        'tiktok-universe': ['TikTok Universe', 'Universe'],
        'kings-scepter': ["King's Scepter", 'Kings Scepter', 'Scepter'],
        'hat-and-mustache': ['Hat and Mustache', 'Hat & Mustache'],
        'love-saudi': ['Love Saudi', 'I Love KSA', 'Love KSA'],
        'saudi-in-heart': ['Saudi in Heart', 'KSA in my heart'],
        'diving-with-whales': ['Diving with Whales', 'Whale diving']
    };
    function giftKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    /** هل اسم الهدية القادمة من البث يطابق نوع الدعم (id)؟ */
    function giftMatches(giftId, giftName) {
        var got = giftKey(giftName);
        if (!got || !giftId) return false;
        if (got === giftKey(giftId)) return true;
        return (GIFT_NAMES[giftId] || []).some(function (n) { return giftKey(n) === got; });
    }
    /** قائمة أنواع الدعم: [{id, name, coins, img}] — كل الهدايا المعتمدة، مرتبة تصاعدياً بالكوينز. */
    var _gifts = null;
    function gifts() {
        if (_gifts) return _gifts;
        var G = AGP.tiktokGifts, out = [];
        if (G && G.list) G.list.forEach(function (g) { out.push({ id: g.id, name: g.label, coins: g.coins, img: G.iconUrl(g) }); });
        out.sort(function (a, b) { return a.coins - b.coins; });
        return (_gifts = out);
    }
    function giftById(id) {
        var all = gifts();
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }

    /** صورة حساب تيك توك الموثّق للاستريمر (من حسابه بالمنصة) أو null. */
    function streamerAvatar() {
        try {
            var u = window.AGPAuth && typeof window.AGPAuth.getCachedUser === 'function' ? window.AGPAuth.getCachedUser() : null;
            return (u && u.tiktok_avatar_url) || null;
        } catch (e) { return null; }
    }

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء (كما في التصميم)، وهنا نربط كل
     * اسم بـ id ثابت من المنصة (tiktok:<username>) وصورته وإطاره وبطاقة
     * إقصائه وفيديو فوزه. لو تكرر اسم العرض لحسابين مختلفين يُضاف رقم
     * للاسم الثاني حتى يبقى كل اسم فريداً.
     */
    function createRegistry(initial) {
        var byName = Object.assign({}, initial || {});
        var byId = {};
        Object.keys(byName).forEach(function (n) { if (byName[n] && byName[n].id) byId[byName[n].id] = n; });
        function winVideoOf(payload) {
            var v = payload.winVideo || payload.winVideoUrl || null;
            if (v && typeof v === 'object') v = v.url || v.src || null;
            return typeof v === 'string' && v ? v : null;
        }
        return {
            nameFor: function (payload) {
                if (byId[payload.id]) {
                    var known = byName[byId[payload.id]];
                    if (payload.avatarUrl) known.avatar = payload.avatarUrl;
                    if (payload.frame !== undefined) known.frame = payload.frame || null;
                    if (payload.winCard !== undefined) known.winCard = payload.winCard || null;
                    var wv = winVideoOf(payload); if (wv) known.winVideo = wv;
                    return byId[payload.id];
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null, winCard: payload.winCard || null, winVideo: winVideoOf(payload) };
                byId[payload.id] = name;
                return name;
            },
            has: function (name) { return !!byName[name]; },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            winVideo: function (name) { return (byName[name] && byName[name].winVideo) || null; },
            // اللاعب بصيغة AGP ({id, name, avatarUrl, winCard}) — لبطاقة الفوز ونقاط المنصة
            player: function (name) {
                var p = byName[name] || {};
                return { id: p.id || name, name: name, avatarUrl: p.avatar || null, winCard: p.winCard || null };
            },
            // لاعب عنده إطار مفعّل من المنصة → بيانات بطاقته، وإلا null
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    window.TR = {
        libraryUrl: 'https://aymngames.online/',
        keys: { setup: 'tribe2-settings', roster: 'tribe2-roster', players: 'tribe2-players' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        chatNumber: chatNumber,
        frameCard: frameCard,
        winCard: winCard,
        hasWinCard: hasWinCard,
        connect: connect,
        onComment: onComment,
        onGift: onGift,
        gifts: gifts,
        giftById: giftById,
        giftMatches: giftMatches,
        streamerAvatar: streamerAvatar,
        createRegistry: createRegistry
    };
}());
