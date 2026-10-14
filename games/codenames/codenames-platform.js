/**
 * كود نيمز — ربط شاشات اللعبة (.html بصيغة dc) بالمنصة.
 *
 * الشاشات (index.html الإعدادات، lobby.html اللوبي، game.html اللعبة،
 * spymaster.html جوال السباي ماستر) منقولة من ملفات التصميم المعتمدة
 * (handoff-codenames) كما هي وتشتغل عبر support.js — نفس نمط games/xo.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة:
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived')، وحالة الاتصال 'stream:statusChanged'.
 *  - بيانات اللاعبين (id/صورة/إطار) تُحفظ بـ 'codenames-players' بجانب
 *    'codenames-roster' (أسماء فقط، كما في عقد البيانات بملف التصميم).
 *  - قواعد الانضمام (JOIN-RULES.md): CN.join() وحدة مشتركة يستخدمها
 *    اللوبي ونافذة "دخول اللاعبين الجدد" داخل المباراة.
 *  - قناة السباي ماستر: CN.relay() عبر backend/websocket/room-relay-server.js.
 * يحتاج تحميل ملفات js/agp-*.js + الأدابتر + auth/auth-client.js +
 * js/agp-player-card.js قبله.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform || {};
    var STREAM_CONNECTION_STORAGE_KEY = 'agp:agp-stream-connection';
    var ROOM_RELAY_WS_URL = 'wss://project-testing-akds.onrender.com/ws/room-relay';

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

    // تطبيع النص (JOIN-RULES.md §1) — كلمة الدخول وأوامر الشات داخل اللعبة.
    function norm(s) {
        // الأرقام العربية/الفارسية = نفس الإنجليزية
        return String(s == null ? '' : s).trim()
            .replace(/[٠-٩]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); })
            .replace(/[۰-۹]/g, function (d) { return String(d.charCodeAt(0) - 0x06F0); })
            .replace(/[\u064B-\u0652\u0640]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .toLowerCase().replace(/\s+/g, ' ');
    }

    /**
     * قواعد الانضمام وتبديل الفريق (JOIN-RULES.md §1) لكل شاشات الدخول.
     * teams: [{name, keyword, members:[أسماء]}]. ترجع null لو الرسالة مو
     * كلمة دخول، وإلا {k, cur, ok}: k فريق الكلمة، cur فريق اللاعب الحالي
     * (-1 لو جديد)، ok هل يُنفَّذ. opts.blocked: أسماء ممنوعة من الدخول
     * (داخل المباراة: كل من كان بالمباراة قبل).
     */
    function join(teams, user, text, opts) {
        var t = norm(text);
        var k = -1;
        for (var i = 0; i < teams.length; i++) if (norm(teams[i].keyword) && norm(teams[i].keyword) === t) { k = i; break; }
        if (k < 0) return null;
        var cur = -1;
        for (var j = 0; j < teams.length; j++) if ((teams[j].members || []).indexOf(user) >= 0) { cur = j; break; }
        if (opts && opts.followersOnly && !opts.isFollower) return { k: k, cur: cur, ok: false };
        if (opts && opts.blocked && opts.blocked.indexOf(user) >= 0) return { k: k, cur: cur, ok: false };
        if (cur === k) return { k: k, cur: cur, ok: false };
        return { k: k, cur: cur, ok: true };
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
     * بطاقة الفوز المملوكة (js/agp-win-card.js) كعنصر React — تحل محل بطاقة
     * الفائز العادية بنفس مكانها بشاشة الفوز، فقط لو الفائز يملك بطاقة مفعّلة.
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

    /** cb(status) لكل تغيّر بحالة الاتصال بالبث ('connected' | 'connecting' | ...). */
    function onStatus(cb) {
        if (!AGP.events || typeof AGP.events.on !== 'function') return function () {};
        return AGP.events.on('stream:statusChanged', function (payload) {
            cb(payload && payload.status ? payload.status : payload);
        });
    }

    /**
     * قناة السباي ماستر (README §6) عبر room-relay-server: أول رسالة
     * {type:'join', room} تستهلكها القناة نفسها، وبعدها كل رسالة تُبث لبقية
     * المنضمين لنفس الغرفة. onMessage(msg) لكل رسالة واردة، onState(ok) لما
     * يتغير الاتصال. يعيد الاتصال تلقائياً لو انقطع. ترجع {send, close}.
     */
    function relay(room, onMessage, onState) {
        var ws = null, closed = false, retry = null, queue = [];
        function open() {
            if (closed || typeof WebSocket === 'undefined') { if (onState) onState(false); return; }
            try { ws = new WebSocket(ROOM_RELAY_WS_URL); } catch (e) { schedule(); return; }
            ws.onopen = function () {
                ws.send(JSON.stringify({ type: 'join', room: room }));
                if (onState) onState(true);
                var q = queue; queue = [];
                q.forEach(send);
            };
            ws.onmessage = function (ev) {
                var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
                if (m && m.room === room) onMessage(m);
            };
            ws.onclose = function () { ws = null; if (!closed) { if (onState) onState(false); schedule(); } };
            ws.onerror = function () {};
        }
        function schedule() { clearTimeout(retry); retry = setTimeout(open, 3000); }
        function send(msg) {
            var obj = Object.assign({ room: room }, msg);
            if (ws && ws.readyState === 1) { try { ws.send(JSON.stringify(obj)); } catch (e) {} }
            else if (queue.length < 20) queue.push(msg);
        }
        open();
        return {
            send: send,
            isOpen: function () { return !!(ws && ws.readyState === 1); },
            // إعادة اتصال فورية (مثلاً لما يرجع الجوال من تطبيق تيك توك والاتصال القديم ميت)
            reconnect: function () {
                if (closed) return;
                clearTimeout(retry);
                var old = ws; ws = null;
                if (old) { old.onclose = null; old.onmessage = null; try { old.close(); } catch (e) {} }
                open();
            },
            close: function () { closed = true; clearTimeout(retry); try { ws && ws.close(); } catch (e) {} }
        };
    }

    /**
     * تشفير لوحة الألوان لكل جوال سباي ماستر مقبول (README §6: الكلمات
     * الملونة توصل للمقبول فقط). القناة تبث كل رسالة لكل من بالغرفة، فكل
     * جوال يولّد مفتاح ECDH ويرسل الجزء العام مع طلبه، واللعبة تشفّر اللوحة
     * لكل جوال مقبول بمفتاح AES-GCM مشترك بينهما فقط — أي أحد ثاني بالغرفة
     * يستلم بيانات مشفّرة ما يقدر يفتحها. يحتاج صفحة https (crypto.subtle).
     */
    var ECDH = { name: 'ECDH', namedCurve: 'P-256' };
    function b64(buf) { var s = '', a = new Uint8Array(buf); for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]); return btoa(s); }
    function unb64(str) { var s = atob(str), a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
    var secure = {
        supported: function () { return !!(window.crypto && window.crypto.subtle); },
        /** زوج مفاتيح جديد → {priv, pub} بصيغة JWK (يُحفظ بالجوال). */
        newPair: function () {
            var subtle = window.crypto.subtle;
            return subtle.generateKey(ECDH, true, ['deriveKey']).then(function (kp) {
                return Promise.all([subtle.exportKey('jwk', kp.privateKey), subtle.exportKey('jwk', kp.publicKey)]);
            }).then(function (r) { return { priv: r[0], pub: { kty: r[1].kty, crv: r[1].crv, x: r[1].x, y: r[1].y } }; });
        },
        /** مفتاح AES مشترك من مفتاحي الخاص (JWK) والمفتاح العام للطرف الثاني (JWK). */
        shared: function (privJwk, peerPubJwk) {
            var subtle = window.crypto.subtle;
            return Promise.all([
                subtle.importKey('jwk', privJwk, ECDH, false, ['deriveKey']),
                subtle.importKey('jwk', { kty: peerPubJwk.kty, crv: peerPubJwk.crv, x: peerPubJwk.x, y: peerPubJwk.y }, ECDH, false, [])
            ]).then(function (k) {
                return subtle.deriveKey({ name: 'ECDH', public: k[1] }, k[0], { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
            });
        },
        /** مفتاح AES عشوائي (base64) — مفتاح خانة سباي ماستر مرتبطة بحسابه (يُحفظ بالخادم لصاحب الخانة فقط). */
        randomKey: function () { return b64(window.crypto.getRandomValues(new Uint8Array(32))); },
        aesFromB64: function (keyB64) {
            return window.crypto.subtle.importKey('raw', unb64(keyB64), { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
        },
        encrypt: function (aesKey, obj) {
            var iv = window.crypto.getRandomValues(new Uint8Array(12));
            return window.crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, aesKey, new TextEncoder().encode(JSON.stringify(obj)))
                .then(function (ct) { return { iv: b64(iv), ct: b64(ct) }; });
        },
        decrypt: function (aesKey, iv, ct) {
            return window.crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, aesKey, unb64(ct))
                .then(function (pt) { return JSON.parse(new TextDecoder().decode(pt)); });
        }
    };

    /**
     * باركود خاص لكل سباي ماستر مرتبط بحسابه (backend/codenames/spy-slots-service.js).
     * يحتاج auth/auth-client.js (AGPAuth). ترجع Promise بالرد أو null لو ما فيه جلسة/اتصال.
     */
    function api(path, body) {
        var A = window.AGPAuth;
        if (!A || typeof A.request !== 'function' || !A.getToken || !A.getToken()) return Promise.resolve(null);
        return A.request(path, { method: 'POST', body: body }).catch(function () { return null; });
    }
    var spySlots = {
        /** شاشة اللعب: تسجيل خانات الغرفة [{id, team, tiktok, name, key}]. */
        register: function (room, slots) { return api('/api/codenames/spy-slots', { room: room, slots: slots }); },
        /** الجوال: طلب مفتاح خانته — {success, team, name, key} أو {success:false, error:'not_owner'|'slot_not_found', name}. */
        claim: function (room, slot) { return api('/api/codenames/spy-claim', { room: room, slot: slot }); },
        loggedIn: function () { var A = window.AGPAuth; return !!(A && A.getToken && A.getToken()); }
    };

    /** باركود (نفس طريقة اللعبة السابقة: مكتبة qrcodejs) كـ data URL لعنصر img. */
    var _qrCache = {};
    function qrDataUrl(text, size) {
        var k = size + '|' + text;
        if (_qrCache[k]) return _qrCache[k];
        if (!window.QRCode) return '';
        var box = document.createElement('div');
        try { new window.QRCode(box, { text: text, width: size, height: size, colorDark: '#0F1117', colorLight: '#ffffff' }); } catch (e) { return ''; }
        var c = box.querySelector('canvas');
        var url = c && c.toDataURL ? c.toDataURL('image/png') : ((box.querySelector('img') || {}).src || '');
        if (url) _qrCache[k] = url;
        return url;
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

    window.CN = {
        libraryUrl: 'https://aymngames.online/games.html',
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        join: join,
        frameCard: frameCard,
        winCard: winCard,
        hasWinCard: hasWinCard,
        connect: connect,
        onComment: onComment,
        onStatus: onStatus,
        relay: relay,
        secure: secure,
        spySlots: spySlots,
        qrDataUrl: qrDataUrl,
        createRegistry: createRegistry
    };
}());
