/**
 * ألعاب أيمن — صفحة «العب ضد ستريمر» (challenge.html) بالتصميم الجديد.
 * المنطق نفسه من الصفحة القديمة: قائمة ألعاب البثين، المباراة الجارية،
 * الدعوة الشغّالة، صندوق الدعوات (js/agp-challenge-inbox.js) والتحديث كل 5 ثواني.
 * تغيّر الرسم بس (بطاقات المكتبة وأقسام التصميم الجديد).
 */
(function () {
    'use strict';
    var A = window.AGPAuth;
    var POLL_MS = 5000;

    // ألعاب البثين — كل لعبة: صفحة إعداداتها (الدعوة والتجهيز) وشاشة مباراتها.
    var GAMES = [
        { id: 'penalty', name: 'بلنتي', icon: '⚽', hue: '#22c55e', cat: 'تحديات', isNew: true, page: 'games/penalty/index.html', match: 'games/penalty/game.html',
          desc: 'كل جمهور يسدد على مرماه بكتابة رقم الزاوية بشات بثه، والحارس يرتمي لزاوية عشوائية. 3 جولات والفائز بجولتين.',
          facts: ['3 جولات', '25 لاعب لكل فريق', 'الجولة 3–5 دقائق'] },
        { id: 'fastest-answer', name: 'أسرع إجابة', icon: '⚡', hue: '#3b82f6', cat: 'أسئلة وكلمات', page: 'games/fastest-answer/versus.html', match: 'games/fastest-answer/challenge.html',
          desc: 'كل جولة لاعب من كل بث وسؤال سريع، وأول إجابة صحيحة تكسب فريقها نقطتين. أول فريق يوصل نقاط الفوز يكسب.',
          facts: ['كل ستريمر يختار فئاته', '25 لاعب لكل فريق', 'نقاط الفوز تحددها'] },
        { id: 'xo', name: 'إكس أو', icon: '❌', cat: 'تحديات', soon: true },
        { id: 'team-war', name: 'حرب الفريقين', icon: '⚔️', cat: 'تحديات', soon: true }
    ];

    function $(id) { return document.getElementById(id); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function gameById(id) { return GAMES.filter(function (g) { return g.id === id; })[0]; }
    function section(num, title, body, opts) {
        opts = opts || {};
        return '<section class="vs-sec' + (opts.hot ? ' hot' : '') + '"><div class="vs-sec-h"><span class="num">' + num + '</span><span class="vs-sec-t">' + title + '</span></div>' + body + '</section>';
    }
    function row(label, control) {
        return '<div class="vs-row"><span class="vs-row-l">' + label + '</span>' + control + '</div>';
    }

    var ICON = { penalty: 'sports_soccer', 'fastest-answer': 'bolt', xo: 'grid_3x3', 'team-war': 'swords' };
    var HUE = { 'تحديات': 150, 'أسئلة وكلمات': 255 };
    var FACT_ICON = ['sports_score', 'groups', 'timer'];
    function renderGames() {
        var live = GAMES.filter(function (g) { return !g.soon; }).length;
        if ($('vs-n')) $('vs-n').textContent = live;
        $('vs-grid').innerHTML = GAMES.map(function (g, i) {
            var n = i + 1, ic = ICON[g.id] || 'sports_esports';
            return '<article class="gl-card' + (g.soon ? ' soon' : '') + '" style="--i:' + i + ';--cat-hue:' + (HUE[g.cat] || 150) + '">' +
                '<span class="gl-glow"></span><span class="gl-bgicon gl-ms" aria-hidden="true">' + ic + '</span>' +
                '<div class="gl-top"><span class="gl-tile"><span class="gl-ms" aria-hidden="true">' + ic + '</span></span><span class="gl-num" dir="ltr">' + (n < 10 ? '0' : '') + n + '</span></div>' +
                '<div class="gl-meta"><span class="gl-cat">' + esc(g.cat) + '</span>' + (g.soon ? '<span class="gl-badge">قريبا</span>' : g.isNew ? '<span class="gl-badge">جديد</span>' : '') + '</div>' +
                '<h3 class="gl-title">' + esc(g.name) + '</h3><p class="gl-desc">' + esc(g.desc || 'قريبا بين البثين') + '</p>' +
                (g.facts ? '<div class="gl-info">' + g.facts.map(function (f, k) { return '<span><span class="gl-ms" aria-hidden="true">' + FACT_ICON[k % 3] + '</span>' + esc(f) + '</span>'; }).join('') + '</div>' : '') +
                (g.soon ? '<span class="gl-play" aria-disabled="true">قريبا<span class="gl-ms" aria-hidden="true">schedule</span></span>'
                        : '<a class="gl-play" href="' + g.page + '">العب الآن<span class="gl-ms" aria-hidden="true">arrow_back</span></a>') +
                '</article>';
        }).join('');
        $('vs-grid').addEventListener('pointermove', function (e) {
            var c = e.target.closest('.gl-card'); if (!c) return;
            var r = c.getBoundingClientRect();
            c.style.setProperty('--x', (e.clientX - r.left) + 'px'); c.style.setProperty('--y', (e.clientY - r.top) + 'px');
        });
    }

    /* ---- فوق البطاقات: منع الدخول / مباراة جارية / دعوة شغّالة ---- */
    var gate = null, lastTop = null;
    function renderTop(r) {
        var html = '';
        if (gate) html += section('!', 'تنبيه', row(gate.text, '<a class="btn btn-primary btn-sm" href="' + gate.href + '">' + gate.btn + '</a>'), { hot: true });
        if (r && r.activeMatch) {
            var g = gameById(r.activeMatch.game);
            html += section('●', 'مباراة جارية', row('عندك مباراة ' + esc(g ? g.name : '') + ' شغّالة الحين', '<a class="btn btn-primary btn-sm vs-ok" href="' + (g ? g.match : 'games.html') + '?match=' + encodeURIComponent(r.activeMatch.id) + '">ادخل المباراة</a>'), { hot: true });
        } else if (r) {
            var open = function (inv) { return inv && (inv.status === 'pending' || inv.status === 'setup' || inv.status === 'ready'); };
            var o = open(r.outgoing) ? r.outgoing : open(r.joined) && r.joined.status !== 'pending' ? r.joined : null;
            if (o) {
                var og = gameById(o.game), mine = o === r.outgoing;
                var text = mine ? (o.status === 'ready' ? o.other.name + ' جاهز ✓ — ادخل اللوبي' : o.status === 'setup' ? o.other.name + ' قبل ويجهّز فريقه' : 'بانتظار رد ' + o.other.name)
                    : (o.status === 'ready' ? 'أنت جاهز — بانتظار ' + o.other.name + ' يدخل اللوبي' : 'قبلت تحدي ' + o.other.name + ' — جهّز فريقك');
                html += section('↗', 'تحدي ' + esc(og ? og.name : ''), row(esc(text), '<a class="btn btn-primary btn-sm" href="' + (og ? og.page : '#') + '">افتح</a>'));
            }
        }
        if (html !== lastTop) { lastTop = html; $('top-grid').innerHTML = html; }
    }

    var polling = false;
    function poll() {
        if (polling || gate) return;
        polling = true;
        A.challengeInbox().then(function (r) {
            polling = false;
            if (!r || !r.success) { if (r && r.__httpStatus === 401) setGate('login'); return; }
            if (!r.eligible) { setGate('link'); return; }
            renderTop(r);
        }).catch(function () { polling = false; });
    }

    function setGate(kind) {
        gate = kind === 'login'
            ? { text: 'سجّل دخول بحساب ستريمر مربوط بتيك توك عشان تلعب ضد ستريمر', href: 'login.html?next=challenge.html', btn: 'تسجيل الدخول' }
            : { text: 'اللعب ضد ستريمر لحسابات الستريمر المربوطة بتيك توك. اربط حسابك من صفحة حسابي.', href: 'profile.html', btn: 'ربط حساب تيك توك' };
        var note = $('vs-note');
        if (note) { note.hidden = false; note.lastChild.textContent = kind === 'login' ? 'سجّل دخولك بحساب ستريمر مربوط بتيك توك' : 'اربط حساب تيك توك بحسابك عشان تلعب ضد ستريمر'; }
        renderTop(null);
    }

    renderGames();
    if (!A || !A.getToken || !A.getToken()) { setGate('login'); return; }
    if (window.AGPChallengeInbox) window.AGPChallengeInbox.mount($('lib-acts'), { root: '' });
    poll();
    setInterval(function () { if (!document.hidden) poll(); }, POLL_MS);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) poll(); });
})();
