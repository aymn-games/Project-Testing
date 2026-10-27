/**
 * «المافيا» — منطق المباراة على الخادم (الخادم هو الحكم)، حسب قواعد «مدينة المافيا» 1.0.
 *
 * المراحل: reveal (كشف الأدوار على الجوالات) → night (الاختيار من الجوالات)
 *   → dawn (مشاهد الليل على شاشة البث) → day (النقاش) → vote (التصويت)
 *   → verdict (النتائج ومشهد الطرد) → night … حتى over.
 *
 * الأدوار: مواطن · مافيا · متخفي (من المافيا؛ أول فحص ناجح له يطلع «من المدينة») ·
 *   طبيب (ما يكرر نفس الشخص ليلتين ورا بعض، ويحمي نفسه مرة وحدة بالمباراة) ·
 *   محقق (النتيجة: مافيا / من المدينة / تعذر التحقيق). الفريق: faction = 'mafia' | 'town'.
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
 *     وإشعاراته الخاصة (نتائج المحقق، إنقاذ الطبيب، كشف الهوية، التجنيد).
 */
'use strict';

var REVEAL_MS = 8000;
var VERDICT_MS = 12000;
var CHAT_MAX = 200;
var DISTRICT_SIZE = 25;
var RECRUIT_CAP = 0.30;
var CARDS = ['recruit', 'shield', 'reveal', 'mislead', 'silence'];
var CARD_NAMES = { recruit: 'التجنيد', shield: 'الحماية', reveal: 'كشف الهوية', mislead: 'التضليل', silence: 'الإسكات' };
var ROLE_NAMES = { citizen: 'مواطن', mafia: 'مافيا', disguised: 'متخفي', doctor: 'طبيب', detective: 'محقق' };
// أطوال لقطات الفجر (لازم تطابق مدد المشاهد في games/mafia/mafia-scene.js)
var SHOT = { intro: 3000, inspect: 6500, attack: 7000, save: 6000, quiet: 5000, result: 5000 };

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
                disguisedScanned: false, doctorPrev: null, doctorSelfUsed: false,
                mafiaSince: 0, notices: [], inspections: []
            };
        }),
        cards: shuffle(CARDS.slice()).slice(0, 3), usedCards: [], effects: [], silenced: [], silenceNext: [],
        night: null, seq: [], chat: [], votes: {}, verdict: null, winner: null
    };
    var chatSeq = 0;

    function changed() { if (hooks && hooks.onChange) hooks.onChange(); }
    function P(id) { return G.players.find(function (p) { return p.id === id; }); }
    function alive() { return G.players.filter(function (p) { return p.alive; }); }
    function aliveRole(r) { return alive().filter(function (p) { return p.role === r; }); }
    function aliveMafia() { return alive().filter(function (p) { return p.faction === 'mafia'; }); }
    function go(phase, ms) { G.phase = phase; G.phaseAt = Date.now(); G.endsAt = ms ? G.phaseAt + ms : 0; changed(); }
    function available(card) { return G.cards.indexOf(card) >= 0 && G.usedCards.indexOf(card) < 0 && G.round >= (card === 'recruit' ? 3 : 2); }
    function notice(p, text) { p.notices.push({ round: G.round, text: text, at: Date.now() }); if (p.notices.length > 40) p.notices.shift(); }

    function sys(text) { G.chat.push({ n: ++chatSeq, sys: true, ch: 'city', text: text, at: Date.now() }); trimChat(); }
    function trimChat() { if (G.chat.length > CHAT_MAX) G.chat.splice(0, G.chat.length - CHAT_MAX); }

    G.players.forEach(function (p) {
        notice(p, 'دورك: ' + ROLE_NAMES[p.role] + (p.faction === 'mafia' ? ' — تقدر تدخل شات المافيا السري.' : ' — دوّر على المافيا.'));
    });

    function startNight() {
        G.round++;
        G.night = { ops: {}, cards: {}, actions: {} };
        G.votes = {}; G.verdict = null; G.seq = []; G.silenced = [];
        sys('الليلة ' + G.round + ' — الكل يغمّض عيونه');
        go('night', S.nightSec * 1000);
    }

    function anyAuxCard() { return ['shield', 'reveal', 'mislead', 'silence'].some(available); }

    function nightDone() {
        var N = G.night, aux = anyAuxCard();
        return aliveMafia().every(function (m) { return N.ops[m.id] && (!aux || N.cards[m.id]); }) &&
            aliveRole('doctor').every(function (d) { return N.actions[d.id]; }) &&
            aliveRole('detective').every(function (d) { return N.actions[d.id]; });
    }

    function resolveNight() {
        var N = G.night, mafs = aliveMafia();
        var op = plurality(mafs.map(function (m) { return N.ops[m.id]; }).filter(Boolean));
        var card = plurality(mafs.map(function (m) { return N.cards[m.id]; }).filter(Boolean));
        if (card && card.card === 'none') card = null;
        if (op && op.op === 'recruit') { card = null; if (!available('recruit')) op = null; }   // التجنيد بديل القتل وما يجتمع مع كرت
        var opTarget = op && P(op.target);
        if (opTarget && (!opTarget.alive || opTarget.faction === 'mafia')) { op = null; opTarget = null; }

        // ---- الكرت المساعد
        var cardTarget = card && P(card.target);
        if (card && (!available(card.card) || !cardTarget || !cardTarget.alive ||
            (card.card === 'shield') !== (cardTarget.faction === 'mafia') ||
            (card.card === 'silence' && op && op.op === 'kill' && op.target === card.target))) card = null;   // يرفض بدون حرق
        if (card) {
            G.usedCards.push(card.card);
            if (card.card === 'shield' || card.card === 'mislead') G.effects.push({ card: card.card, target: card.target, expires: G.round + 1 });
            if (card.card === 'silence') G.silenceNext = [card.target];
            mafs.forEach(function (m) { notice(m, '🃏 استخدمتوا كرت ' + CARD_NAMES[card.card] + ' على ' + cardTarget.name + '.'); });
        }

        // ---- الأطباء
        var protectedIds = {};
        aliveRole('doctor').forEach(function (d) {
            var t = N.actions[d.id];
            if (!t) { d.doctorPrev = null; return; }
            protectedIds[t] = (protectedIds[t] || []).concat(d);
            d.doctorPrev = t;
            if (t === d.id) d.doctorSelfUsed = true;
        });

        // ---- المحققين (قبل التجنيد: المجنّد يسجّل قدرته قبل ما يتحول)
        var unscanned = {};
        alive().forEach(function (p) { if (p.role === 'disguised' && !p.disguisedScanned) unscanned[p.id] = true; });
        var triggered = [], reports = [], inspectShot = false;
        aliveRole('detective').forEach(function (d) {
            var t = P(N.actions[d.id]); if (!t) return;
            inspectShot = true;
            var shield = G.effects.find(function (e) { return e.card === 'shield' && e.target === t.id; });
            var mislead = G.effects.find(function (e) { return e.card === 'mislead' && e.target === t.id; });
            var res;
            if (shield) { res = 'blocked'; triggered.push(shield); }
            else if (mislead) { res = 'mafia'; triggered.push(mislead); }
            else if (unscanned[t.id]) { res = 'town'; t.disguisedScanned = true; }   // كل المحققين بنفس الليلة يطلع لهم «من المدينة»
            else res = t.faction === 'mafia' ? 'mafia' : 'town';
            reports.push({ d: d, t: t, res: res });
        });
        G.effects = G.effects.filter(function (e) { return triggered.indexOf(e) < 0 && e.expires > G.round; });

        // ---- عملية المافيا
        var victim = null, saved = null, recruited = null;
        if (op && op.op === 'kill') {
            if (protectedIds[opTarget.id]) {
                saved = opTarget;
                protectedIds[opTarget.id].forEach(function (d) { notice(d, '💊 نجحت في حماية ' + opTarget.name + ' من هجوم.'); });
            } else { victim = opTarget; victim.alive = false; victim.diedRound = G.round; victim.cause = 'mafia'; }
        } else if (op && op.op === 'recruit') {
            if ((mafs.length + 1) / alive().length <= RECRUIT_CAP) {
                recruited = opTarget;
                recruited.role = 'mafia'; recruited.faction = 'mafia'; recruited.recruitedRound = G.round; recruited.mafiaSince = chatSeq;
                G.usedCards.push('recruit');
                notice(recruited, '🃏 تم تجنيدك! أنت الحين من المافيا، وفقدت دورك وقدرتك السابقة.');
                mafs.forEach(function (m) { notice(m, '🃏 نجح التجنيد: ' + recruited.name + ' انضم للمافيا.'); });
            } else mafs.forEach(function (m) { notice(m, 'التجنيد ما تنفّذ لأن المافيا بتتجاوز 30% من الأحياء — الكرت محفوظ.'); });
        }

        // ---- النتائج السرية بعد الليل
        reports.forEach(function (r) {
            if (!r.d.alive) return;   // المحقق المقتول ما يستلم نتيجته
            r.d.inspections.push({ round: G.round, id: r.t.id, res: r.res });
            notice(r.d, '🔍 نتيجة فحص ' + r.t.name + ': ' + (r.res === 'mafia' ? 'مافيا' : r.res === 'town' ? 'من المدينة' : 'تعذر التحقيق') + '.');
        });
        if (card && card.card === 'reveal') aliveMafia().forEach(function (m) { notice(m, '🃏 كشف الهوية: ' + cardTarget.name + ' دوره ' + ROLE_NAMES[cardTarget.role] + '.'); });

        // ---- مشاهد البث (التجنيد سري: يطلع كليلة هادية)
        var seq = [], at = 0;
        function shot(k, extra) { seq.push(Object.assign({ k: k, at: at, dur: SHOT[k] }, extra || {})); at += SHOT[k]; }
        shot('intro');
        if (inspectShot) shot('inspect');   // المشتبه ما ينكشف على البث
        if (op && op.op === 'kill') {
            shot('attack', { target: opTarget.id, saved: !!saved });
            if (saved) shot('save', { target: opTarget.id });
        } else shot('quiet');
        shot('result', { victim: victim ? victim.id : null, saved: saved ? saved.id : null });

        if (victim) sys('🌙 تم إقصاء ' + victim.name + ' أثناء الليل.');
        else if (saved) sys('💊 الطبيب أنقذ ' + saved.name + ' من هجوم المافيا!');
        else sys('🌙 انتهى الليل دون إقصاء أحد.');

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
        sys(w === 'mafia' ? '🏆 المافيا سيطرت على المدينة!' : '🏆 المدينة تخلّصت من المافيا!');
        go('over', 0);
    }

    function afterDawn() {
        var w = winner(); if (w) return finish(w);
        G.votes = {};
        G.silenced = G.silenceNext; G.silenceNext = [];   // الإسكات يبدأ مع النهار ويحترق هنا
        sys('☀️ اليوم ' + G.round + ': بدأ النقاش.');
        go('day', S.talkSec * 1000);
    }

    function startVote() { G.votes = {}; sys('🗳️ بدأ التصويت.'); go('vote', S.voteSec * 1000); }

    function resolveVote() {
        var tally = {}, best = 0, top = [];
        alive().forEach(function (p) {
            var v = G.votes[p.id]; if (!v || v === 'skip') return;   // الامتناع ما ينحسب
            var t = P(v); if (!t || !t.alive) return;
            tally[v] = (tally[v] || 0) + 1;
        });
        Object.keys(tally).forEach(function (t) { if (tally[t] > best) { best = tally[t]; top = [t]; } else if (tally[t] === best) top.push(t); });
        var out = top.length === 1 ? P(top[0]) : null;
        G.verdict = { id: out ? out.id : null, tie: top.length > 1, tally: tally, team: out ? out.faction : null, votes: best };
        if (out) {
            out.alive = false; out.diedRound = G.round; out.cause = 'vote';
            sys('🗳️ تم طرد ' + out.name + ' (' + (out.faction === 'mafia' ? 'مافيا' : 'من المدينة') + ') بـ' + best + ' صوت.');
        } else sys(top.length > 1 ? 'لم يُقصَ أحد: تعادل في التصويت.' : 'لم يُقصَ أحد: ما فيه أصوات.');
        G.silenced = [];
        go('verdict', VERDICT_MS);
    }

    function afterVerdict() { var w = winner(); if (w) return finish(w); startNight(); }

    function next() {
        var ph = G.phase;
        if (ph === 'reveal') startNight();
        else if (ph === 'night') resolveNight();
        else if (ph === 'dawn') afterDawn();
        else if (ph === 'day') startVote();
        else if (ph === 'vote') resolveVote();
        else if (ph === 'verdict') afterVerdict();
    }

    function tick(now) { if (G.endsAt && now >= G.endsAt) next(); }

    function chat(me, arg) {
        var raw = String(arg == null ? '' : arg), bar = raw.indexOf('|');
        var ch = bar > 0 ? raw.slice(0, bar) : 'city', text = (bar > 0 ? raw.slice(bar + 1) : raw).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 140);
        if (!text || !me.alive) return;
        if (ch === 'mafia') { if (me.faction !== 'mafia' || G.phase === 'over') return; }
        else if (ch === 'city' || ch === 'district') {
            if (G.phase !== 'day') return;                       // الشات العام وشات الحي بالنقاش فقط
            if (G.silenced.indexOf(me.id) >= 0) return;          // المسكَت يصوّت بس
            if (ch === 'district' && G.districts < 2) ch = 'city';
        } else return;
        var now = Date.now();
        if (me._lastChat && now - me._lastChat < 1500) return;
        me._lastChat = now;
        G.chat.push({ n: ++chatSeq, from: me.id, ch: ch, d: ch === 'district' ? me.district : undefined, text: text, at: now }); trimChat();
        changed();
    }

    function act(id, a, arg) {
        var me = P(id); if (!me) return;
        if (a === 'chat') return chat(me, arg);
        if (!me.alive) return;
        var N = G.night;
        if (G.phase === 'night') {
            if ((a === 'kill' || a === 'recruit') && me.faction === 'mafia') {
                var t = P(String(arg || ''));
                if (!t || !t.alive || t.faction === 'mafia') return;
                if (a === 'recruit' && !available('recruit')) return;
                N.ops[id] = { op: a, target: t.id };
            } else if (a === 'card' && me.faction === 'mafia') {
                var parts = String(arg || '').split('|'), c = parts[0], ct = P(parts[1] || '');
                if (c === 'none') N.cards[id] = { card: 'none' };
                else {
                    if (['shield', 'reveal', 'mislead', 'silence'].indexOf(c) < 0 || !available(c) || !ct || !ct.alive) return;
                    if ((c === 'shield') !== (ct.faction === 'mafia')) return;   // الحماية لعضو مافيا، والباقي لأحد من المدينة
                    N.cards[id] = { card: c, target: ct.id };
                }
            } else if (a === 'protect' && me.role === 'doctor') {
                var dt = P(String(arg || ''));
                if (!dt || !dt.alive || dt.id === me.doctorPrev || (dt.id === id && me.doctorSelfUsed)) return;
                N.actions[id] = dt.id;
            } else if (a === 'inspect' && me.role === 'detective') {
                var it = P(String(arg || ''));
                if (!it || !it.alive || it.id === id || N.actions[id]) return;   // فحص واحد بالليلة وما يتغيّر
                N.actions[id] = it.id;
            } else return;
            changed();
            if (nightDone()) { G.endsAt = Math.min(G.endsAt, Date.now() + 2500); changed(); }
            return;
        }
        if (G.phase === 'vote' && a === 'vote') {
            if (arg === 'skip') G.votes[id] = 'skip';
            else { var vt = P(String(arg || '')); if (!vt || !vt.alive || vt.id === id) return; G.votes[id] = vt.id; }
            changed();
            if (alive().every(function (p) { return G.votes[p.id]; })) { G.endsAt = Math.min(G.endsAt, Date.now() + 2000); changed(); }
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
        return !atk || Date.now() < G.phaseAt + atk.at + 4600;
    }

    /** وش ينكشف عن لاعب ميت للكل: الدور كامل (fullReveal) أو الفريق للمطرود بالتصويت (القواعد). */
    function deadInfo(p) {
        if (p.alive || hiddenDeath(p)) return {};
        if (S.fullReveal && p.cause !== 'left') return { role: p.role, team: p.faction };
        if (p.cause === 'vote') return { team: p.faction };
        return {};
    }

    function view(id) {
        var isHost = id === 'host', me = !isHost && P(id), over = G.phase === 'over';
        var meMafia = !!(me && me.alive && me.faction === 'mafia');
        var players = G.players.map(function (p) {
            var o = { id: p.id, name: p.name, look: p.look, tiktok: p.tiktok, seat: p.seat, district: p.district, alive: p.alive || hiddenDeath(p), cause: hiddenDeath(p) ? null : p.cause, diedRound: p.diedRound, role: null, team: null };
            if (over) { o.role = p.originalRole; o.finalRole = p.role; o.team = p.faction; o.recruited = !!p.recruitedRound; }
            else if (p === me) { o.role = p.role; o.team = p.faction; }
            else if (meMafia && p.faction === 'mafia') { o.role = p.role; o.team = 'mafia'; }   // المافيا يعرفون بعض حتى المتخفي والمجنّد
            else { var d = deadInfo(p); o.role = d.role || null; o.team = d.team || null; }
            return o;
        });
        var chat = G.chat.filter(function (c) {
            if (c.ch === 'mafia') return meMafia && c.n > me.mafiaSince;
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
            cards: over ? G.cards.map(function (c) { return { id: c, name: CARD_NAMES[c], used: G.usedCards.indexOf(c) >= 0 }; }) : null
        };
        if (G.phase === 'night') {
            // كم واحد خلّص اختياره (بدون ما ينكشف مين ولا وش اختار) — لشريط الانتظار على البث
            var need = 0, done = 0, N = G.night;
            aliveMafia().forEach(function (m) { need++; if (N.ops[m.id]) done++; });
            aliveRole('doctor').concat(aliveRole('detective')).forEach(function (d) { need++; if (N.actions[d.id]) done++; });
            v.nightProgress = { need: need, done: done };
        }
        if (me) {
            v.me = {
                id: me.id, role: me.role, team: me.faction, alive: me.alive, district: me.district,
                silenced: G.phase === 'day' && G.silenced.indexOf(me.id) >= 0,
                notices: me.notices.slice(-20), inspections: me.role === 'detective' || me.inspections.length ? me.inspections : undefined
            };
            if (me.role === 'doctor') { v.me.doctorPrev = me.doctorPrev; v.me.doctorSelfUsed = me.doctorSelfUsed; }
            if (G.phase === 'night' && G.night) {
                if (meMafia) { v.me.ops = G.night.ops; v.me.cardVotes = G.night.cards; }
                if (me.role === 'doctor') v.me.protect = G.night.actions[me.id] || null;
                if (me.role === 'detective') v.me.inspect = G.night.actions[me.id] || null;
            }
            if (meMafia && !over) v.cards = G.cards.map(function (c) { return { id: c, name: CARD_NAMES[c], used: G.usedCards.indexOf(c) >= 0, available: available(c) }; });
            if (G.phase === 'vote' || G.phase === 'verdict') v.me.vote = G.votes[me.id] || null;
        }
        return v;
    }

    sys('بدأت المباراة: ' + G.players.length + ' لاعب' + (G.districts > 1 ? ' في ' + G.districts + ' أحياء' : '') + ' — شوفوا أدواركم على جوالاتكم');
    changed();
    return { G: G, tick: tick, act: act, endStage: endStage, remove: remove, view: view, _available: available };
}

module.exports = { createGame: createGame, SHOT: SHOT, REVEAL_MS: REVEAL_MS, VERDICT_MS: VERDICT_MS, CARDS: CARDS, CARD_NAMES: CARD_NAMES, ROLE_NAMES: ROLE_NAMES, DISTRICT_SIZE: DISTRICT_SIZE };
