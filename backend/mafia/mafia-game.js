/**
 * «المافيا» — منطق المباراة على الخادم (الخادم هو الحكم)، حسب قواعد «مدينة المافيا» 1.0.
 *
 * المراحل: reveal (كشف الأدوار على الجوالات) → night (الاختيار من الجوالات)
 *   → dawn (مشاهد الليل على شاشة البث) → day (النقاش) → vote (التصويت)
 *   → verdict (النتائج ومشهد الطرد) → night … حتى over.
 *
 * الأدوار: مواطن · مافيا · متخفي (من المافيا؛ أول فحص ناجح له يطلع «من المدينة») ·
 *   طبيب (يقدر يحمي نفس الشخص كل ليلة، ويحمي نفسه مرة وحدة بالمباراة) ·
 *   محقق (النتيجة: مافيا / من المدينة — كرت الحماية يطلّع المافيا «من المدينة»). الفريق: faction = 'mafia' | 'town'.
 *
 * كروت المافيا: 3 مختلفة عشوائياً من 5، مخزون مشترك وكل كرت مرة وحدة:
 *   recruit (تجنيد — بديل القتل، من الليلة 3) · shield / reveal / mislead / silence
 *   (كروت مساعدة من الليلة 2، كرت واحد بالليلة). قرار المافيا بالأكثرية النسبية،
 *   والتعادل بالمركز الأول يلغي الخيار المختلف عليه بدون حرق كرت.
 *
 * مشاهد الفجر تطلع كتسلسل seq [{k, at, dur, ...}] بأوقات نسبية من بداية المرحلة،
 * وشاشة البث تشغّلها حسب الوقت — فلو حدّث المذيع الصفحة يكمل من نفس اللقطة.
 *
 * view(id) تفلتر الحالة لكل طرف:
 *   - المذيع (شاشة البث يشوفها الكل): ما يستلم أدوار الأحياء ولا اختيارات الليل ولا
 *     النتائج السرية ولا الكروت (إلا بالنهاية)، والشات العام فقط.
 *   - اللاعب: دوره، والمافيا يعرفون بعض (والمتخفي والمجنّد) ويشوفون الكروت واختيارات بعض،
 *     والأطباء يعرفون بعض والمحققين يعرفون بعض (الحقل mate بكل لاعب يعرفه)،
 *     وإشعاراته الخاصة (نتائج المحقق، إنقاذ الطبيب، كشف الهوية، التجنيد).
 */
'use strict';

var REVEAL_MS = 8000;
var VERDICT_MS = 16000;   // وقت كافي للمشاهدين يقرون لوحة «نتيجة التصويت» (مين صوّت لمين)
var CHAT_MAX = 300;
var DISTRICT_SIZE = 25;
var Settings = require('./mafia-settings');
var RECRUIT_CAP = 0.30;
var CARDS = ['recruit', 'shield', 'reveal', 'mislead', 'silence'];
var CARD_NAMES = { recruit: 'التجنيد', shield: 'الحماية', reveal: 'كشف الهوية', mislead: 'التضليل', silence: 'الإسكات' };
var ROLE_NAMES = { citizen: 'مواطن', mafia: 'مافيا', disguised: 'متخفي', doctor: 'طبيب', detective: 'محقق' };
// أطوال لقطات الفجر (لازم تطابق مدد المشاهد في games/mafia/mafia-scene.js)
var SHOT = { intro: 3000, inspect: 6500, attack: 10000, save: 6000, quiet: 5000, heal: 5500, noheal: 3500, result: 5000 };
// لحظة وصول جسم الضحية للأرض داخل لقطة الهجوم (ATK.down بالمشهد) — قبلها يبقى «حي» بحالة البث
var ATTACK_DOWN_MS = 7900;

function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

function assignRoles(n, s) {
    var roles = [], i;
    for (i = 0; i < s.disguised; i++) roles.push('disguised');
    for (i = s.disguised; i < s.mafia; i++) roles.push('mafia');
    for (i = 0; i < s.doctors; i++) roles.push('doctor');
    for (i = 0; i < s.detectives; i++) roles.push('detective');
    while (roles.length < n) roles.push('citizen');
    return shuffle(roles.slice(0, n));
}

/** الأكثرية النسبية بين الأصوات المسجلة؛ التعادل بالمركز الأول = null. */
function plurality(list) {
    var counts = {}, best = 0, top = [];
    list.forEach(function (v) { var k = JSON.stringify(v); counts[k] = (counts[k] || 0) + 1; });
    Object.keys(counts).forEach(function (k) { if (counts[k] > best) { best = counts[k]; top = [k]; } else if (counts[k] === best) top.push(k); });
    return top.length === 1 ? JSON.parse(top[0]) : null;
}

/**
 * roster: [{id,name,look,tiktok}] · settings: من mafia-settings.validate
 * hooks: { onChange() }
 */
