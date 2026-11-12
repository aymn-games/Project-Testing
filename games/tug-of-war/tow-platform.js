/**
 * شد الحبل — ربط شاشات اللعبة (قالب .dc.html) بالمنصة.
 *
 * نفس نمط ألعاب القالب (إكس أو، القنبلة …): ثلاث شاشات
 * (index.html الإعدادات، lobby.html اللوبي، game.html اللعبة) تشتغل عبر
 * support.js، وهذا الملف طبقة الربط الوحيدة بينها وبين المنصة:
 *  - حالة الاتصال بالبث: الاتصال الموثّق المحفوظ من مكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: 'stream:commentReceived' — كلمة دخول الفريق، والسحب بالشات.
 *  - الهدايا: 'stream:giftReceived' — هدايا التجميد/المضاعفة/الخطاف.
 *  - الهدايا المعروضة بالإعدادات = هدايا تيك توك الحقيقية المشتركة
 *    (assets/tiktok-gifts) + الإضافية بمجلد gift_icons حق روليت الإقصاء.
 *  - بطاقة اللاعب صاحب الإطار (اللوبي): TOW.frameCard() عبر AGP.playerCard.
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

    // تطبيع النص قبل المقارنة (نفس قواعد إكس أو / أسرع إجابة): التشكيل
    // والتطويل والرموز غير المرئية · أ إ آ ← ا · ة ← ه · ى ← ي · الأرقام
    // العربية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
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

    /**
     * قواعد الانضمام وتبديل الفريق (نفس XO.join): teams [{name, keyword, max, members}].
     * ترجع null لو الرسالة مو كلمة دخول، وإلا {k, cur, ok, toast}.
     */
    function join(teams, user, text, opts) {
        var t = norm(text);
        var k = -1;
        for (var i = 0; i < teams.length; i++) if (teams[i].keyword && norm(teams[i].keyword) === t) { k = i; break; }
        if (k < 0) return null;
        var cur = -1;
        for (var j = 0; j < teams.length; j++) if (teams[j].members.indexOf(user) >= 0) { cur = j; break; }
        if (opts && opts.followersOnly && !opts.isFollower) return { k: k, cur: cur, ok: false, toast: null };
        if (cur === k) return { k: k, cur: cur, ok: false, toast: null };
        if (teams[k].members.length >= teams[k].max) return { k: k, cur: cur, ok: false, toast: teams[k].name + ' ممتلئ' };
        return { k: k, cur: cur, ok: true, toast: cur >= 0 ? user + ' انتقل إلى ' + teams[k].name : null };
    }

    /* ============ الهدايا ============ */
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
    var GAME_DIR = (function () {
        var sc = document.currentScript;
        return sc && sc.src ? sc.src.replace(/tow-platform\.js(\?.*)?$/, '../elimination-roulette/') : '../elimination-roulette/';
    }());
    // أيقونة «جي جي» الخاصة بشد الحبل (حروف GG) — أيقونة روليت الإقصاء القديمة كانت مايك
    var OWN_DIR = (function () {
        var sc = document.currentScript;
        return sc && sc.src ? sc.src.replace(/tow-platform\.js(\?.*)?$/, '') : '';
    }());
    var EXTRA_GIFTS = [
        { id: 'gg', name: 'جي جي', coins: 1, file: 'gift_icons/gg.svg', own: true },
        { id: 'drama-queen', name: 'ملكة الدراما', coins: 5, file: 'gift_icons/drama-queen.svg' },
        { id: 'perfume', name: 'عطر', coins: 20, file: 'gift_icons/perfume.webp' },
        { id: 'little-crown', name: 'تاج صغير', coins: 99, file: 'gift_icons/little-crown.svg' },
        { id: 'hand-hearts', name: 'قلوب اليد', coins: 100, file: 'gift_icons/hand_hearts.webp' },
        { id: 'music-note', name: 'نغمة موسيقية', coins: 169, file: 'gift_icons/music-note.svg' },
        { id: 'sunglasses', name: 'نظارة شمسية', coins: 199, file: 'gift_icons/sunglasses.svg' },
        { id: 'money-gun', name: 'مسدس نقود', coins: 500, file: 'gift_icons/money-gun.svg' },
        { id: 'sports-car', name: 'سيارة رياضية', coins: 7000, file: 'gift_icons/sports-car.svg' },
        { id: 'tiktok-universe', name: 'كون تيك توك', coins: 44999, file: 'gift_icons/tiktok-universe.svg' }
    ];
    /** كل الهدايا المعتمدة [{id, name, coins, img}] مرتبة تصاعدياً بالكوينز. */
    var _gifts = null;
    function gifts() {
        if (_gifts) return _gifts;
        var G = AGP.tiktokGifts, out = [];
        if (G && G.list) G.list.forEach(function (g) { out.push({ id: g.id, name: g.label, coins: g.coins, img: G.iconUrl(g) }); });
        EXTRA_GIFTS.forEach(function (g) {
            if (!out.some(function (x) { return x.id === g.id; })) out.push({ id: g.id, name: g.name, coins: g.coins, img: (g.own ? OWN_DIR : GAME_DIR) + g.file });
        });
        out.sort(function (a, b) { return a.coins - b.coins; });
        return (_gifts = out);
    }
    function giftById(id) {
        var all = gifts();
        for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
        return null;
    }
    function giftKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    /**
     * هل الهدية القادمة من البث تطابق هدية الإعدادات (id)؟ بالاسم أولاً.
     * المطابقة بقيمة العملات (giftValue) احتياط فقط لو ما فيه اسم، لأن
     * هدايا اللعبة الثلاث ممكن تكون بنفس القيمة (1 عملة).
     */
    function giftMatches(giftId, giftName, giftValue) {
        if (!giftId) return false;
        var got = giftKey(giftName);
        if (got) {
            if (got === giftKey(giftId)) return true;
            var g0 = giftById(giftId);
            if (g0 && got === giftKey(g0.name)) return true;
            return (GIFT_NAMES[giftId] || []).some(function (n) { return giftKey(n) === got; });
        }
        var g = giftById(giftId), v = Number(giftValue);
        return !!(g && g.coins > 0 && v > 0 && g.coins === v);
    }

    /* ============ بطاقة اللاعب بإطاره (نفس XO.frameCard، بدون زر الإقصاء الداخلي) ============ */
    var FRAME_CARD_HEIGHT = 100;
    var FRAME_CARD_WIDTH_RATIO = 4.96;
    var _FrameCard = null;
    function frameCard(player) {
        var React = window.React;
        if (!React || !AGP.playerCard) return null;
        if (!_FrameCard) {
            _FrameCard = function (props) {
                var ref = React.useRef(null);
                var st = React.useState(0), w = st[0], setW = st[1];
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
                React.useEffect(function () {
                    if (!w || !ref.current) return;
                    var plates = ref.current.querySelectorAll('[data-agp-pcard-name="1"]');
                    for (var i = 0; i < plates.length; i++) {
                        var ph = plates[i].clientHeight;
                        if (ph) { plates[i].style.fontSize = Math.max(9, Math.min(13, Math.round(ph * 0.65))) + 'px'; plates[i].style.lineHeight = '1.2'; }
                    }
                    AGP.playerCard.fitAllNames(ref.current);
                });
                var p = props.player;
                var html = w ? AGP.playerCard.renderHtml(
                    { id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame },
                    { showFrame: true, basePath: '../../', size: Math.max(20, Math.floor(w / FRAME_CARD_WIDTH_RATIO)) }
                ) : '';
                return React.createElement('div', {
                    ref: ref,
                    style: { flex: 1, minWidth: 0, height: FRAME_CARD_HEIGHT, display: 'flex', justifyContent: 'center', alignItems: 'center', direction: 'ltr' }
                }, React.createElement('div', { style: { lineHeight: 0 }, dangerouslySetInnerHTML: { __html: html } }));
            };
        }
        return React.createElement(_FrameCard, { key: 'fc-' + player.name, player: player });
    }

    /** بطاقة الفوز المملوكة (js/agp-win-card.js) كعنصر React، أو null لو ما يملك. */
    function winCard(player, lines, key, width) {
        var React = window.React;
        if (!React || !AGP.winCard || !player || !AGP.winCard.canShow(player)) return null;
        return React.createElement('div', { key: key || 'wc', style: { width: width || 200, maxWidth: '100%', lineHeight: 0, animation: 'agpWinCardPop .55s cubic-bezier(.2,1.3,.4,1) both' }, dangerouslySetInnerHTML: { __html: AGP.winCard.renderHtml(player, lines, { pop: false }) } });
    }

    /* ============ البث ============ */
    var _connected = false;
    function connect() {
        var saved = getSavedConnection();
        if (_connected || !saved || !AGP.streamConnector) return false;
        _connected = true;
        AGP.streamConnector.connect('tiktok', { username: saved.username });
        return true;
    }
    function onComment(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:commentReceived', function (payload) {
            if (!payload || typeof payload.text !== 'string' || !payload.id) return;
            cb(payload);
        });
    }
    /** cb({id, name, count}) لكل دفعة تكبيسات (لايكات) — من الخادم مجمّعة كل ~300ms. */
    function onLike(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:likeReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    /**
     * التكبيس للعبة — مصدرين، وما ينحسب نفس التكبيس مرتين:
     *  1) لحظي: 'stream:likeReceived' (الخادم يرسله مجمّع كل 300ms — ws-server.js onLike).
     *  2) احتياط: لو الخادم ما يرسل التكبيسات (نسخة قديمة على Render)، نقرأ عدّاد
     *     تكبيسات كل لاعب من إحصائيات البث (GET /api/stream/session-stats?sections=likers:20،
     *     موجود من قبل) كل ثانية، وكل زيادة بعدّاد لاعب = تكبيسات جديدة له.
     *     أول ما يوصل تكبيس لحظي يوقف الاحتياط تلقائياً.
     * cb({id, name, count}). ترجع دالة الإيقاف.
     */
    var LIKES_POLL_MS = 1000;
    function watchLikes(cb) {
        var live = false, base = null, timer = null, inflight = false, stopped = false;
        var off = onLike(function (p) { live = true; if (timer) { clearInterval(timer); timer = null; } cb(p); });
        function poll() {
            if (live || inflight || stopped) return;
            var A = window.AGPAuth;
            if (!A || typeof A.request !== 'function') return;
            inflight = true;
            A.request('/api/stream/session-stats?sections=likers:20').then(function (d) {
                inflight = false;
                if (live || stopped || !d || !d.success || !d.stats || !d.stats.sections) return;
                var list = d.stats.sections.likers || [], next = {};
                list.forEach(function (r) { if (r && r.username) next[r.username] = Number(r.count) || 0; });
                if (base) list.forEach(function (r) {
                    if (!r || !r.username) return;
                    // مكبّس يطلع بالقائمة لأول مرة: تكبيساته كلها جديدة (اللعبة تتجاهل اللي قبل البداية)
                    var prev = base[r.username], delta = next[r.username] - (prev == null ? 0 : prev);
                    if (delta > 0) cb({ id: r.username, name: r.name, count: delta });
                });
                base = Object.assign(base || {}, next);
            }, function () { inflight = false; });
        }
        timer = setInterval(poll, LIKES_POLL_MS); poll();
        return function () { stopped = true; if (timer) clearInterval(timer); off(); };
    }

    /* ============ هندسة الملعب (مشتركة بين منطق المباراة والمشهد الثري دي) ============
     * كل لاعب له مكان ثابت على الحبل: slot(i, n) = بعده عن النص بالمتر (i ترتيبه
     * بفريقه، n أكبر عدد بالفريقين). الحبل يتحرك SHIFT متر لما pos = ±100.
     * اللاعب ينقصى لما الحبل يسحبه لين يتعدى خط النص: slot < |shift| بجهة الخصم. */
    var SHIFT = 3.2;
    // كل فريق صف واحد: مسافة 1.25م للعدد القليل، وما تقل عن 0.95م (عرض الشخصية مايلة) عشان ما يتراكبون
    function stepFor(n) { return Math.max(.95, Math.min(1.25, 9 / Math.max(1, n - 1))); }
    function slot(i, n) { return 1.15 + i * stepFor(n); }

    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:giftReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء، وهنا نربط كل اسم بـ id ثابت
     * من المنصة (tiktok:<username>) وصورته وإطاره. اسم مكرر لحساب مختلف ياخذ رقم.
     */
    function createRegistry(initial) {
        var byName = Object.assign({}, initial || {});
        var byId = {};
        Object.keys(byName).forEach(function (n) { if (byName[n] && byName[n].id) byId[byName[n].id] = n; });
        return {
            nameFor: function (payload) {
                if (byId[payload.id]) {
                    var known = byId[payload.id];
                    if (payload.avatarUrl && !byName[known].avatar) byName[known].avatar = payload.avatarUrl;
                    if (payload.frame) byName[known].frame = payload.frame;
                    if (payload.winCard !== undefined) byName[known].winCard = payload.winCard || null;
                    return known;
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null, winCard: payload.winCard || null };
                byId[payload.id] = name;
                return name;
            },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            player: function (name) {
                var p = byName[name] || {};
                return { id: p.id || name, name: name, avatarUrl: p.avatar || null, winCard: p.winCard || null };
            },
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    window.TOW = {
        libraryUrl: new URL('../../games.html', location.href).href, // نفس الدومين (مكتبة الألعاب)
        keys: { setup: 'tow-setup', roster: 'tow-roster', players: 'tow-players' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        join: join,
        gifts: gifts,
        giftById: giftById,
        giftMatches: giftMatches,
        frameCard: frameCard,
        winCard: winCard,
        connect: connect,
        onComment: onComment,
        onGift: onGift,
        onLike: onLike,
        watchLikes: watchLikes,
        SHIFT: SHIFT,
        TEAM_COLORS: ['#e8776a', '#5aaee6'], // ألوان الفريقين ثابتة: الأيسر أحمر والأيمن أزرق (درجات هادية)
        stepFor: stepFor,
        slot: slot,
        createRegistry: createRegistry
    };
}());
