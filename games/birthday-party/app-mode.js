// «الحفلة كأيقونة بالشاشة الرئيسية» (يتحمّل بالـ head في join.html وplay.html، قبل أي شي ثاني).
//
// - أندرويد/كروم: manifest.webmanifest (start_url = join.html?app=1) وزر يطلب التثبيت مباشرة
//   (beforeinstallprompt). التخزين مشترك مع المتصفح، فيرجع لنفس شخصيته من party-me.
// - آيفون/آيباد: أبل ما تسمح لموقع يضيف نفسه، فنشرح الخطوتين (مشاركة ← إضافة إلى الشاشة الرئيسية).
//   والأيقونة بالآيفون لها تخزين منفصل عن سفاري، فقبل الشرح نحط بيانات الجلسة في رابط الصفحة
//   (play.html?code=…&me=<id>.<key>.<role>.<dev>) عشان الأيقونة تفتح على نفس الشخصية. أول ما
//   تفتح الصفحة بهالرابط نحفظ الجلسة ونشيل me من الرابط. ما نحط manifest بالآيفون عشان سفاري
//   ياخذ رابط الصفحة الحالي (مو start_url).
(function () {
    var ua = navigator.userAgent || '';
    var ios = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    var mm = function (q) { try { return matchMedia(q).matches; } catch (e) { return false; } };
    var standalone = navigator.standalone === true || mm('(display-mode: standalone)') || mm('(display-mode: fullscreen)');
    if (!ios) { var l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.webmanifest'; document.head.appendChild(l); }
    var deferred = null;
    addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; });
    addEventListener('appinstalled', function () { deferred = null; });

    var HEX = /^[0-9a-f]{8,64}$/i;
    var q = new URLSearchParams(location.search), me = q.get('me'), code = (q.get('code') || '').replace(/\D/g, '').slice(0, 4);
    if (me) {
        var p = me.split('.');
        if (code && HEX.test(p[0] || '') && HEX.test(p[1] || '')) {
            try {
                localStorage.setItem('party-me', JSON.stringify({ code: code, id: p[0], key: p[1], role: p[2] === 'girl' ? 'girl' : 'guest' }));
                if (p[3] && /^[a-z0-9]{8,32}$/i.test(p[3])) localStorage.setItem('party-dev', JSON.stringify(p[3]));
            } catch (e) { /* تخزين محجوب */ }
        }
        q.delete('me');
        try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) { /* */ }
    }
    function read(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }

    window.PARTY_APP = {
        ios: ios,
        standalone: standalone,
        canPrompt: function () { return !!deferred; },
        // أندرويد: نافذة التثبيت. ترجع Promise بـ true لو ثبّت
        prompt: function () {
            if (!deferred) return Promise.resolve(false);
            var d = deferred; deferred = null; d.prompt();
            return (d.userChoice || Promise.resolve({})).then(function (c) { return c && c.outcome === 'accepted'; });
        },
        // آيفون: رابط الصفحة الحالي يصير فيه الجلسة (للأيقونة)، وrestore() يرجّعه
        markUrl: function () {
            var s = read('party-me'), dev = read('party-dev');
            if (!s || !s.code || !s.id || !s.key) return function () {};
            var old = location.pathname + location.search + location.hash, u = new URLSearchParams(location.search);
            u.set('code', s.code); u.set('me', [s.id, s.key, s.role === 'girl' ? 'girl' : 'guest', typeof dev === 'string' ? dev : ''].join('.'));
            try { history.replaceState(null, '', location.pathname + '?' + u.toString()); } catch (e) { return function () {}; }
            return function () { try { history.replaceState(null, '', old); } catch (e) { /* */ } };
        },
    };
})();
