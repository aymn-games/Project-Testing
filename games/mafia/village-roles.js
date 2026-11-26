/**
 * «المافيا» — نظام القرية (النظام الجديد): بيانات الأدوار المشتركة بين شاشة المذيع والجوال،
 * ونافذة «اختر الأدوار» اللي تطلع للمذيع باللوبي قبل التوزيع.
 *
 * المنطق كله بالخادم (backend/mafia/mafia-village.js)، والأعداد والحدود من backend/mafia/mafia-settings.js
 * (VILLAGE_ROLES — الخادم يرسلها مع welcome، وهنا نسخة احتياط بنفس القيم).
 */
(function () {
    'use strict';

    var TEAMS = {
        town: { n: 'فريق القرية', c: '#4f8ff7' },
        mafia: { n: 'فريق المافيا', c: '#ef4b4b' },
        neutral: { n: 'محايد', c: '#b07cf7' }
    };
    // i = أيقونة · c = لون البطاقة · desc = شرح زر «؟» · act = اللي يسويه بالليل (للجوال)
    var ROLES = {
        mafia: { n: 'مافيا', i: '🔪', c: '#ef4b4b', team: 'mafia', act: 'اختر مين تقتل الليلة',
            desc: 'كل ليلة تختارون ضحية من جوالاتكم. تعرفون بعض ولكم شات سري. لا تنكشف بالنهار!' },
        doctor: { n: 'الطبيب', i: '🩺', c: '#22b36b', team: 'town', act: 'اختر مين تحمي الليلة',
            desc: 'كل ليلة تحمي لاعب من القتل (المافيا أو القنّاص). ما تكرر نفس الشخص ليلتين ورا بعض، وتحمي نفسك مرة وحدة بس.' },
        detective: { n: 'المحقق', i: '🔍', c: '#4f8ff7', team: 'town', act: 'اختر مين تفحص الليلة',
            desc: 'كل ليلة تفحص لاعب، ومع الصبح توصلك النتيجة: مافيا أو بريء. انتبه: المزوّر يقدر يقلب نتيجتك.' },
        mayor: { n: 'العمدة', i: '👑', c: '#e0a81e', team: 'town',
            desc: 'الكل يعرف إنك العمدة من أول اللعبة، وصوتك بالتصويت يُحسب بصوتين.' },
        bodyguard: { n: 'الحارس الشخصي', i: '🛡️', c: '#16a6a0', team: 'town', act: 'اختر مين تحرس الليلة',
            desc: 'كل ليلة تحرس لاعب (مو نفسك، ولا نفس الشخص ليلتين ورا بعض). لو هجمت عليه المافيا تقتل المهاجم وينجو المحروس.' },
        sniper: { n: 'القنّاص', i: '🎯', c: '#3b6cf0', team: 'town', act: 'رصاصتك وحدة — على مين تطلقها؟',
            desc: 'عندك رصاصة وحدة بالمباراة كلها، تطلقها بالليل على أي لاعب. فكّر زين: لو أصبت بريء خسرتها.' },
        forger: { n: 'المزوّر', i: '✒️', c: '#d9365a', team: 'mafia', act: 'اختر مين تزوّر نتيجته',
            desc: 'من فريق المافيا، ما تقتل. كل ليلة تزوّر لاعب: لو فحصه المحقق تطلع نتيجته بالعكس. وأنت نفسك تطلع للمحقق بريء دايماً.' },
        jester: { n: 'المهرّج', i: '🤡', c: '#b07cf7', team: 'neutral',
            desc: 'محايد. هدفك إن القرية تطردك بالتصويت — لو صارت فزت! خلّهم يشكّون فيك بدون ما تبيّن.' },
        citizen: { n: 'مواطن', i: '🏠', c: '#4f8ff7', team: 'town',
            desc: 'ما عندك قدرة بالليل. ناقش وصوّت بذكاء عشان تطرد المافيا.' }
    };
    var CORE = ['mafia', 'doctor', 'detective'], EXTRA = ['mayor', 'bodyguard', 'sniper', 'forger', 'jester'];
    var LIMITS = { mafia: [1, 60], doctor: [0, 20], detective: [0, 20], mayor: [0, 1], bodyguard: [0, 5], sniper: [0, 5], forger: [0, 5], jester: [0, 3] };

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]; }); }
    function counts(s) { var o = {}; CORE.concat(EXTRA).forEach(function (k) { o[k] = (s && s['v_' + k]) || 0; }); return o; }
    /** مشكلة بالتوزيع لعدد n لاعب؟ (نفس شرط الخادم mafia-settings.villageMin) */
    function problem(s, n) {
        var c = counts(s), sum = 0, maf = c.mafia + c.forger;
        Object.keys(c).forEach(function (k) { sum += c[k]; });
        if (n < 5) return 'تحتاج 5 لاعبين على الأقل (الحين ' + n + ')';
        if (sum > n) return 'الأدوار (' + sum + ') أكثر من اللاعبين (' + n + ')';
        if (maf * 2 + 1 > n) return 'فريق المافيا لازم يكون أقل من نص القرية';
        return '';
    }
    function roleBadge(role, prefix) {
        var R = ROLES[role] || ROLES.citizen;
        return '<span class="vr-badge" style="--rc:' + R.c + '">' + (prefix ? '<em>' + esc(prefix) + '</em>' : '') + '<i>' + R.i + '</i>' + esc(R.n) + '</span>';
    }

    // ---------------------------------------------------------------- نافذة «اختر الأدوار» (المذيع)
    var CSS = '' +
        '.vrp-bg{position:fixed;inset:0;z-index:80;display:grid;place-items:center;padding:12px;background:rgba(3,4,12,.62);backdrop-filter:blur(8px);animation:vrpFade .25s ease}' +
        '.vrp{direction:rtl;width:min(1080px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;border-radius:28px;background:linear-gradient(180deg,#141a3a,#0c1028);border:1px solid rgba(160,170,255,.18);box-shadow:0 40px 120px rgba(0,0,0,.7),inset 0 1px 0 rgba(255,255,255,.06);color:#eef0ff;font-family:"IBM Plex Sans Arabic",sans-serif;animation:vrpIn .4s cubic-bezier(.2,1.2,.35,1)}' +
        '.vrp-h{flex:none;position:relative;text-align:center;padding:18px 20px 10px}' +
        '.vrp-h .k{font-weight:700;font-size:15px;color:#f5c84c}' +
        '.vrp-h h2{margin:2px 0 2px;font-size:clamp(28px,3.4vw,40px);font-weight:800;line-height:1.15}' +
        '.vrp-h p{margin:0;font-size:14px;color:#b9bedc}.vrp-h p b{color:#f5c84c}' +
        '.vrp-x{position:absolute;top:14px;left:14px;width:38px;height:38px;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.05);color:#fff;font-size:16px;cursor:pointer}' +
        '.vrp-leg{display:flex;justify-content:center;gap:14px;margin-top:8px;font-size:13px;font-weight:700;color:#d6d9f2;flex-wrap:wrap}' +
        '.vrp-leg span{display:inline-flex;align-items:center;gap:6px}.vrp-leg i{width:11px;height:11px;border-radius:4px;background:var(--tc)}' +
        '.vrp-b{flex:1;min-height:0;overflow-y:auto;padding:8px 18px 14px;scrollbar-width:thin}' +
        '.vrp-core{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;max-width:720px;margin:0 auto}' +
        '.vrp-extra{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-top:12px}' +
        '.vrc{--rc:#4f8ff7;position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;padding:16px 10px 12px;border-radius:20px;background:linear-gradient(180deg,color-mix(in srgb,var(--rc) 10%,#161d40),#10153a);border:1.5px solid color-mix(in srgb,var(--rc) 32%,transparent);transition:border-color .2s,box-shadow .2s}' +
        '.vrc.on{border-color:var(--rc);box-shadow:0 0 0 1px var(--rc),0 0 28px color-mix(in srgb,var(--rc) 35%,transparent)}' +
        '.vrc .ic{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;font-size:24px;background:color-mix(in srgb,var(--rc) 26%,transparent)}' +
        '.vrc b{font-size:18px;font-weight:800;margin-top:4px}.vrc small{font-size:12.5px;font-weight:700;color:color-mix(in srgb,var(--tc) 70%,#fff)}' +
        '.vrc .q{position:absolute;top:10px;right:10px;width:26px;height:26px;border-radius:50%;border:1.5px solid rgba(255,255,255,.35);background:transparent;color:#fff;font-weight:800;font-size:13px;cursor:pointer}' +
        '.vrc .st{direction:ltr;display:flex;align-items:center;gap:8px;margin-top:8px;padding:4px;border-radius:999px;background:rgba(0,0,0,.28)}' +
        '.vrc .st button{width:32px;height:32px;border-radius:50%;border:0;background:rgba(255,255,255,.1);color:#fff;font-size:20px;font-weight:800;line-height:1;cursor:pointer}' +
        '.vrc .st button:disabled{opacity:.3;cursor:default}' +
        '.vrc .st output{min-width:28px;text-align:center;font-size:22px;font-weight:800;color:#f5c84c}' +
        '.vrc .km{display:flex;flex-direction:column;gap:6px;width:100%;margin-top:10px}' +
        '.vrc .km button{height:34px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e7e9ff;font:700 13px "IBM Plex Sans Arabic",sans-serif;cursor:pointer}' +
        '.vrc .km button.on{background:var(--rc);border-color:var(--rc);color:#fff;box-shadow:0 6px 18px color-mix(in srgb,var(--rc) 40%,transparent)}' +
        '.vrc .tip{position:absolute;inset:auto 8px calc(100% + 6px);z-index:3;padding:10px 12px;border-radius:14px;background:#0a0d24;border:1px solid var(--rc);font-size:13px;font-weight:600;line-height:1.65;color:#e7e9ff;text-align:right;box-shadow:0 12px 30px rgba(0,0,0,.6)}' +
        '.vrp-more{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;max-width:660px;margin:14px auto 0;height:44px;border-radius:14px;border:1.5px dashed rgba(245,200,76,.45);background:rgba(245,200,76,.05);color:#f5c84c;font:800 15px "IBM Plex Sans Arabic",sans-serif;cursor:pointer}' +
        '.vrp-f{flex:none;display:flex;align-items:center;gap:12px;padding:12px 18px 16px;border-top:1px solid rgba(255,255,255,.08);flex-wrap:wrap}' +
        '.vrp-sum{flex:1;min-width:0;display:flex;flex-wrap:wrap;gap:6px}' +
        '.vrp-sum span{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 11px;border-radius:999px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08);font-size:13px;font-weight:700;white-space:nowrap}' +
        '.vrp-err{width:100%;order:3;text-align:center;font-size:13.5px;font-weight:700;color:#ff8f8f}' +
        '.vrp-go{flex:none;height:54px;padding:0 34px;border-radius:16px;border:0;background:linear-gradient(180deg,#ffe08a,#f0b93a);color:#2a1d00;font:800 19px "IBM Plex Sans Arabic",sans-serif;box-shadow:0 6px 0 #b8861d,0 14px 30px rgba(240,185,58,.35);cursor:pointer}' +
        '.vrp-go:disabled{filter:grayscale(1) brightness(.6);box-shadow:none;cursor:not-allowed}' +
        '.vr-badge{--rc:#4f8ff7;display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;background:var(--rc);color:#fff;font-weight:800;font-size:13px;white-space:nowrap}' +
        '.vr-badge em{font-style:normal;opacity:.85;font-weight:700}' +
        '@keyframes vrpFade{from{opacity:0}}@keyframes vrpIn{from{opacity:0;transform:translateY(18px) scale(.97)}}' +
        '@media (max-width:820px){.vrp-core{grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.vrp-extra{grid-template-columns:repeat(2,minmax(0,1fr))}.vrc{padding:12px 6px 10px}.vrc b{font-size:15px}.vrp-go{width:100%}}';
    function injectCss() { if (document.getElementById('vrpCss')) return; var st = document.createElement('style'); st.id = 'vrpCss'; st.textContent = CSS + '.vr-badge{line-height:1.6}'; document.head.appendChild(st); }

    /**
     * يفتح نافذة اختيار الأدوار.
     * opts: { settings (إعدادات الروم الحالية), count() ← عدد اللاعبين الحين, onDeal(settings), onClose() }
     * يرجع { refresh() } — تنادى لما يتغيّر عدد اللاعبين.
     */
    function openPicker(opts) {
        injectCss();
        var s = Object.assign({}, opts.settings || {}, { system: 'village' });
        CORE.concat(EXTRA).forEach(function (k) { if (s['v_' + k] == null) s['v_' + k] = k === 'mafia' ? 2 : (k === 'doctor' || k === 'detective') ? 1 : 0; });
        if (!s.killMode) s.killMode = 'agree';
        var open = EXTRA.some(function (k) { return s['v_' + k] > 0; }), tip = null;
        var bg = document.createElement('div'); bg.className = 'vrp-bg'; document.body.appendChild(bg);

        function card(k) {
            var R = ROLES[k], T = TEAMS[R.team], v = s['v_' + k], L = LIMITS[k];
            var km = k === 'mafia' ? '<div class="km">' + [['each', 'كل مافيا يقتل لاعبًا'], ['agree', 'يتفقون على واحد']].map(function (m) {
                return '<button type="button" class="' + (s.killMode === m[0] ? 'on' : '') + '" data-km="' + m[0] + '">' + m[1] + '</button>';
            }).join('') + '</div>' : '';
            return '<div class="vrc' + (v > 0 ? ' on' : '') + '" style="--rc:' + R.c + ';--tc:' + T.c + '">' +
                '<button type="button" class="q" data-q="' + k + '" aria-label="شرح ' + esc(R.n) + '">؟</button>' +
                (tip === k ? '<div class="tip">' + esc(R.desc) + '</div>' : '') +
                '<span class="ic">' + R.i + '</span><b>' + esc(R.n) + '</b><small>' + T.n + '</small>' +
                '<div class="st"><button type="button" data-k="' + k + '" data-d="-1" aria-label="إنقاص"' + (v <= L[0] ? ' disabled' : '') + '>−</button><output>' + v + '</output>' +
                '<button type="button" data-k="' + k + '" data-d="1" aria-label="زيادة"' + (v >= L[1] ? ' disabled' : '') + '>+</button></div>' + km + '</div>';
        }
        function render() {
            var n = opts.count(), c = counts(s), sum = 0; Object.keys(c).forEach(function (k) { sum += c[k]; });
            var cit = Math.max(0, n - sum), err = problem(s, n), nExtra = EXTRA.filter(function (k) { return c[k] > 0; }).length;
            var sumHtml = CORE.concat(EXTRA).filter(function (k) { return c[k] > 0; }).map(function (k) { return '<span>' + ROLES[k].i + ' ' + esc(ROLES[k].n) + ' ×' + c[k] + '</span>'; }).join('') +
                '<span>' + ROLES.citizen.i + ' مواطن ×' + cit + '</span>';
            bg.innerHTML = '<div class="vrp" role="dialog" aria-modal="true" aria-labelledby="vrpT">' +
                '<div class="vrp-h"><button type="button" class="vrp-x" data-close aria-label="إغلاق">✕</button>' +
                '<div class="k">🌙 ' + n + ' لاعبًا في القرية</div><h2 id="vrpT">اختر الأدوار</h2><p>كل من لا يأخذ دورًا يصير <b>مواطنًا</b>.</p>' +
                '<div class="vrp-leg">' + Object.keys(TEAMS).map(function (t) { return '<span style="--tc:' + TEAMS[t].c + '"><i></i>' + TEAMS[t].n + '</span>'; }).join('') + '</div></div>' +
                '<div class="vrp-b"><div class="vrp-core">' + CORE.map(card).join('') + '</div>' +
                '<button type="button" class="vrp-more" data-more>' + (open ? '▲' : '▼') + ' الأدوار الإضافية · ' + nExtra + ' مختار</button>' +
                (open ? '<div class="vrp-extra">' + EXTRA.map(card).join('') + '</div>' : '') + '</div>' +
                '<div class="vrp-f"><div class="vrp-sum">' + sumHtml + '</div>' +
                '<button type="button" class="vrp-go" data-go' + (err ? ' disabled' : '') + '>🌙 وزّع الأدوار</button>' +
                (err ? '<div class="vrp-err">' + esc(err) + '</div>' : '') + '</div></div>';
        }
        bg.addEventListener('click', function (e) {
            var t = e.target;
            if (t === bg || t.closest('[data-close]')) return close();
            var b;
            if ((b = t.closest('[data-q]'))) { var q = b.getAttribute('data-q'); tip = tip === q ? null : q; return render(); }
            tip = null;
            if ((b = t.closest('[data-k]'))) {
                var k = b.getAttribute('data-k'), L = LIMITS[k];
                s['v_' + k] = Math.max(L[0], Math.min(L[1], s['v_' + k] + Number(b.getAttribute('data-d'))));
            } else if ((b = t.closest('[data-km]'))) s.killMode = b.getAttribute('data-km');
            else if (t.closest('[data-more]')) open = !open;
            else if (t.closest('[data-go]')) { if (!problem(s, opts.count())) { close(); opts.onDeal(s); } return; }
            render();
        });
        function close() { bg.remove(); if (opts.onClose) opts.onClose(); }
        render();
        return { refresh: render, close: close, settings: function () { return s; } };
    }

    window.MafiaVillage = { ROLES: ROLES, TEAMS: TEAMS, CORE: CORE, EXTRA: EXTRA, counts: counts, problem: problem, roleBadge: roleBadge, injectCss: injectCss, openPicker: openPicker, esc: esc };
})();
