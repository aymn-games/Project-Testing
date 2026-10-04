/**
 * أسرع إجابة — ربط شاشات اللعبة (.dc.html) بالمنصة.
 *
 * الشاشات الثلاث (index.html الإعدادات، lobby.html اللوبي، game.html
 * اللعبة) منقولة من ملفات التصميم المعتمدة كما هي وتشتغل عبر support.js.
 * هذا الملف هو طبقة الربط الوحيدة بينها وبين المنصة:
 *  - حالة الاتصال بالبث: من الاتصال الموثّق المحفوظ بمكتبة الألعاب
 *    (games.html → localStorage 'agp:agp-stream-connection').
 *  - الشات: AGP.streamConnector + adapters/agp-tiktok-adapter.js
 *    (الحدث 'stream:commentReceived').
 *  - بيانات اللاعبين (id/صورة/إطار) تُحفظ بـ 'fa-players' بجانب 'fa-roster'
 *    (أسماء فقط، كما في عقد البيانات بملف التصميم).
 *  - قواعد الانضمام (JOIN-RULES.md بملف التسليم): FA.join() وحدة مشتركة
 *    يستخدمها اللوبي ونافذة "دخول لاعبين جدد" داخل المباراة.
 *  - بطاقة اللاعب صاحب الإطار: FA.frameCard() عبر AGP.playerCard المشترك.
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

    // تطبيع كلمة الدخول — نفس norm() في JOIN-RULES.md حرفياً.
    function norm(s) {
        return String(s == null ? '' : s).trim()
            .replace(/[ً-ْـ]/g, '')
            .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
            .toLowerCase().replace(/\s+/g, ' ');
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
     */
    var FRAME_CARD_HEIGHT = 100; // نفس LOBBY_CARD_HEIGHT_PX في js/agp-player-card.js
    var FRAME_CARD_WIDTH_RATIO = 4.96; // عرض البطاقة ≈ 4.95 × حجم الصورة (basicCardTotalWidth)
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
                React.useEffect(function () { if (w && ref.current) AGP.playerCard.fitAllNames(ref.current); });
                var p = props.player;
                var html = w ? AGP.playerCard.renderHtml(
                    { id: p.id, name: p.name, avatarUrl: p.avatar || null, frame: p.frame },
                    { showFrame: true, basePath: '../../', size: Math.max(20, Math.floor(w / FRAME_CARD_WIDTH_RATIO)) }
                ) : '';
                return React.createElement('div', {
                    ref: ref,
                    style: { flex: 1, minWidth: 0, height: FRAME_CARD_HEIGHT, display: 'flex', justifyContent: 'center', alignItems: 'center', direction: 'ltr' },
                    dangerouslySetInnerHTML: { __html: html }
                });
            };
        }
        return React.createElement(_FrameCard, { key: 'fc-' + player.name, player: player });
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
                    return known;
                }
                var base = String(payload.name || payload.id).trim() || String(payload.id);
                var name = base, k = 2;
                while (byName[name]) name = base + ' ' + (k++);
                byName[name] = { id: payload.id, avatar: payload.avatarUrl || null, frame: payload.frame || null };
                byId[payload.id] = name;
                return name;
            },
            avatar: function (name) { return (byName[name] && byName[name].avatar) || null; },
            id: function (name) { return (byName[name] && byName[name].id) || null; },
            // لاعب عنده إطار مفعّل من المنصة → بيانات بطاقته، وإلا null
            framed: function (name) {
                var p = byName[name];
                return p && p.frame && p.frame.imageFilename ? { name: name, id: p.id, avatar: p.avatar, frame: p.frame } : null;
            },
            all: function () { return byName; }
        };
    }

    window.FA = {
        libraryUrl: 'https://aymngames.online/',
        readJSON: readJSON,
        writeJSON: writeJSON,
        getSavedConnection: getSavedConnection,
        norm: norm,
        join: join,
        frameCard: frameCard,
        connect: connect,
        onComment: onComment,
        createRegistry: createRegistry
    };
}());
