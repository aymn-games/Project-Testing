/**
 * إكس أو — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * اللعبة) منقولة من ملفات التصميم المعتمدة كما هي وتشتغل عبر support.js.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة:
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - الهدايا (الرجوع عن طريق الدعم): الحدث 'stream:giftReceived'.
 *  - بيانات اللاعبين (id/صورة/إطار) تُحفظ بـ 'xo-players' بجانب 'xo-roster'
 *    (أسماء فقط، كما في عقد البيانات بملف التصميم).
 *  - قواعد الانضمام (JOIN-RULES.md بملف التسليم): XO.join() وحدة مشتركة
 *    يستخدمها اللوبي ونافذة "دخول لاعبين جدد" داخل المباراة.
 *  - بطاقة اللاعب صاحب الإطار: XO.frameCard() عبر AGP.playerCard المشترك.
 * يحتاج تحميل ملفات js/agp-*.js + الأدابتر + auth/auth-client.js +
 * js/agp-player-card.js قبله.
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

    // تطبيع النص قبل المقارنة — كلمة الدخول ورقم المربع بالشات.
    // نفس قواعد أسرع إجابة (نسخة موسَّعة من norm() في JOIN-RULES.md — تشمل كل حالاتها):
    // التشكيل والتطويل والرموز غير المرئية والترقيم · أ إ آ ٱ ← ا · ة ← ه · ى ← ي · ؤ ← و · ئ ← ي · حذف ء
    // الحروف الفارسية (ی ک ہ) · الأرقام العربية والفارسية · "ال" أول كل كلمة · المسافات · تكرار الحرف.
    function norm(s) {
        return String(s == null ? '' : s).normalize('NFKC').trim()
            .replace(/[ً-ٰٟۖ-ۭـ]/g, '').replace(/[​-‏‪-‮⁦-⁩﻿]/g, '')
            .replace(/[أإآٱٲٳ]/g, 'ا').replace(/[ةۃہە]/g, 'ه')
            .replace(/[ىیېۍ]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك')
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '')
            .split(/\s+/).map(function (w) { return w.replace(/^ال/, ''); }).join('')
            .replace(/(\p{L})\1+/gu, '$1');
    }

    /**
     * قواعد الانضمام وتبديل الفريق (JOIN-RULES.md §1–2) لكل شاشات الدخول.
     * teams: [{name, keyword, max, members:[أسماء]}] — members هي العضوية
     * الفعلية الحالية (في نافذة المباراة تشمل المنضمين المعلّقين).
     * ترجع null لو الرسالة مو كلمة دخول، وإلا {k, cur, ok, toast}:
     * k فريق الكلمة، cur فريق اللاعب الحالي (-1 لو جديد)، ok هل يُنفَّذ.
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

    /**
     * بطاقة لاعب بإطاره من المنصة (عنصر React يُمرَّر للقالب) — تُرسم عبر
     * AGP.playerCard.renderHtml(showFrame) المشترك مع باقي الألعاب، ويُحسب
     * حجمها من عرض الخانة الفعلي حتى تتوافق مع شبكة بطاقات اللعبة.
     * onKick (اختياري): زر الإقصاء × داخل حدود الإطار نفسه، بنفس مواصفات
     * × في JOIN-RULES.md §4، على الطرف الداخلي للوح الاسم (يُقاس موضع اللوح
     * بعد الرسم بكل إطار) مع مسافة للاسم حتى ما يتداخل معه.
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
                // حجم خط الاسم يتبع ارتفاع لوح الاسم بكل إطار (بطاقات إكس أو أصغر من
                // باقي الألعاب، فالخط الموروث يطلع أكبر من اللوح وينقص/يرتفع الاسم)،
                // ثم الأسماء الطويلة تتحرك داخل اللوح (fitAllNames).
                React.useEffect(function () {
                    if (!w || !ref.current) return;
                    var plates = ref.current.querySelectorAll('[data-agp-pcard-name="1"]');
                    for (var i = 0; i < plates.length; i++) {
                        var ph = plates[i].clientHeight;
                        if (ph) { plates[i].style.fontSize = Math.max(9, Math.min(13, Math.round(ph * 0.65))) + 'px'; plates[i].style.lineHeight = '1.2'; }
                        // مساحة × تُقتطع من عرض اللوح نفسه (مو padding) حتى الاسم وحركته ما يدخلون تحت ×
                        if (props.onKick) { var pl = plates[i]; if (!pl.dataset.w) pl.dataset.w = pl.style.width; pl.style.width = 'calc(' + pl.dataset.w + ' - ' + X_SIZE + 'px)'; }
                    }
                    AGP.playerCard.fitAllNames(ref.current);
                    // × على الطرف الداخلي (يمين، داخل صندوق LTR) للوح الاسم، بمنتصفه عمودياً
                    if (props.onKick && plates[0] && boxRef.current) {
                        var b = boxRef.current.getBoundingClientRect(), r = plates[0].getBoundingClientRect();
                        var next = { left: Math.round(r.right - b.left), top: Math.round(r.top - b.top + r.height / 2 - X_SIZE / 2) };
                        if (!xPos || xPos.left !== next.left || xPos.top !== next.top) setXPos(next);
                    }
                });
                var p = props.player;
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
                    style: { flex: 1, minWidth: 0, height: FRAME_CARD_HEIGHT, display: 'flex', justifyContent: 'center', alignItems: 'center', direction: 'ltr' }
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
    /**
     * بطاقة الإقصاء المملوكة (js/agp-elim-card.js) كعنصر React — تظهر بدل
     * نافذة الإقصاء العادية فقط لو المُقصي (فائز الجولة) يملك بطاقة مفعّلة.
     * actor/target: {name, avatarUrl, elimCard}. ترجع null لو ما يملك بطاقة.
     */
    function elimCard(actor, target, key) {
        var React = window.React;
        if (!React || !AGP.elimCard || !actor || !AGP.elimCard.canShow(actor)) return null;
        return React.createElement('div', { key: key || 'ec', style: { width: '100%', lineHeight: 0 }, dangerouslySetInnerHTML: { __html: AGP.elimCard.renderHtml(actor, target) } });
    }
    function hasElimCard(actor) {
        return !!(actor && AGP.elimCard && AGP.elimCard.canShow(actor));
    }

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

    // هدايا قائمة الإعدادات (GIFTS في index.html) ← اسم الهدية كما يرسله تيك توك (giftName).
    var GIFT_NAMES = {
        rose: ['Rose'], tiktok: ['TikTok'], icecream: ['Ice Cream Cone', 'Ice Cream'],
        fingerheart: ['Finger Heart'], perfume: ['Perfume'], doughnut: ['Doughnut'],
        cap: ['Cap'], handhearts: ['Hand Hearts'], corgi: ['Corgi'],
        moneygun: ['Money Gun'], galaxy: ['Galaxy'], jet: ['Private Jet'],
        car: ['Sports Car'], lion: ['Lion'], universe: ['TikTok Universe', 'Universe']
    };
    function giftKey(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, ''); }
    /**
     * هل الهدية القادمة من البث تطابق هدية الإعدادات (id)؟ بالاسم، أو بقيمة
     * العملات (giftValue من تيك توك = coins هدية الإعدادات) لأن أسماء تيك توك
     * الإنجليزية ما تطابق دائماً الأسماء المحفوظة هنا.
     */
    function giftMatches(giftId, giftName, giftValue, coins) {
        var got = giftKey(giftName);
        if (got && got === giftKey(giftId)) return true;
        if (got && (GIFT_NAMES[giftId] || []).some(function (n) { return giftKey(n) === got; })) return true;
        var c = Number(coins), v = Number(giftValue);
        return c > 0 && v > 0 && c === v;
    }

    /** cb(payload) لكل هدية من البث ({id, name, giftName, ...}). ترجع دالة لإلغاء الاستماع. */
    function onGift(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:giftReceived', function (payload) {
            if (!payload || !payload.id) return;
            cb(payload);
        });
    }

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء (كما في التصميم)، وهنا نربط كل
     * اسم بـ id ثابت من المنصة (tiktok:<username>) وصورته. لو تكرر اسم
     * العرض لحسابين مختلفين يُضاف رقم للاسم الثاني حتى يبقى كل اسم فريداً.
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
                    if (payload.elimCard !== undefined) byName[known].elimCard = payload.elimCard || null;
                    if (payload.winCard !== undefined) byName[known].winCard = payload.winCard || null;
                    return known;
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null, elimCard: payload.elimCard || null, winCard: payload.winCard || null };
                byId[payload.id] = name;
                return name;
            },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            // اللاعب بصيغة AGP ({id, name, avatarUrl, elimCard, winCard}) — لبطاقتي الإقصاء والفوز
            player: function (name) {
                var p = byName[name] || {};
                return { id: p.id || name, name: name, avatarUrl: p.avatar || null, elimCard: p.elimCard || null, winCard: p.winCard || null };
            },
            // لاعب عنده إطار مفعّل من المنصة → بيانات بطاقته، وإلا null
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    window.XO = {
        libraryUrl: 'https://aymngames.online/',
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        join: join,
        frameCard: frameCard,
        elimCard: elimCard,
        hasElimCard: hasElimCard,
        winCard: winCard,
        hasWinCard: hasWinCard,
        connect: connect,
        onComment: onComment,
        onGift: onGift,
        giftMatches: giftMatches,
        createRegistry: createRegistry
    };
}());