function createGame(roster, settings, hooks) {
    var S = settings;
    var roles = assignRoles(roster.length, S);
    var districts = Math.max(1, Math.ceil(roster.length / DISTRICT_SIZE));
    var districtOrder = shuffle(roster.map(function (_, i) { return i; }));
    var G = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        phase: 'reveal', round: 0, startedAt: Date.now(), phaseAt: Date.now(), endsAt: Date.now() + REVEAL_MS,
        settings: S, districts: districts,
        players: roster.map(function (p, i) {
            var r = roles[i];
            return {
                id: p.id, name: p.name, look: p.look, tiktok: p.tiktok || null, seat: i,
                district: Math.floor(districtOrder.indexOf(i) / DISTRICT_SIZE) + 1,
                role: r, originalRole: r, faction: r === 'mafia' || r === 'disguised' ? 'mafia' : 'town',
                alive: true, diedRound: 0, cause: null, recruitedRound: 0,
                disguisedScanned: false, doctorSelfUsed: false,
                mafiaSince: 0, notices: [], inspections: []
            };
        }),
        cards: shuffle(Settings.enabledCards(S, roster.length)).slice(0, S.cardsCount == null ? 3 : S.cardsCount),   // المفعّلة واللي لها فايدة بهالمباراة
        usedCards: [], effects: [], silenced: [], silenceNext: [],
        night: null, seq: [], chat: [], votes: {}, voteOk: {}, verdict: null, winner: null, mafiaPrev: []
    };
    var chatSeq = 0;

    function changed() { if (hooks && hooks.onChange) hooks.onChange(); }
    function P(id) { return G.players.find(function (p) { return p.id === id; }); }
    function alive() { return G.players.filter(function (p) { return p.alive; }); }
    function aliveRole(r) { return alive().filter(function (p) { return p.role === r; }); }
    function aliveMafia() { return alive().filter(function (p) { return p.faction === 'mafia'; }); }
    function go(phase, ms) { G.phase = phase; G.phaseAt = Date.now(); G.endsAt = ms ? G.phaseAt + ms : 0; changed(); }
    function available(card) { return G.cards.indexOf(card) >= 0 && G.usedCards.indexOf(card) < 0 && G.round >= (card === 'recruit' ? 3 : 2); }
    // team = إشعار عن زميل بالفريق (اختياره/نتيجته) — الجوال يعرضه «لفريقك بس» بدل «خاص فيك»
    function notice(p, text, team) { var n = { round: G.round, text: text, at: Date.now() }; if (team) n.team = true; p.notices.push(n); if (p.notices.length > 40) p.notices.shift(); }

    function sys(text) { G.chat.push({ n: ++chatSeq, sys: true, ch: 'city', text: text, at: Date.now() }); trimChat(); }
    function trimChat() { if (G.chat.length > CHAT_MAX) G.chat.splice(0, G.chat.length - CHAT_MAX); }

    G.players.forEach(function (p) {
        notice(p, 'دورك: ' + ROLE_NAMES[p.role] + (p.faction === 'mafia' ? ' — تقدر تدخل شات المافيا السري.' : ' — دوّر على المافيا.'));
    });

    // ---- الليل بأدوار متتالية: المافيا ← الطبيب ← المحقق ← الصبح (resolveNight)
    // دور صاحب دور ميت يمر برضو بمدة عشوائية قصيرة عشان البث ما يكشف إنه مات (مثل الراوي)،
    // والدور اللي ما له أحد بالإعدادات أصلاً (0 أطباء مثلاً) ينحذف.
    var TURNS = ['mafia', 'doctor', 'detective'];
    var TURN_TXT = { mafia: '🔪 دور المافيا: يختارون ضحيتهم من جوالاتهم', doctor: '🩺 دور الطبيب: يختار مين يحمي الليلة', detective: '🕵️ دور المحقق: يختار مين يفحص' };
    function turnActors(turn) { return turn === 'mafia' ? aliveMafia() : aliveRole(turn); }
    function turnExists(turn) { return turn === 'mafia' || (turn === 'doctor' ? S.doctors > 0 : S.detectives > 0); }
    function turnSec(turn) { return turn === 'mafia' ? S.mafiaSec : turn === 'doctor' ? S.doctorSec : S.detectiveSec; }
    function startTurn(turn) {
        G.turn = turn;
        var ms = turnActors(turn).length ? turnSec(turn) * 1000 : 6000 + Math.floor(Math.random() * 5000);
        sys(TURN_TXT[turn]);
        go('night', ms);
    }
    // (انشال إقصاء غير النشطين: اللي يفوته دوره أو التصويت أو يقفل الصفحة يبقى باللعبة — دوره يمر بانتهاء الوقت)
    function nextTurn() {
        // نهاية الدور: اللي حدد وما أكّد ينحسب اختياره
        if (G.turn === 'mafia') resolveMafiaDecision();
        if (G.turn === 'detective') aliveRole('detective').forEach(function (d) { deliverReport(d); });
        for (var j = TURNS.indexOf(G.turn) + 1; j < TURNS.length; j++) if (turnExists(TURNS[j])) return startTurn(TURNS[j]);
        G.turn = null; resolveNight();
    }

    function startNight() {
        G.round++;
        // confirmed: مين أكّد اختياره (التأكيد نهائي، والدور يخلص بدري لو الكل أكّد) · reports: المحققين اللي استلموا نتيجتهم
        // unscanned: المتخفين اللي ما انفحصوا قبل الليلة — كل المحققين بنفس الليلة يطلع لهم «مواطن»
        G.night = { ops: {}, cards: {}, actions: {}, confirmed: {}, reports: {}, triggered: [], dec: null, unscanned: {} };
        alive().forEach(function (p) { if (p.role === 'disguised' && !p.disguisedScanned) G.night.unscanned[p.id] = true; });
        G.votes = {}; G.verdict = null; G.seq = []; G.silenced = [];
        sys('🌙 الليلة ' + G.round + ' — الكل يغمّض عيونه');
        G.turn = null; startTurn('mafia');
    }

    function anyAuxCard() { return ['shield', 'reveal', 'mislead', 'silence'].some(available); }

    /** أكّدوا كل أصحاب الدور الحالي؟ (تأكيد واحد ما ينهي دور زميله — الدور يخلص بدري بس لو الكل أكّد) */
    function turnDone() {
        var actors = turnActors(G.turn);
        if (!actors.length) return false;   // دور وهمي (صاحبه ميت): يكمّل مدته
        return actors.every(function (a) { return G.night.confirmed[a.id]; });
    }
    function picked(N, id) { return G.turn === 'mafia' ? !!N.ops[id] : !!N.actions[id]; }

    /** تأكيد الاختيار: نهائي، والنتيجة تطلع على طول (المحقق نتيجته، الطبيب الحماية، المافيا الهدف) ويدري فيها الفريق */
    function confirm(me) {
        var N = G.night, turn = G.turn;
        if (N.confirmed[me.id] || turnActors(turn).indexOf(me) < 0 || !picked(N, me.id)) return;
        N.confirmed[me.id] = true;
        if (turn === 'mafia') {
            if (anyAuxCard() && !N.cards[me.id] && N.ops[me.id].op !== 'recruit') N.cards[me.id] = { card: 'none' };   // الكرت اختياري
            var o = N.ops[me.id], t = o.op === 'skip' ? null : P(o.target);
            var txt = o.op === 'skip' ? 'تخطى الليلة' : (o.op === 'recruit' ? 'يبي يجنّد ' : 'الهدف: ') + t.name;
            notice(me, o.op === 'skip' ? '⏭️ تخطيت الليلة' : (o.op === 'recruit' ? '🤝 اخترت تجنيد ' : '🔪 اخترت ') + (t ? t.name : ''));
            aliveMafia().forEach(function (m) { if (m !== me) notice(m, '🔪 زميلك ' + me.name + ' · ' + txt, true); });
        } else if (turn === 'doctor') {
            var dt = N.actions[me.id], dp = dt === 'skip' ? null : P(dt);
            notice(me, dp ? '🛡️ تمّت حماية ' + (dp === me ? 'نفسك' : dp.name) + ' الليلة' : '⏭️ ما حميت أحد الليلة');
            aliveRole('doctor').forEach(function (d) { if (d !== me) notice(d, '🛡️ زميلك ' + me.name + ' · ' + (dp ? 'حماية: ' + dp.name : 'تخطى الليلة'), true); });
        } else if (turn === 'detective') deliverReport(me);
        changed();
        if (turnDone()) { G.endsAt = Math.min(G.endsAt, Date.now() + 600); changed(); }
    }

    /** نتيجة فحص المحقق — تطلع لحظة التأكيد (أو نهاية الدور لو ما أكّد)، والمحققين الثانيين يعرفونها */
    function deliverReport(d) {
        var N = G.night, tid = N.actions[d.id];
        if (!tid || N.reports[d.id]) return;
        N.reports[d.id] = true;
        if (tid === 'skip') { notice(d, '⏭️ ما فحصت أحد الليلة'); return; }
        var t = P(tid); if (!t) return;
        var shield = G.effects.find(function (e) { return e.card === 'shield' && e.target === t.id; });
        var mislead = G.effects.find(function (e) { return e.card === 'mislead' && e.target === t.id; });
        var res;
        if (shield) { res = 'town'; N.triggered.push(shield); }   // الحماية: عضو المافيا يطلع للمحقق «من المدينة»
        else if (mislead) { res = 'mafia'; N.triggered.push(mislead); }
        else if (N.unscanned[t.id]) { res = 'town'; t.disguisedScanned = true; }
        else res = t.faction === 'mafia' ? 'mafia' : 'town';
        var word = res === 'mafia' ? 'مافيا 🔪' : 'مواطن ✓';
        d.inspections.push({ round: G.round, id: t.id, res: res });
        notice(d, '🔍 نتيجة فحص ' + t.name + ': ' + word);
        aliveRole('detective').forEach(function (o) {
            if (o === d) return;
            o.inspections.push({ round: G.round, id: t.id, res: res, by: d.id });   // المحققين يعرفون فحوصات بعض
            notice(o, '🔍 زميلك ' + d.name + ' · فحص ' + t.name + ': ' + word, true);
        });
    }

    // ---- حد الشخصين: الفريق (المافيا/الأطباء/المحققين) يختار شخص واحد لو اتفقوا، أو شخصين لو اختلفوا — أكثر ممنوع.
    // picks: {لاعب: هدف} للفريق. لو الباقين (غيري) اختاروا شخصين مختلفين، أقدر أختار واحد منهم بس.
    var MAX_TARGETS = 2;
    function teamTargets(picks, exceptId) {
        var out = [];
        Object.keys(picks).forEach(function (pid) { var t = picks[pid]; if (pid !== exceptId && t && t !== 'skip' && out.indexOf(t) < 0) out.push(t); });
        return out;
    }
    function targetAllowed(picks, meId, target) { var ts = teamTargets(picks, meId); return ts.length < MAX_TARGETS || ts.indexOf(target) >= 0; }
    function opPicks(N) { var o = {}; Object.keys(N.ops).forEach(function (k) { o[k] = N.ops[k].op === 'skip' ? 'skip' : N.ops[k].target; }); return o; }
    function rolePicks(N, role) { var o = {}; aliveRole(role).forEach(function (d) { if (N.actions[d.id]) o[d.id] = N.actions[d.id]; }); return o; }

    // قرار المافيا ينحسب بنهاية دورهم (عشان كرت الحماية/التضليل يأثر على فحص المحقق اللي بعدهم)
    function resolveMafiaDecision() {
        var N = G.night; if (N.dec) return N.dec;
        var mafs = aliveMafia();
        // عملية المافيا: نوع العملية بالأكثرية (قتل/تجنيد/تخطي)، والقتل يشمل كل الأهداف المختلفة (شخص أو شخصين لو اختلفوا)
        var mops = mafs.map(function (m) { return N.ops[m.id]; }).filter(Boolean);
        var nKill = mops.filter(function (o) { return o.op === 'kill'; }).length, nRec = mops.filter(function (o) { return o.op === 'recruit'; }).length, nSkip = mops.length - nKill - nRec;
        var op = null, killTargets = [];
        var validT = function (t) { return t && t.alive && t.faction !== 'mafia' && G.mafiaPrev.indexOf(t.id) < 0; };
        if (nSkip > nKill + nRec) op = null;   // أغلبهم تخطّوا
        else if (nRec > nKill && available('recruit')) op = plurality(mops.filter(function (o) { return o.op === 'recruit'; }));   // تعادل أهداف التجنيد = بدون تجنيد
        else if (nKill) {
            mops.forEach(function (o) { if (o.op === 'kill' && killTargets.indexOf(o.target) < 0) killTargets.push(o.target); });
            killTargets = killTargets.map(P).filter(validT).slice(0, MAX_TARGETS);
            op = killTargets.length ? { op: 'kill' } : null;
        }
        var card = plurality(mafs.map(function (m) { return N.cards[m.id]; }).filter(Boolean));
        if (card && card.card === 'none') card = null;
        if (op && op.op === 'recruit') card = null;   // التجنيد بديل القتل وما يجتمع مع كرت
        var opTarget = op && op.op === 'recruit' ? P(op.target) : null;
        if (op && op.op === 'recruit' && !validT(opTarget)) { op = null; opTarget = null; }
        G.mafiaPrev = op ? (op.op === 'kill' ? killTargets.map(function (t) { return t.id; }) : [opTarget.id]) : [];   // المافيا ما يستهدفون نفس الشخص ليلتين ورا بعض

        // ---- الكرت المساعد
        var cardTarget = card && P(card.target);
        if (card && (!available(card.card) || !cardTarget || !cardTarget.alive ||
            (card.card === 'shield') !== (cardTarget.faction === 'mafia') ||
            (card.card === 'silence' && killTargets.some(function (t) { return t.id === card.target; })))) card = null;   // يرفض بدون حرق
        if (card) {
            G.usedCards.push(card.card);
            if (card.card === 'shield' || card.card === 'mislead') G.effects.push({ card: card.card, target: card.target, expires: G.round + 1 });
            if (card.card === 'silence') G.silenceNext = [card.target];
            mafs.forEach(function (m) { notice(m, '🃏 استخدمتوا كرت ' + CARD_NAMES[card.card] + ' على ' + cardTarget.name + '.'); });
        }
        N.dec = { op: op, killTargets: killTargets, opTarget: opTarget, card: card, cardTarget: cardTarget };
        return N.dec;
    }

    function resolveNight() {
        var N = G.night, mafs = aliveMafia(), D = resolveMafiaDecision();
        var op = D.op, killTargets = D.killTargets, opTarget = D.opTarget, card = D.card, cardTarget = D.cardTarget;

        // ---- الأطباء
        var protectedIds = {};
        aliveRole('doctor').forEach(function (d) {
            var t = N.actions[d.id];
            if (!t || t === 'skip') return;
            protectedIds[t] = (protectedIds[t] || []).concat(d);
            if (t === d.id) d.doctorSelfUsed = true;
        });

        // ---- المحققين: نتائجهم وصلت وقت دورهم (deliverReport) — هنا نحرق التأثيرات اللي انكشفت بس
        aliveRole('detective').forEach(function (d) { deliverReport(d); });   // احتياط (لو دورهم ما مرّ)
        var inspectShot = G.players.some(function (p) { return p.role === 'detective' && N.actions[p.id] && N.actions[p.id] !== 'skip'; });
        G.effects = G.effects.filter(function (e) { return N.triggered.indexOf(e) < 0 && e.expires > G.round; });

        // ---- عملية المافيا
        var victims = [], saveds = [], recruited = null;
        if (op && op.op === 'kill') killTargets.forEach(function (t) {
            if (protectedIds[t.id]) {
                saveds.push(t);
                protectedIds[t.id].forEach(function (d) { notice(d, '💊 نجحت في حماية ' + t.name + ' من هجوم.'); });
            } else { victims.push(t); t.alive = false; t.diedRound = G.round; t.cause = 'mafia'; }
        });
        else if (op && op.op === 'recruit') {
            if ((mafs.length + 1) / alive().length <= RECRUIT_CAP) {
                recruited = opTarget;
                // أي لاعب من المدينة (حتى الطبيب والمحقق) يفقد قدرته ويصير مافيا، ويبقى بشات دوره القديم بدون ما يدرون
                if (recruited.role === 'doctor' || recruited.role === 'detective') recruited.formerRole = recruited.role;
                recruited.role = 'mafia'; recruited.faction = 'mafia'; recruited.recruitedRound = G.round; recruited.mafiaSince = chatSeq;
                G.usedCards.push('recruit');
                notice(recruited, '🃏 تم تجنيدك! أنت الحين من المافيا، وفقدت دورك وقدرتك السابقة.');
                mafs.forEach(function (m) { notice(m, '🃏 نجح التجنيد: ' + recruited.name + ' انضم للمافيا.'); });
            } else mafs.forEach(function (m) { notice(m, 'التجنيد ما تنفّذ لأن المافيا بتتجاوز 30% من الأحياء — الكرت محفوظ.'); });
        }

        if (card && card.card === 'reveal') aliveMafia().forEach(function (m) { notice(m, '🃏 كشف الهوية: ' + cardTarget.name + ' دوره ' + ROLE_NAMES[cardTarget.role] + '.'); });

        // ---- مشاهد البث (مين انجنّد سر، بس الكل يعرف إن فيه تجنيد)
        var seq = [], at = 0;
        function shot(k, extra) { seq.push(Object.assign({ k: k, at: at, dur: SHOT[k] }, extra || {})); at += SHOT[k]; }
        shot('intro');
        if (inspectShot) shot('inspect');   // المشتبه ما ينكشف على البث
        if (op && op.op === 'kill') {
            // لقطة هجوم وحدة: الهدف يمشي بالسوق والمافيا وراه — ولو هدفين (target2) يمشون الاثنين ووراهم مافيا ثاني.
            // بعدها لقطة إنقاذ وحدة لو أحد انحمى: طبيب لكل واحد انحمى (rescue)، واللي ما انحمى يبقى طايح
            var a = killTargets[0], b = killTargets[1] || null, rescue = saveds.map(function (t) { return t.id; });
            shot('attack', b ? { target: a.id, target2: b.id, saved: saveds.indexOf(a) >= 0, saved2: saveds.indexOf(b) >= 0 } : { target: a.id, saved: saveds.indexOf(a) >= 0 });
            if (rescue.length) shot('save', b ? { target: a.id, target2: b.id, rescue: rescue } : { target: a.id });
        } else shot('quiet');
        // الطبيب: لو حمى أحد (وما صار إنقاذ) مشهد علاج بدون ما ينكشف مين، ولو ما اختار أحد نوضّح هالشي
        if (S.doctors > 0 && !saveds.length) {
            var docActed = G.players.some(function (p) { return p.role === 'doctor' && N.actions[p.id] && N.actions[p.id] !== 'skip'; });
            shot(docActed ? 'heal' : 'noheal');
        }
        var ids = function (l) { return l.map(function (t) { return t.id; }); };
        // victim/saved = أول واحد (للتوافق مع الشاشات القديمة)، victims/saveds = القائمة كاملة
        shot('result', { victim: victims[0] ? victims[0].id : null, saved: saveds[0] ? saveds[0].id : null, victims: ids(victims), saveds: ids(saveds), recruited: !!recruited });

        G.lastNight = { round: G.round, victim: victims[0] ? victims[0].id : null, saved: saveds[0] ? saveds[0].id : null, victims: ids(victims), saveds: ids(saveds), recruited: !!recruited };   // ملخص الليلة لشاشة النقاش
        // وش صار بالليلة — يوصل لكل اللاعبين («الأحداث» بالجوال) ولسجل شاشة البث. مين من المافيا اختار يبقى سر،
        // وحماية الطبيب تنكشف بس لو المافيا هاجموا نفس الشخص فعلاً
        victims.forEach(function (v) { sys('🔪 المافيا استهدفت ' + v.name + ' — ما نجا وطلع من اللعبة'); });
        saveds.forEach(function (v) { sys('🛡️ المافيا استهدفت ' + v.name + ' — بس الطبيب حماه ونجا 💚'); });
        if (recruited) sys('🤝 المافيا جنّدت لاعب الليلة — مين؟ سر');
        if (!victims.length && !saveds.length && !recruited) sys('🌙 ليلة هادية — المافيا ما استهدفت أحد');

        G.seq = seq;
        go('dawn', at);
    }

    function winner() {
        var m = aliveMafia().length, rest = alive().length - m;
        if (m === 0) return 'town';
        if (m >= rest) return 'mafia';
        return null;
    }

    function finish(w) {
        G.winner = w; G.endedAt = Date.now();
        sys(w === 'mafia' ? '🏆 فازت المافيا!' : '🏆 المواطنين تخلّصوا من المافيا!');
        go('over', 0);
    }

    function afterDawn() {
        var w = winner(); if (w) return finish(w);
        G.votes = {};
        G.silenced = G.silenceNext; G.silenceNext = [];   // الإسكات يبدأ مع النهار ويحترق هنا
        sys('☀️ اليوم ' + G.round + ': بدأ النقاش.');
        go('day', S.talkSec * 1000);
    }

    function startVote() { G.votes = {}; G.voteOk = {}; sys('🗳️ بدأ التصويت.'); go('vote', S.voteSec * 1000); }

    function resolveVote() {
        var tally = {}, best = 0, top = [];
        alive().forEach(function (p) {
            var v = G.votes[p.id]; if (!v) return;
            // «تخطي» خيار ينافس مثل أي لاعب: لو أخذ أكثر الأصوات ما أحد يطلع (الأكثرية تحكم حتى لو كانت تخطي)
            if (v !== 'skip') { var t = P(v); if (!t || !t.alive) return; }
            tally[v] = (tally[v] || 0) + 1;
        });
        Object.keys(tally).forEach(function (t) { if (tally[t] > best) { best = tally[t]; top = [t]; } else if (tally[t] === best) top.push(t); });
        var skipWon = top.length === 1 && top[0] === 'skip';
        var out = top.length === 1 && !skipWon ? P(top[0]) : null;
        G.verdict = { id: out ? out.id : null, tie: top.length > 1, skip: skipWon, tally: tally, team: out ? out.faction : null, votes: best };
        if (out) {
            out.alive = false; out.diedRound = G.round; out.cause = 'vote';
            G.lastExile = { round: G.round, id: out.id, team: out.faction, role: S.fullReveal ? out.role : null };
            sys('⚖️ ' + out.name + ' طلع بالتصويت بـ' + best + ' صوت — كان ' + (S.fullReveal ? ROLE_NAMES[out.role] : out.faction === 'mafia' ? 'من المافيا 🔪' : 'مواطن 🏠'));
        } else sys(skipWon ? '⏭️ ما أحد طلع بالتصويت — «تخطي» أخذ أكثر الأصوات (' + best + ')' : top.length > 1 ? '⚖️ ما أحد طلع بالتصويت — تعادل بالأصوات' : '⚖️ ما أحد طلع بالتصويت — ما فيه أصوات');
        // مين صوّت لمين (سطر لكل خيار بأكثر الأصوات) — لكل اللاعبين بـ«الأحداث»
        var groups = {};
        Object.keys(G.votes).forEach(function (vid) { var t = G.votes[vid], vp = P(vid); if (!vp || (t !== 'skip' && !P(t))) return; (groups[t] = groups[t] || []).push(vp.name); });
        var gk = Object.keys(groups).sort(function (a, b) { return groups[b].length - groups[a].length; });
        if (gk.length) sys('🗳️ مين صوّت لمين:\n' + gk.map(function (k) {
            var l = groups[k]; return (k === 'skip' ? '⏭️ تخطي' : P(k).name) + ' (' + l.length + '): ' + l.slice(0, 12).join('، ') + (l.length > 12 ? ' +' + (l.length - 12) : '');
        }).join('\n'));
        G.silenced = [];
        go('verdict', VERDICT_MS);
    }

    function afterVerdict() { var w = winner(); if (w) return finish(w); startNight(); }

    function next() {
        var ph = G.phase;
        if (ph === 'reveal') startNight();
        else if (ph === 'night') nextTurn();
        else if (ph === 'dawn') afterDawn();
        else if (ph === 'day') startVote();
        else if (ph === 'vote') resolveVote();
        else if (ph === 'verdict') afterVerdict();
    }

    function tick(now) { if (G.endsAt && now >= G.endsAt) next(); }

    function roleChatOpen(ch) { return (ch === 'doctor' ? S.doctors : S.detectives) > 1; }
    // الشاتات الخاصة اللي لها فايدة لهاللاعب: لازم يكون معه أحد حي بنفس الشات (مافيا لحاله أو طبيب وحيد = بدون شات)
    function privChatsOf(me) {
        var out = []; if (!me || !me.alive) return out;
        if (me.faction === 'mafia' && aliveMafia().length > 1) out.push('mafia');
        ['doctor', 'detective'].forEach(function (ch) {
            if (roleChatOpen(ch) && inRoleChat(me, ch) && G.players.filter(function (p) { return inRoleChat(p, ch); }).length > 1) out.push(ch);
        });
        return out;
    }
    function inRoleChat(p, ch) { return !!p && p.alive && (p.role === ch || p.formerRole === ch); }   // المجنّد يبقى بشات دوره القديم

    function chat(me, arg) {
        // الصيغة: 'قناة|نص' أو 'قناة#رقم_الرسالة|نص' للرد على رسالة بنفس القناة
        var raw = String(arg == null ? '' : arg), bar = raw.indexOf('|');
        var head = /^([a-z]+)(?:#(\d+))?$/.exec(bar > 0 ? raw.slice(0, bar) : 'city') || [null, 'city', null];
        var ch = head[1], reN = head[2] ? +head[2] : 0, text = (bar > 0 ? raw.slice(bar + 1) : raw).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
        if (!text || !me.alive) return;
        if (ch === 'mafia') { if (me.faction !== 'mafia' || G.phase === 'over') return; }
        else if (ch === 'doctor' || ch === 'detective') {
            // شات خاص للأطباء/المحققين طول المباراة مثل المافيا (ينسّقون بالليل وقت دورهم)، لو عددهم أكثر من واحد (الإسكات ما يشمله)
            if (!roleChatOpen(ch) || !inRoleChat(me, ch) || G.phase === 'over') return;
        } else if (ch === 'city' || ch === 'district') {
            if (G.phase !== 'day') return;                       // الشات العام وشات الحي بالنقاش فقط
            if (G.silenced.indexOf(me.id) >= 0) return;          // المسكَت يصوّت بس
            if (ch === 'district' && G.districts < 2) ch = 'city';
        } else return;
        var now = Date.now();
        // حد الإرسال: رصيد 5 رسائل يرجع منها وحدة كل ثانية (يسمح بالكتابة السريعة ويمنع السبام)
        me._chatTok = Math.min(5, (me._chatTok == null ? 5 : me._chatTok) + (now - (me._lastChat || now)) / 1000);
        me._lastChat = now;
        if (me._chatTok < 1) return;
        me._chatTok -= 1;
        var re = null;
        if (reN) {
            var orig = G.chat.find(function (c) { return c.n === reN && !c.sys && c.ch === ch && (ch !== 'district' || c.d === me.district); });
            if (orig) re = { n: orig.n, from: orig.from, text: orig.text.slice(0, 80) };
        }
        G.chat.push({ n: ++chatSeq, from: me.id, ch: ch, d: ch === 'district' ? me.district : undefined, text: text, at: now, re: re || undefined }); trimChat();
        changed();
    }

    function act(id, a, arg) {
        var me = P(id); if (!me) return;
        if (a === 'chat') return chat(me, arg);
        if (!me.alive) return;
        var N = G.night;
        if (G.phase === 'night') {
            var turn = G.turn;
            if (a === 'confirm') return confirm(me);
            if (N.confirmed[id]) return;   // بعد التأكيد ما يتغيّر شي
            if (a === 'kill' && arg === 'skip' && me.faction === 'mafia' && turn === 'mafia') N.ops[id] = { op: 'skip' };   // تخطي: ما يقتلون أحد
            else if ((a === 'kill' || a === 'recruit') && me.faction === 'mafia' && turn === 'mafia') {
                var t = P(String(arg || ''));
                if (!t || !t.alive || t.faction === 'mafia' || G.mafiaPrev.indexOf(t.id) >= 0) return;   // ممنوع نفس هدف الليلة اللي فاتت
                if (!targetAllowed(opPicks(N), id, t.id)) return;   // الفريق اختار شخصين مختلفين: واحد منهم بس
                if (a === 'recruit' && !available('recruit')) return;
                N.ops[id] = { op: a, target: t.id };
            } else if (a === 'card' && me.faction === 'mafia' && turn === 'mafia') {
                var parts = String(arg || '').split('|'), c = parts[0], ct = P(parts[1] || '');
                if (c === 'none') N.cards[id] = { card: 'none' };
                else {
                    if (['shield', 'reveal', 'mislead', 'silence'].indexOf(c) < 0 || !available(c) || !ct || !ct.alive) return;
                    if ((c === 'shield') !== (ct.faction === 'mafia')) return;   // الحماية لعضو مافيا، والباقي لأحد من المدينة
                    N.cards[id] = { card: c, target: ct.id };
                }
            } else if ((a === 'protect' || a === 'inspect') && arg === 'skip' && me.role === (a === 'protect' ? 'doctor' : 'detective') && turn === me.role) {
                N.actions[id] = 'skip';   // تخطي الليلة
            } else if (a === 'protect' && me.role === 'doctor' && turn === 'doctor') {
                var dt = P(String(arg || ''));
                if (!dt || !dt.alive || (dt.id === id && me.doctorSelfUsed)) return;
                if (!targetAllowed(rolePicks(N, 'doctor'), id, dt.id)) return;   // الأطباء: شخصين بالكثير
                N.actions[id] = dt.id;
            } else if (a === 'inspect' && me.role === 'detective' && turn === 'detective') {
                var it = P(String(arg || ''));
                if (!it || !it.alive || it.id === id) return;   // يقدر يغيّر لين يأكّد
                if (!targetAllowed(rolePicks(N, 'detective'), id, it.id)) return;   // المحققين: شخصين بالكثير
                N.actions[id] = it.id;
            } else return;
            changed();
            return;
        }
        if (G.phase === 'vote' && (a === 'vote' || a === 'confirm')) {
            if (G.voteOk[id]) return;   // التصويت المؤكَّد ما يتغيّر
            if (a === 'confirm') { if (!G.votes[id]) return; G.voteOk[id] = true; }
            else if (arg === 'skip') G.votes[id] = 'skip';
            else { var vt = P(String(arg || '')); if (!vt || !vt.alive || vt.id === id) return; G.votes[id] = vt.id; }
            changed();
            // الكل أكّد ← النتيجة بعد ثانيتين (اللي صوّت وما أكّد ينحسب صوته بنهاية الوقت)
            if (alive().every(function (p) { return G.voteOk[p.id]; })) { G.endsAt = Math.min(G.endsAt, Date.now() + 2000); changed(); }
        }
    }

    /** المذيع: ينهي المرحلة الحالية (تخطي النقاش/التصويت/المشهد). */
    function endStage() { if (G.phase !== 'over') next(); }

    /** لاعب انطرد/طلع وسط المباراة. */
    function remove(id) {
        var p = P(id); if (!p || !p.alive) return;
        p.alive = false; p.diedRound = G.round; p.cause = 'left';
        sys(p.name + ' طلع من اللعبة');
        if (G.phase !== 'over') { var w = winner(); if (w && G.phase !== 'dawn' && G.phase !== 'verdict') finish(w); }
        changed();
    }

    // ضحية الليل تبقى «حية» بحالة البث لين تنتهي لقطة الهجوم، عشان ما ينكشف قبل المشهد
    function hiddenDeath(p) {
        if (G.phase !== 'dawn' || p.cause !== 'mafia' || p.diedRound !== G.round) return false;
        var atk = G.seq.find(function (s) { return s.k === 'attack'; });
        // الهدف الثاني يطيح بعد الأول بشوي (PAIR_DU بالمشهد)
        return !atk || Date.now() < G.phaseAt + atk.at + ATTACK_DOWN_MS + (atk.target2 === p.id ? 400 : 0);
    }

    /** وش ينكشف عن لاعب ميت للكل: الدور كامل (fullReveal) أو الفريق للمطرود بالتصويت (القواعد). */
    function deadInfo(p) {
        if (p.alive || hiddenDeath(p)) return {};
        if (S.fullReveal && p.cause !== 'left' && p.cause !== 'idle') return { role: p.role, team: p.faction };
        if (p.cause === 'vote') return { team: p.faction };
        return {};
    }

    function view(id) {
        var isHost = id === 'host', me = !isHost && P(id), over = G.phase === 'over';
        var meMafia = !!(me && me.alive && me.faction === 'mafia');
        // زملاء الدور: الطبيب يشوف الأطباء الأحياء، والمحقق يشوف المحققين (والمجنّد يبقى معهم مثل شاتهم)
        var mateRole = !over && me && me.alive ? (['doctor', 'detective'].filter(function (r) { return inRoleChat(me, r); })[0] || null) : null;
        var players = G.players.map(function (p) {
            var o = { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok, seat: p.seat, district: p.district, alive: p.alive || hiddenDeath(p), cause: hiddenDeath(p) ? null : p.cause, diedRound: p.diedRound, role: null, team: null };
            if (over) { o.role = p.originalRole; o.finalRole = p.role; o.team = p.faction; o.recruited = !!p.recruitedRound; }
            else if (p === me) { o.role = p.role; o.team = p.faction; }
            else if (meMafia && p.faction === 'mafia') { o.role = p.role; o.team = 'mafia'; o.mate = 'mafia'; }   // المافيا يعرفون بعض حتى المتخفي والمجنّد
            else if (mateRole && inRoleChat(p, mateRole)) { o.role = mateRole; o.mate = mateRole; }   // الأطباء يعرفون بعض، والمحققين كذلك (بدون كشف الفريق)
            else { var d = deadInfo(p); o.role = d.role || null; o.team = d.team || null; }
            return o;
        });
        var chat = G.chat.filter(function (c) {
            if (c.ch === 'mafia') return meMafia && c.n > me.mafiaSince;
            if (c.ch === 'doctor' || c.ch === 'detective') return inRoleChat(me, c.ch);   // المجنّد يبقى فيه
            if (c.ch === 'district') return !!me && c.d === me.district;
            return true;
        });
        var v = {
            id: G.id, phase: G.phase, round: G.round, startedAt: G.startedAt, phaseAt: G.phaseAt, endsAt: G.endsAt, endedAt: G.endedAt || 0,
            settings: S, districts: G.districts, players: players, winner: G.winner,
            chat: chat.slice(isHost ? -60 : -120),
            votes: G.phase === 'vote' || G.phase === 'verdict' ? G.votes : {},
            verdict: G.verdict,
            seq: G.phase === 'dawn' ? G.seq : [],
            silenced: G.phase === 'day' ? G.silenced : [],
            lastNight: G.phase === 'dawn' ? null : G.lastNight || null,   // وقت مشاهد الفجر ما ينكشف قبل اللقطة
            lastExile: G.lastExile || null,
            cards: over ? G.cards.map(function (c) { return { id: c, name: CARD_NAMES[c], used: G.usedCards.indexOf(c) >= 0 }; }) : null
        };
        // دور الليل الحالي (بدون عدد اللي خلّصوا: العدد يكشف كم مافيا/طبيب باقي حي)
        v.turn = G.phase === 'night' ? G.turn : null;
        if (me) {
            v.me = {
                id: me.id, role: me.role, team: me.faction, alive: me.alive, district: me.district, formerRole: me.formerRole || null,
                privChats: privChatsOf(me),
                silenced: G.phase === 'day' && G.silenced.indexOf(me.id) >= 0,
                notices: me.notices.slice(-20), inspections: me.role === 'detective' || me.inspections.length ? me.inspections : undefined
            };
            if (me.role === 'doctor') v.me.doctorSelfUsed = me.doctorSelfUsed;
            if (G.phase === 'night' && G.night) {
                v.me.confirmed = !!G.night.confirmed[me.id];
                // مين من فريقي أكّد (المافيا يشوفون المافيا، والأطباء الأطباء، والمحققين المحققين)
                var mates = meMafia ? aliveMafia() : aliveRole(me.role);
                if (meMafia || me.role === 'doctor' || me.role === 'detective') { v.me.teamDone = {}; mates.forEach(function (p) { v.me.teamDone[p.id] = !!G.night.confirmed[p.id]; }); }
                if (meMafia) { v.me.ops = G.night.ops; v.me.cardVotes = G.night.cards; v.me.mafiaPrev = G.mafiaPrev; }
                if (me.role === 'doctor') { v.me.protect = G.night.actions[me.id] || null; v.me.teamPicks = rolePicks(G.night, 'doctor'); }
                if (me.role === 'detective') { v.me.inspect = G.night.actions[me.id] || null; v.me.teamPicks = rolePicks(G.night, 'detective'); }
            }
            if (meMafia && !over) v.cards = G.cards.map(function (c) { return { id: c, name: CARD_NAMES[c], used: G.usedCards.indexOf(c) >= 0, available: available(c) }; });
            if (G.phase === 'vote' || G.phase === 'verdict') { v.me.vote = G.votes[me.id] || null; v.me.voteOk = !!G.voteOk[me.id]; }
        }
        return v;
    }

    sys('بدأت المباراة: ' + G.players.length + ' لاعب' + (G.districts > 1 ? ' في ' + G.districts + ' أحياء' : '') + ' — شوفوا أدواركم على جوالاتكم');
    changed();
    return { G: G, tick: tick, act: act, endStage: endStage, remove: remove, view: view, _available: available };
}

module.exports = { createGame: createGame, SHOT: SHOT, REVEAL_MS: REVEAL_MS, VERDICT_MS: VERDICT_MS, CARDS: CARDS, CARD_NAMES: CARD_NAMES, ROLE_NAMES: ROLE_NAMES, DISTRICT_SIZE: DISTRICT_SIZE };
