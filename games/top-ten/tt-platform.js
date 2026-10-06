/**
 * خمّن العشرة — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * المباراة) منقولة من ملفات التصميم المعتمدة وتشتغل عبر support.js.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة (نفس نمط
 * games/russian-roulette/rr-platform.js):
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - بيانات اللاعبين (id/صورة/إطار) تُحفظ بـ 'topten-players' بجانب
 *    'topten-roster' (أسماء فقط، كما في عقد البيانات).
 *  - بطاقة اللاعب صاحب الإطار: TT.frameCard() عبر AGP.playerCard المشترك.
 *  - بنك الأسئلة: questions-bank.json (يُدار من admin-questions.html).
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

    // تطبيع النص (JOIN-RULES §1) — نفسه لكلمة الدخول ومطابقة الإجابات.
    function norm(s) {
        return String(s == null ? '' : s).trim()
            .replace(/[ً-ْـ]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .toLowerCase().replace(/\s+/g, ' ');
    }

    /** أدمن المنصة؟ (يظهر له رابط بنك الأسئلة — الحماية الفعلية داخل admin-questions.html). */
    function isAdmin() {
        try {
            var u = window.AGPAuth && typeof window.AGPAuth.getCachedUser === 'function' ? window.AGPAuth.getCachedUser() : null;
            return !!(u && u.role === 'admin');
        } catch (e) { return false; }
    }

    /**
     * بنك الأسئلة بصيغة اللعبة: [{ q, a: [[النص الظاهر, ...مرادفات] ×10] }]
     * مرتبة من 1 إلى 10. أي سؤال ما فيه 10 إجابات يُتجاهل.
     */
    function loadBank() {
        return fetch('questions-bank.json', { cache: 'no-store' })
            .then(function (res) { return res.ok ? res.json() : null; })
            .then(function (data) {
                var list = data && Array.isArray(data.questions) ? data.questions : [];
                return list.map(function (q) {
                    var answers = Array.isArray(q.answers) ? q.answers : [];
                    return {
                        q: String(q.prompt || '').trim(),
                        a: answers.slice(0, 10).map(function (ans) {
                            var text = String((ans && ans.text) || '').trim();
                            var aliases = Array.isArray(ans && ans.aliases) ? ans.aliases : [];
                            return [text].concat(aliases.map(function (x) { return String(x).trim(); }).filter(Boolean));
                        })
                    };
                }).filter(function (q) { return q.q && q.a.length === 10 && q.a.every(function (al) { return al[0]; }); });
            })
            .catch(function () { return []; });
    }

    /**
     * بطاقة لاعب بإطاره من المنصة (عنصر React يُمرَّر للقالب) — تُرسم عبر
     * AGP.playerCard.renderHtml(showFrame) المشترك مع باقي الألعاب، وتُصغَّر
     * لتملأ خانة اللوبي (3:1) بدون ما تطلع منها. onKick: زر الإقصاء × على
     * الطرف الداخلي للوح الاسم (يُقاس موضع اللوح بعد الرسم بكل إطار).
     * القياس بـ clientWidth/offset* (أبعاد التخطيط) لأن مسرح اللوبي نفسه
     * مُصغَّر بـ transform.
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
                var ref = React.useRef(null), cardRef = React.useRef(null);
                var st = React.useState(null), box = st[0], setBox = st[1];
                var xs = React.useState(null), xPos = xs[0], setXPos = xs[1];
                var hov = React.useState(false), hover = hov[0], setHover = hov[1];
                React.useLayoutEffect(function () {
                    var node = ref.current;
                    if (!node) return;
                    var measure = function () { setBox({ w: node.clientWidth, h: node.clientHeight }); };
                    measure();
                    if (!window.ResizeObserver) return;
                    var ro = new ResizeObserver(measure);
                    ro.observe(node);
                    return function () { ro.disconnect(); };
                }, []);
                React.useEffect(function () {
                    var root = cardRef.current;
                    if (!box || !root) return;
                    var plates = root.querySelectorAll('[data-agp-pcard-name="1"]');
                    for (var i = 0; i < plates.length; i++) {
                        var ph = plates[i].clientHeight;
                        if (ph) { plates[i].style.fontSize = Math.max(9, Math.min(14, Math.round(ph * 0.65))) + 'px'; plates[i].style.lineHeight = '1.2'; }
                        // مساحة × تُقتطع من عرض اللوح نفسه حتى الاسم ما يدخل تحت ×
                        if (props.onKick) { var pl = plates[i]; if (!pl.dataset.w) pl.dataset.w = pl.style.width; pl.style.width = 'calc(' + pl.dataset.w + ' - ' + X_SIZE + 'px)'; }
                    }
                    AGP.playerCard.fitAllNames(root);
                    if (props.onKick && plates[0]) {
                        var p0 = plates[0];
                        var next = { left: p0.offsetLeft + p0.offsetWidth, top: Math.round(p0.offsetTop + p0.offsetHeight / 2 - X_SIZE / 2) };
                        if (!xPos || xPos.left !== next.left || xPos.top !== next.top) setXPos(next);
                    }
                });
                var p = props.player, h = React.createElement;
                var size = box ? Math.max(20, Math.floor(box.w / FRAME_CARD_WIDTH_RATIO)) : 0;
                var html = box ? AGP.playerCard.renderHtml(
                    { id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame },
                    { showFrame: true, basePath: '../../', size: size }
                ) : '';
                var scale = box ? Math.min(1, box.h / FRAME_CARD_HEIGHT, box.w / Math.max(1, size * FRAME_CARD_WIDTH_RATIO)) : 1;
                var kick = props.onKick && xPos ? h('button', {
                    key: 'x', type: 'button', 'aria-label': 'إقصاء ' + p.name, onClick: props.onKick,
                    onMouseEnter: function () { setHover(true); }, onMouseLeave: function () { setHover(false); },
                    style: { position: 'absolute', top: xPos.top, left: xPos.left, zIndex: 10, width: X_SIZE, height: X_SIZE, border: 'none', background: 'transparent', padding: 0,
                        color: '#fca5a5', cursor: 'pointer', display: 'grid', placeItems: 'center', opacity: hover ? 1 : 0.85,
                        transform: hover ? 'scale(1.15)' : 'none', transition: 'opacity .2s, transform .2s', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.9))' }
                }, h('svg', { width: 14, height: 14, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 3, strokeLinecap: 'round', 'aria-hidden': true },
                    h('line', { x1: 6, y1: 6, x2: 18, y2: 18 }), h('line', { x1: 18, y1: 6, x2: 6, y2: 18 }))) : null;
                return h('div', {
                    ref: ref, dir: 'ltr',
                    style: { position: 'absolute', inset: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'visible' }
                }, h('div', { ref: cardRef, style: { position: 'relative', lineHeight: 0, flexShrink: 0, transform: 'scale(' + scale + ')', transformOrigin: 'center' } }, [
                    h('div', { key: 'card', dangerouslySetInnerHTML: { __html: html } }),
                    kick
                ]));
            };
        }
        return React.createElement(_FrameCard, { key: 'fc-' + player.name, player: player, onKick: onKick });
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

    /**
     * سجل اللاعبين: الشاشات تتعامل بالأسماء (كما في التصميم)، وهنا نربط كل
     * اسم بـ id ثابت من المنصة (tiktok:<username>) وصورته وإطاره. لو تكرر
     * اسم العرض لحسابين مختلفين يُضاف رقم للاسم الثاني حتى يبقى كل اسم فريداً.
     */
    function createRegistry(initial) {
        var byName = Object.assign({}, initial || {});
        var byId = {};
        Object.keys(byName).forEach(function (n) { if (byName[n] && byName[n].id) byId[byName[n].id] = n; });
        return {
            nameFor: function (payload) {
                if (byId[payload.id]) {
                    var known = byName[byId[payload.id]];
                    if (payload.avatarUrl) known.avatar = payload.avatarUrl;
                    if (payload.frame !== undefined) known.frame = payload.frame || null;
                    return byId[payload.id];
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null };
                byId[payload.id] = name;
                return name;
            },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            // اللاعب بصيغة AGP ({id, name}) — لنقاط المنصة
            player: function (name) {
                var p = byName[name] || {};
                return { id: p.id || name, name: name };
            },
            // لاعب عنده إطار مفعّل من المنصة → بيانات بطاقته، وإلا null
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    window.TT = {
        libraryUrl: 'https://aymngames.online/',
        keys: { setup: 'topten-settings', roster: 'topten-roster', players: 'topten-players' },
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        isAdmin: isAdmin,
        loadBank: loadBank,
        frameCard: frameCard,
        connect: connect,
        onComment: onComment,
        createRegistry: createRegistry
    };
}());
