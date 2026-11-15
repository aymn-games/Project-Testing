/**
 * «مين يعرفني أكثر؟» — لوحة جوال المضيف.
 *
 * WK.mountHost(root, opts): opts.room (معرّف الغرفة من الباركود)،
 * opts.transport (WK.relay افتراضياً)، opts.storage (localStorage افتراضياً).
 *
 * الخطوات: اسم ← طلب ← انتظار قبول الشاشة ← لوحة تحكم حسب مرحلة اللعبة.
 * بعد القبول كل الرسائل مشفّرة (البروتوكول بأول wk-screen.js). الجوال
 * يحفظ مفتاحه بالجهاز، فلو انقفلت الصفحة ورجع يفتحها يرجع يتحكم بدون طلب جديد.
 */
(function () {
    'use strict';

    var AGP = window.AymanGamesPlatform = window.AymanGamesPlatform || {};
    var WK = AGP.whoKnowsMe = AGP.whoKnowsMe || {};
    var esc = function (s) { return WK.esc(s); };

    WK.mountHost = function (root, opts) {
        opts = opts || {};
        var store = opts.storage || window.localStorage;
        var transport = opts.transport || WK.relay;
        var room = String(opts.room || '');
        var SKEY = 'wk-host:' + room;

        var me = WK.readJSON(store, SKEY, null) || {};   // {dev, name, pair, accepted}
        var view = 'name';      // name | wait | no | kicked | ctrl | bad
        var key = null, S = null, stateAt = 0, chanOk = false, chan = null;
        var reqTimer = null, hbTimer = null;
        // مسودة اختيار السؤال (ما تنمسح مع تحديثات الحالة)
        var draft = { tab: 'bank', cat: WK.questionCats[0], qid: null, text: '', answer: '' };

        root.classList.add('wkp');

        if (!room || !/^[a-z0-9]{8,40}$/.test(room)) { view = 'bad'; render(); return; }
        if (!WK.secure.supported()) { view = 'bad'; render(); return; }

        function save() { WK.writeJSON(store, SKEY, me); }

        function ensurePair() {
            if (me.dev && me.pair) return Promise.resolve();
            return WK.secure.newPair().then(function (pair) { me.dev = me.dev || WK.randomId(16); me.pair = pair; save(); });
        }

        chan = transport(room, onMsg, function (ok) { chanOk = ok; if (ok && (view === 'wait' || view === 'ctrl')) sendReq(); renderTop(); });

        function sendReq() {
            if (!me.dev || !me.pair) return;
            chan.send({ t: 'req', dev: me.dev, name: me.name, pub: me.pair.pub });
        }
        function startRequest() {
            ensurePair().then(function () {
                view = 'wait'; render();
                sendReq();
                clearInterval(reqTimer);
                reqTimer = setInterval(function () { if (view === 'wait') sendReq(); else clearInterval(reqTimer); }, 4000);
            });
        }

        function onMsg(m) {
            if (!m || m.dev !== me.dev) return;
            if (m.t === 'wait') { if (view !== 'ctrl') { view = 'wait'; render(); } return; }
            if (m.t === 'no') { view = 'no'; me.accepted = false; save(); clearInterval(reqTimer); render(); return; }
            if (m.t === 'kick') { view = 'kicked'; key = null; me.accepted = false; save(); clearInterval(hbTimer); render(); return; }
            if (m.t === 'ok' && m.pub) {
                clearInterval(reqTimer);
                WK.secure.shared(me.pair.priv, m.pub).then(function (k) {
                    key = k; me.accepted = true; save();
                    if (view !== 'ctrl') { view = 'ctrl'; render(); }
                    send({ c: 'hb', need: true });
                    clearInterval(hbTimer);
                    hbTimer = setInterval(function () { send({ c: 'hb', need: !S }); }, 10000);
                });
                return;
            }
            if (m.t === 'e' && m.to === 'p' && key) {
                WK.secure.decrypt(key, m).then(function (inner) {
                    if (inner.c === 'state') onState(inner.s);
                }).catch(function () {});
            }
        }
        function send(inner) {
            if (!key) return;
            WK.secure.encrypt(key, inner).then(function (box) {
                chan.send({ t: 'e', dev: me.dev, to: 's', iv: box.iv, data: box.data });
            });
        }
        function cmd(c, arg) { send({ c: 'cmd', cmd: c, arg: arg || null }); }

        function onState(s) {
            var prev = S;
            S = s; stateAt = Date.now();
            if (view !== 'ctrl') view = 'ctrl';
            // مرحلة الاختيار: ما نعيد الرسم (عشان ما تنمسح الكتابة) إلا لو تغيّرت المرحلة
            if (prev && prev.phase === s.phase && s.phase === 'pick' && prev.round === s.round) { renderTop(); return; }
            if (prev && prev.phase !== 'pick' && s.phase === 'pick') { draft.qid = null; draft.text = ''; draft.answer = ''; }
            render();
        }

        // ── الرسم ──
        function topHtml() {
            return '<div class="wkp-top"><b>مين يعرفني أكثر؟</b><span class="wkp-badge"><span class="wkp-dot ' + (chanOk && (view !== 'ctrl' || key) ? 'on' : '') + '"></span>' +
                (view === 'ctrl' ? esc(me.name) : (chanOk ? 'متصل' : 'جاري الاتصال…')) + '</span></div>';
        }
        function renderTop() { var t = root.querySelector('.wkp-top'); if (t) t.outerHTML = topHtml(); }

        function render() {
            var h = topHtml();
            if (view === 'bad') h += center('⚠️', 'الرابط غير صالح', 'امسح الباركود من شاشة اللعبة مرة ثانية. (لازم يكون الموقع https)');
            else if (view === 'name') h += vName();
            else if (view === 'wait') h += '<div class="wkp-center"><div class="wkp-spin"></div><h2 class="wkp-h">بانتظار القبول…</h2><p class="wkp-p">اضغط «قبول» على شاشة اللعبة جنب اسم <b>' + esc(me.name) + '</b></p></div>' +
                '<button class="wkp-btn ghost" data-a="rename">تغيير الاسم</button>';
            else if (view === 'no') h += center('🚫', 'انرفض الطلب', 'شاشة اللعبة رفضت طلب التحكم.') + '<button class="wkp-btn ghost" data-a="rename">رجوع</button>';
            else if (view === 'kicked') h += center('📴', 'انفصل الجوال', 'جوال ثاني صار يتحكم باللعبة، أو انتجدد الباركود.') + '<button class="wkp-btn pri" data-a="again">أرسل طلب من جديد</button>';
            else h += vCtrl();
            root.innerHTML = h;
            afterRender();
        }
        function center(emoji, title, text) {
            return '<div class="wkp-center"><div class="wkp-emoji">' + emoji + '</div><h2 class="wkp-h">' + title + '</h2><p class="wkp-p">' + text + '</p></div>';
        }
        function vName() {
            return '<div class="wkp-center" style="flex:0;padding-top:30px"><div class="wkp-emoji">📱</div><h2 class="wkp-h">لوحة تحكم المضيف</h2>' +
                '<p class="wkp-p">اكتب اسمك وأرسل طلب، وبعدها اقبله من شاشة اللعبة.</p></div>' +
                '<div class="wkp-card"><label class="wkp-lbl" for="wkp-name">اسمك</label><input id="wkp-name" class="wkp-in" maxlength="24" placeholder="مثلاً: أيمن" value="' + esc(me.name || '') + '">' +
                '<button class="wkp-btn pri" data-a="send">إرسال طلب</button></div>';
        }

        function vCtrl() {
            if (!S) return '<div class="wkp-center"><div class="wkp-spin"></div><p class="wkp-p">جاري تحميل اللعبة…</p></div>';
            var ph = S.phase;
            if (ph === 'setup') return center('✅', 'الجوال مربوط', 'كمّل من شاشة اللعبة.');
            if (ph === 'link') return center('✅', 'الجوال مربوط', 'اضغط «اللوبي» عشان يدخل اللاعبين.') +
                '<button class="wkp-btn pri big" data-a="cmd" data-c="start">اللوبي</button>';
            if (ph === 'lobby') return '<div class="wkp-card"><h2 class="wkp-h">✅ الجوال مربوط</h2><div class="wkp-stat"><div><b>' + (S.joined || 0) + '</b><span>لاعب باللوبي</span></div></div>' +
                '<p class="wkp-p">اللاعبين يدخلون بكتابة <b style="color:#fff">' + esc(S.settings.keyword || '') + '</b> بالشات.</p></div>' +
                '<button class="wkp-btn pri big" data-a="cmd" data-c="start"' + (S.joined ? '' : ' disabled') + '>' + (S.joined ? 'ابدأ اللعبة' : 'بانتظار اللاعبين') + '</button>' +
                '<div class="wkp-card">' + vSettings() + '</div>';
            if (ph === 'pick') return vPick();
            if (ph === 'answer') return '<div class="wkp-card"><span class="wkp-lbl">الجولة ' + S.round + '</span><h2 class="wkp-h">' + esc(S.q.text) + '</h2>' +
                '<div class="wkp-mine">جوابك: <b>' + esc(S.q.answer) + '</b></div></div>' +
                '<div class="wkp-card"><div class="wkp-timer" data-live="t"></div><div class="wkp-stat"><div><b data-live="c">' + S.count + '</b><span>إجابة وصلت</span></div></div></div>' +
                '<button class="wkp-btn ghost" data-a="cmd" data-c="endTime">إنهاء الوقت الحين</button>';
            if (ph === 'reveal') return '<div class="wkp-card"><h2 class="wkp-h">' + esc(S.q.text) + '</h2><div class="wkp-mine">جوابك ظاهر على الشاشة: <b>' + esc(S.q.answer) + '</b></div>' +
                '<div class="wkp-stat"><div><b>' + S.count + '</b><span>إجابة</span></div></div></div>' +
                (S.count ? '<button class="wkp-btn pri big" data-a="cmd" data-c="startReview">ابدأ إظهار الإجابات</button>'
                    : '<p class="wkp-p" style="text-align:center">ما وصلت أي إجابة</p><button class="wkp-btn pri big" data-a="cmd" data-c="next">سؤال جديد</button><button class="wkp-btn ghost" data-a="cmd" data-c="finish">إنهاء وعرض الفائز</button>');
            if (ph === 'review') {
                var c = S.cur || {};
                var cls = c.verdict === true ? 'ok' : c.verdict === false ? 'no' : '';
                var done = c.verdict != null;
                return '<div class="wkp-mine">جوابك: <b>' + esc(S.q.answer) + '</b></div>' +
                    '<div class="wkp-ans ' + cls + '"><span class="wkp-ans-n">الإجابة ' + c.i + ' من ' + c.n + ' · ' + esc(c.name) + '</span>' +
                    '<div class="wkp-big">' + esc(c.text) + '</div>' +
                    (done ? '<span class="wkp-ans-n">' + (c.verdict ? '✓ مقبولة' : '✗ مرفوضة') + (c.auto ? ' (تلقائي)' : '') + '</span>' : '') + '</div>' +
                    '<div class="wkp-two"><button class="wkp-btn ok big" data-a="cmd" data-c="accept"' + (done ? ' disabled' : '') + '>✓ قبول</button>' +
                    '<button class="wkp-btn no big" data-a="cmd" data-c="reject"' + (done ? ' disabled' : '') + '>✗ رفض</button></div>' +
                    '<div class="wkp-two"><button class="wkp-btn ghost" data-a="cmd" data-c="undo"' + (S.canUndo ? '' : ' disabled') + '>↶ تراجع</button>' +
                    '<button class="wkp-btn ghost" data-a="cmd" data-c="endReview">إنهاء المراجعة</button></div>';
            }
            if (ph === 'round') return '<div class="wkp-card"><h2 class="wkp-h">🏆 نهاية الجولة ' + S.round + '</h2>' + topList() + '</div>' +
                '<button class="wkp-btn pri big" data-a="cmd" data-c="next">سؤال جديد</button>' +
                '<button class="wkp-btn ghost" data-a="cmd" data-c="finish">إنهاء وعرض الفائز</button>' +
                '<div class="wkp-card">' + vSettings() + '</div>';
            if (ph === 'final') return center('👑', S.winners.length ? 'الفائز: ' + esc(S.winners.join('، ')) : 'انتهت اللعبة', 'النتيجة ظاهرة على شاشة البث.') +
                '<div class="wkp-card">' + topList() + '</div><button class="wkp-btn pri big" data-a="cmd" data-c="newMatch">مباراة جديدة</button>' +
                '<button class="wkp-btn ghost" data-a="cmd" data-c="replay">إعادة بنفس اللاعبين</button>';
            return '';
        }
        function topList() {
            if (!S.top.length) return '<p class="wkp-p">ما فيه نقاط للحين</p>';
            return S.top.map(function (r, i) {
                return '<div class="wkp-li"><span>' + (i + 1) + '. ' + esc(r.name) + (r.pts ? ' <small style="color:#34d399">+' + r.pts + '</small>' : '') + '</span><span>' + r.total + '</span></div>';
            }).join('');
        }
        function vSettings() {
            var t = S.settings || {};
            return '<span class="wkp-lbl">وقت الإجابة (ثانية)</span><div class="wkp-cats">' + [30, 45, 60, 90, 120].map(function (x) {
                return '<button class="wkp-cat ' + (t.time === x ? 'on' : '') + '" data-a="time" data-v="' + x + '">' + x + '</button>';
            }).join('') + '</div>' +
                '<button class="wkp-cat ' + (t.auto ? 'on' : '') + '" data-a="auto" style="align-self:flex-start">الحكم التلقائي على المتطابق: ' + (t.auto ? 'مفعّل' : 'مطفّى') + '</button>';
        }
        function vPick() {
            var used = S.used || [];
            var h = '<div class="wkp-card"><span class="wkp-lbl">الجولة ' + S.round + ' · اختر سؤال عنك</span>' +
                '<div class="wkp-tabs"><button class="wkp-tab ' + (draft.tab === 'bank' ? 'on' : '') + '" data-a="tab" data-v="bank">من البنك</button>' +
                '<button class="wkp-tab ' + (draft.tab === 'own' ? 'on' : '') + '" data-a="tab" data-v="own">اكتب سؤالك</button></div>';
            if (draft.tab === 'bank') {
                h += '<div class="wkp-cats">' + WK.questionCats.map(function (c) {
                    return '<button class="wkp-cat ' + (draft.cat === c ? 'on' : '') + '" data-a="cat" data-v="' + esc(c) + '">' + esc(c) + '</button>';
                }).join('') + '</div><div class="wkp-qs">' + WK.questions.filter(function (q) { return q.cat === draft.cat; }).map(function (q) {
                    var u = used.indexOf(q.id) >= 0;
                    return '<button class="wkp-q ' + (draft.qid === q.id ? 'on' : '') + (u ? ' used' : '') + '" data-a="q" data-v="' + q.id + '"><span>' + esc(q.text) + '</span>' + (u ? '<small>انسأل</small>' : '') + '</button>';
                }).join('') + '</div><button class="wkp-btn ghost" data-a="rand">🎲 سؤال عشوائي</button>';
            } else {
                h += '<label class="wkp-lbl" for="wkp-own">سؤالك</label><textarea id="wkp-own" class="wkp-in" maxlength="140" placeholder="مثلاً: وش أكثر شي أحب آكله بالليل؟">' + esc(draft.tab === 'own' && draft.qid == null ? draft.text : '') + '</textarea>';
            }
            h += '</div>';
            var qText = draft.tab === 'bank' ? (draft.qid != null ? draft.text : '') : draft.text;
            h += '<div class="wkp-card">' + (draft.tab === 'bank' ? (qText ? '<div class="wkp-sel">' + esc(qText) + '</div>' : '<p class="wkp-p">اختر سؤال من القائمة فوق</p>') : '') +
                '<label class="wkp-lbl" for="wkp-ans">جوابك (يبان بعد ما يخلص الوقت)</label>' +
                '<input id="wkp-ans" class="wkp-in" maxlength="60" placeholder="اكتب جوابك" value="' + esc(draft.answer) + '">' +
                '<button class="wkp-btn pri big" data-a="pick"' + (qText.trim() && draft.answer.trim() ? '' : ' disabled') + '>اختيار</button></div>';
            if (S.top && S.top.length) h += '<div class="wkp-card"><span class="wkp-lbl">الترتيب</span>' + topList() + '</div>';
            h += '<button class="wkp-btn ghost" data-a="cmd" data-c="finish">إنهاء وعرض الفائز</button>';
            return h;
        }

        function syncPickBtn() {
            var b = root.querySelector('[data-a="pick"]');
            if (!b) return;
            var qText = draft.tab === 'bank' ? (draft.qid != null ? draft.text : '') : draft.text;
            b.disabled = !(qText.trim() && draft.answer.trim());
        }

        function afterRender() {
            var n = root.querySelector('#wkp-name');
            if (n) n.addEventListener('keydown', function (e) { if (e.key === 'Enter') root.querySelector('[data-a="send"]').click(); });
            var own = root.querySelector('#wkp-own');
            if (own) own.addEventListener('input', function () { draft.text = own.value; draft.qid = null; syncPickBtn(); });
            var ans = root.querySelector('#wkp-ans');
            if (ans) ans.addEventListener('input', function () { draft.answer = ans.value; syncPickBtn(); });
            var sel = root.querySelector('.wkp-q.on');
            if (sel && sel.scrollIntoView) { try { sel.scrollIntoView({ block: 'nearest' }); } catch (e) {} }
            tick();
        }

        function tick() {
            if (!S || S.phase !== 'answer' || view !== 'ctrl') return;
            var left = Math.max(0, S.left - (Date.now() - stateAt));
            var t = root.querySelector('[data-live="t"]');
            if (t) { var s = Math.ceil(left / 1000); t.textContent = s; t.classList.toggle('hot', s <= 10); }
        }
        setInterval(tick, 250);

        root.addEventListener('click', function (ev) {
            var t = ev.target.closest('[data-a]');
            if (!t || t.disabled) return;
            var a = t.getAttribute('data-a'), v = t.getAttribute('data-v');
            if (a === 'send') {
                var name = (root.querySelector('#wkp-name').value || '').trim().slice(0, 24);
                if (!name) { root.querySelector('#wkp-name').focus(); return; }
                me.name = name; save(); startRequest(); return;
            }
            if (a === 'rename') { clearInterval(reqTimer); view = 'name'; render(); return; }
            if (a === 'again') { startRequest(); return; }
            if (a === 'cmd') { cmd(t.getAttribute('data-c')); return; }
            if (a === 'time') { cmd('settings', { time: +v }); return; }
            if (a === 'auto') { cmd('settings', { auto: !(S.settings && S.settings.auto) }); return; }
            if (a === 'tab') { draft.tab = v; if (v === 'own') { draft.qid = null; draft.text = ''; } render(); return; }
            if (a === 'cat') { draft.cat = v; render(); return; }
            if (a === 'q') {
                var q = WK.questions.filter(function (x) { return x.id === +v; })[0];
                if (q) { draft.qid = q.id; draft.text = q.text; }
                render(); var i = root.querySelector('#wkp-ans'); if (i && !draft.answer) i.focus(); return;
            }
            if (a === 'rand') {
                var used = (S && S.used) || [];
                var pool = WK.questions.filter(function (x) { return used.indexOf(x.id) < 0; });
                if (!pool.length) pool = WK.questions;
                var r = pool[Math.floor(Math.random() * pool.length)];
                draft.qid = r.id; draft.text = r.text; draft.cat = r.cat; render(); return;
            }
            if (a === 'pick') {
                var text = draft.text.trim(), answer = draft.answer.trim();
                if (!text || !answer) return;
                cmd('pick', { text: text, answer: answer, id: draft.tab === 'bank' ? draft.qid : null });
                return;
            }
        });

        // الرجوع للصفحة (من تطبيق ثاني) — إعادة اتصال فورية
        document.addEventListener('visibilitychange', function () { if (!document.hidden && chan && chan.reconnect) chan.reconnect(); });

        if (me.name && me.accepted && me.pair) { view = 'wait'; sendReq(); startRequest(); }
        render();
    };
}());
