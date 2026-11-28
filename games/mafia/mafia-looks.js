/**
 * «المافيا» — ملامح الشخصيات (مشتركة بين شاشة البث والجوال).
 *
 * look = {skin, hair, hairC, shirt, pants, outfit} أرقام داخل حدود اللوحات تحت —
 * outfit = نوع اللبس (OUTFITS)، وshirt لونه، وpants لون البنطلون أو التنورة، وaccs/accC = زينة الشعر (ACCS) وألوانها —
 * لازم تطابق LOOK_LIMITS في backend/mafia/mafia-server.js.
 * avatarSVG(look) يرسم نسخة ثنائية الأبعاد للجوال واللوبي (بدون Three.js).
 */
(function () {
    'use strict';

    var SKIN = ['#f8d7bc', '#f0c09a', '#dca277', '#bd7e55', '#8f5b3b', '#603c27'];
    var HAIR_STYLES = ['قصير', 'ضفاير', 'طويل', 'كعكتين', 'كيرلي', 'كاب', 'شماغ'];
    var HAIR_C = ['#1f1a17', '#4a2c1a', '#7b4a24', '#e2b65a', '#f07c2a', '#b3261e', '#3459c9', '#e26aa8'];
    var SHIRT = ['#e2483d', '#2f7de1', '#2fb36a', '#f2b632', '#f07c2a', '#8f55d6', '#e65fa3', '#18a8a0', '#f4f1ea', '#3b4250', '#7cc243', '#1aa6d6'];
    var PANTS = ['#2b3346', '#4a3b2c', '#1f2b4a', '#5a5f6b', '#6b4a2b', '#20242c'];
    var OUTFITS = ['بلوزة', 'ثوب', 'هودي', 'جاكيت', 'فستان'];
    // زينة الشعر: كل وحدة تتفعّل لحالها (accs = bitmask، البت i = ACCS[i]) ولها لون من ACC_C (accC[i]).
    // النظارة تنلبس مع كل التسريحات، والباقي ما ينلبس مع الكاب والشماغ
    var ACCS = ['طوق', 'فيونكة', 'وردة', 'تاج', 'بنسات', 'آذان قطة', 'نظارة', 'تاج ورد'];
    var ACC_C = ['#ff8fb8', '#e2483d', '#f2c230', '#fbf7f0', '#2f7de1', '#8f55d6', '#2fb36a', '#1f1a17', '#f07c2a', '#18a8a0'];
    var ACC_DEF = [0, 1, 0, 2, 4, 7, 7, 0];   // اللون الافتراضي لكل زينة
    var ROLE = {
        mafia: { n: 'مافيا', icon: '🔪', c: '#e2483d', team: 'mafia', desc: 'كل ليلة تصوّت مع فريقك على عملية (قتل أو تجنيد) وكرت مساعد. لا تنكشف بالنهار!' },
        doctor: { n: 'طبيب', icon: '🩺', c: '#2fb36a', team: 'town', desc: 'كل ليلة تحمي شخص من هجوم المافيا. ما تكرر نفس الشخص ليلتين ورا بعض، وتحمي نفسك مرة وحدة بس.' },
        disguised: { n: 'متخفي', icon: '🎭', c: '#b3261e', team: 'mafia', desc: 'أنت من المافيا، وأول مرة يفحصك محقق بنجاح تطلع له «مواطن».' },
        detective: { n: 'محقق', icon: '🕵️', c: '#3e8ef0', team: 'town', desc: 'كل ليلة تفحص شخص: مافيا أو مواطن.' },
        citizen: { n: 'مواطن', icon: '🏠', c: '#f2b632', team: 'town', desc: 'ناقش وصوّت بذكاء عشان تطرد المافيا.' },
        // أدوار «نظام القرية» (النظام الجديد — الشرح الكامل بـvillage-roles.js)
        mayor: { n: 'العمدة', icon: '👑', c: '#d4a017', team: 'town', desc: 'معروف للكل، وصوتك بالتصويت بصوتين.' },
        bodyguard: { n: 'الحارس', icon: '🛡️', c: '#0f9f9a', team: 'town', desc: 'تحرس لاعب كل ليلة، ولو هجمت عليه المافيا يموت المهاجم.' },
        sniper: { n: 'القنّاص', icon: '🎯', c: '#2563eb', team: 'town', desc: 'عندك رصاصة وحدة بالمباراة.' },
        forger: { n: 'المزوّر', icon: '✒️', c: '#be123c', team: 'mafia', desc: 'من المافيا: تزوّر نتيجة المحقق.' },
        jester: { n: 'المهرّج', icon: '🃏', c: '#a855f7', team: 'neutral', desc: 'تفوز لو طردتك القرية بالتصويت.' }
    };

    function randomLook() {
        function r(n) { return Math.floor(Math.random() * n); }
        var hair = r(HAIR_STYLES.length);
        return { skin: r(SKIN.length), hair: hair, hairC: r(HAIR_C.length), shirt: r(SHIRT.length), pants: r(PANTS.length), outfit: fitOutfit(hair), accs: fitAcc(hair), accC: ACC_DEF.slice() };
    }
    /** زينة عشوائية (bitmask): لتسريحات البنات وحدة من زينة الشعر، وأحياناً نظارة لأي أحد (واللاعب يغيّرها) */
    function fitAcc(hair) {
        var m = 0, hairOnes = [0, 1, 2, 3, 4, 5, 7];
        if (hair === 1 || hair === 2 || hair === 3) m |= 1 << hairOnes[Math.floor(Math.random() * hairOnes.length)];
        if (Math.random() < 0.15) m |= 1 << 6;
        return m;
    }
    /** لبس عشوائي يناسب التسريحة: الشماغ غالباً مع الثوب، والفستان لتسريحات البنات (اللاعب يقدر يغيّره) */
    function fitOutfit(hair) {
        var pick = hair === 6 ? [1, 1, 1, 2, 3] : (hair === 1 || hair === 2 || hair === 3) ? [0, 4, 4, 2, 3] : [0, 1, 2, 3];
        return pick[Math.floor(Math.random() * pick.length)];
    }

    /** الزينة المفعّلة بألوانها: [{k (1..ACCS.length), col}] — والشكل القديم (acc رقم وحدة، 1..6) ينقرأ بعد */
    function accList(look) {
        var m = look.accs != null ? look.accs | 0 : (look.acc > 0 && look.acc <= 6 ? 1 << (look.acc - 1) : 0), cs = Array.isArray(look.accC) ? look.accC : [], out = [];
        for (var i = 0; i < ACCS.length; i++) if (m & (1 << i)) { var ci = cs[i]; out.push({ k: i + 1, col: ACC_C[ci >= 0 && ci < ACC_C.length ? ci : ACC_DEF[i]] }); }
        return out;
    }

    function colors(look) {
        look = look || {};
        return {
            skin: SKIN[look.skin] || SKIN[0], hair: HAIR_C[look.hairC] || HAIR_C[0],
            shirt: SHIRT[look.shirt] || SHIRT[0], pants: PANTS[look.pants] || PANTS[0], style: look.hair | 0,
            outfit: look.outfit >= 0 && look.outfit < OUTFITS.length ? look.outfit | 0 : 0,
            accs: accList(look)
        };
    }

    /** صورة SVG للوجه والجسم (للجوال والقوائم). */
    /** صورة SVG للرأس والكتوف (للجوال والقوائم) — نفس الشخصية ثلاثية الأبعاد: رأس مدوّر كبير،
     *  عيون سودا بيضاوية بلمعة، خدود وردية، فم صغير، غُرّة مستقيمة، صدر بلون القميص وزر أصفر وأكمام بيضاء. */
    /** الكتوف بالرسم الصغير حسب نوع اللبس (نفس الشخصية ثلاثية الأبعاد) */
    function shoulders(c) {
        var col = c.shirt, W = '#f3efe6', dark = 'rgba(0,0,0,.22)';
        var body = function (f) { return '<ellipse cx="25" cy="92" rx="9" ry="11" fill="' + f + '"/><ellipse cx="75" cy="92" rx="9" ry="11" fill="' + f + '"/><path d="M30 100 L31 82 Q50 77 69 82 L70 100Z" fill="' + f + '"/>'; };
        switch (c.outfit) {
            case 1: return body(col) + '<path d="M40 80 Q50 84 60 80" stroke="' + col + '" stroke-width="4" fill="none"/><rect x="48" y="84" width="4" height="16" rx="2" fill="' + dark + '"/><circle cx="50" cy="88" r="1.2" fill="#f2c230"/><circle cx="50" cy="94" r="1.2" fill="#f2c230"/>';   // ثوب
            case 2: return body(col) + '<path d="M34 81 Q50 90 66 81" stroke="' + col + '" stroke-width="6" fill="none"/><path d="M34 81 Q50 90 66 81" stroke="' + dark + '" stroke-width="1.5" fill="none"/><path d="M46 85 V95 M54 85 V95" stroke="' + W + '" stroke-width="1.6" stroke-linecap="round"/>';   // هودي
            case 3: return body(col) + '<path d="M42 80 L50 100 L58 80 Q50 83 42 80Z" fill="' + W + '"/><path d="M42 80 L48 92 M58 80 L52 92" stroke="' + dark + '" stroke-width="2.4"/>';   // جاكيت وقميص أبيض
            case 4: return body(col) + '<path d="M38 80 Q50 85 62 80" stroke="' + W + '" stroke-width="3.5" fill="none"/><path d="M44 87 L50 85 L44 83Z M56 87 L50 85 L56 83Z" fill="' + W + '"/>';   // فستان
            default:   // بلوزة بيضاء وأكمام منفوخة، وياقة وحزام وفيونكة بلون قميص اللاعب
                return body(W) + '<rect x="30" y="93" width="40" height="7" fill="' + col + '"/>' +
                    '<path d="M38 80 Q50 85 62 80" stroke="' + col + '" stroke-width="3.5" fill="none"/><path d="M44 87 L50 85 L44 83Z M56 87 L50 85 L56 83Z" fill="' + col + '"/>';
        }
    }

    /** زينة الشعر بالرسم الصغير */
    function accSVG(c) {
        var pk = '#ff8fb8', g = '#f2c230', capped = c.style === 5 || c.style === 6;
        return c.accs.map(function (a) {
            var col = a.col;
            if (capped && a.k !== 7) return '';   // مع الكاب والشماغ: النظارة بس
            switch (a.k) {
                case 1: return '<path d="M14 30 Q50 -6 86 30" stroke="' + col + '" stroke-width="7" fill="none" stroke-linecap="round"/>';
                case 2: return '<g transform="translate(74 12) rotate(20)"><ellipse cx="-10" cy="0" rx="10" ry="7" fill="' + col + '"/><ellipse cx="10" cy="0" rx="10" ry="7" fill="' + col + '"/><circle r="4.5" fill="' + col + '" stroke="rgba(0,0,0,.25)"/></g>';
                case 3: return '<g transform="translate(16 30)"><circle cx="0" cy="-6" r="5" fill="' + col + '"/><circle cx="6" cy="-1" r="5" fill="' + col + '"/><circle cx="3" cy="6" r="5" fill="' + col + '"/><circle cx="-4" cy="6" r="5" fill="' + col + '"/><circle cx="-6" cy="-1" r="5" fill="' + col + '"/><circle r="3.5" fill="' + g + '"/></g>';
                case 4: return '<path d="M36 8 L36 -4 L43 3 L50 -8 L57 3 L64 -4 L64 8Z" fill="' + col + '" transform="translate(0 4)"/><circle cx="50" cy="0" r="2.6" fill="' + pk + '"/>';
                case 5: return '<rect x="64" y="22" width="16" height="4" rx="2" fill="' + col + '" transform="rotate(-25 72 24)"/><rect x="68" y="29" width="16" height="4" rx="2" fill="#ffd84a" transform="rotate(-25 76 31)"/>';
                case 6: return '<path d="M18 22 L22 -2 L38 12Z" fill="' + col + '"/><path d="M23 15 L25 4 L32 11Z" fill="' + pk + '"/><path d="M82 22 L78 -2 L62 12Z" fill="' + col + '"/><path d="M77 15 L75 4 L68 11Z" fill="' + pk + '"/>';
                case 7: return '<g fill="rgba(220,240,255,.25)" stroke="' + col + '" stroke-width="2.6"><circle cx="38" cy="54" r="9"/><circle cx="62" cy="54" r="9"/></g><path d="M47 52 Q50 49 53 52 M29 52 L18 49 M71 52 L82 49" stroke="' + col + '" stroke-width="2.4" fill="none"/>';
                case 8: var f = ''; [16, 28, 40, 50, 60, 72, 84].forEach(function (x, i) { var y = 18 - Math.sin((x - 16) / 68 * Math.PI) * 12; f += '<circle cx="' + x + '" cy="' + y + '" r="5.2" fill="' + (i % 2 ? '#fbf7f0' : col) + '"/><circle cx="' + x + '" cy="' + y + '" r="1.8" fill="' + g + '"/>'; }); return f;
            }
            return '';
        }).join('');
    }

    function avatarSVG(look, size) {
        var c = colors(look), s = size || 96, h = c.hair, back = '', front = '';
        // قبة مدوّرة أعرض من الرأس، وحافتها التحتية خط الغُرّة المستقيم
        var top = '<path d="M13 34 C13 8 30 3 50 3 C70 3 87 8 87 34 Z" fill="' + h + '"/>';
        var sides = function (len) { return '<rect x="11" y="22" width="13" height="' + (len + 6) + '" rx="6" fill="' + h + '"/><rect x="76" y="22" width="13" height="' + (len + 6) + '" rx="6" fill="' + h + '"/>'; };
        switch (c.style) {
            case 0: front = top + sides(26); break;
            case 1: back = '<path d="M14 26 Q2 22 4 40 Q6 62 10 74 L15 74 Q11 54 16 34Z" fill="' + h + '"/><path d="M86 26 Q98 22 96 40 Q94 62 90 74 L85 74 Q89 54 84 34Z" fill="' + h + '"/>';
                front = '<path d="M13 40 C13 9 30 3 50 3 C70 3 87 9 87 40 L82 40 L76 34 L69 40 L63 34 L56 40 L50 34 L44 40 L37 34 L31 40 L24 34 L18 40Z" fill="' + h + '"/>' + sides(22) +
                    '<circle cx="14" cy="27" r="5" fill="#f0646a"/><circle cx="86" cy="27" r="5" fill="#f0646a"/>'; break;
            case 2: back = '<rect x="15" y="40" width="70" height="56" rx="4" fill="' + h + '"/>'; front = top + sides(74); break;
            case 3: back = '<circle cx="31" cy="9" r="9" fill="' + h + '"/><circle cx="69" cy="9" r="9" fill="' + h + '"/>'; front = top + sides(26); break;
            case 4: front = '<g fill="' + h + '"><circle cx="22" cy="24" r="11"/><circle cx="36" cy="14" r="12"/><circle cx="50" cy="11" r="12"/><circle cx="64" cy="14" r="12"/><circle cx="78" cy="24" r="11"/><circle cx="16" cy="38" r="8"/><circle cx="84" cy="38" r="8"/></g>'; break;
            case 5: front = top + '<rect x="20" y="32" width="74" height="6" rx="3" fill="' + h + '"/>' + sides(20); break;
            case 6: back = '<rect x="11" y="16" width="78" height="80" rx="8" fill="#f4f1ea"/>';
                front = '<rect x="13" y="9" width="74" height="24" rx="11" fill="#f4f1ea"/><path d="M18 22 H82" stroke="#c4302b" stroke-width="4" stroke-dasharray="4 4"/><rect x="16" y="10" width="68" height="6" rx="3" fill="#1f1a17"/>' +
                    '<rect x="11" y="24" width="8" height="66" rx="3" fill="#f4f1ea"/><rect x="81" y="24" width="8" height="66" rx="3" fill="#f4f1ea"/>'; break;
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -8 100 108" width="' + s + '" height="' + s + '" aria-hidden="true">' + back +
            shoulders(c) +
            // الرأس المربع والوجه
            '<ellipse cx="50" cy="48" rx="33" ry="33" fill="' + c.skin + '"/>' +
            '<ellipse cx="38" cy="54" rx="5.6" ry="6.6" fill="#221a26"/><ellipse cx="62" cy="54" rx="5.6" ry="6.6" fill="#221a26"/><circle cx="40.2" cy="51.6" r="1.9" fill="#fff"/><circle cx="64.2" cy="51.6" r="1.9" fill="#fff"/>' +
            '<ellipse cx="26" cy="62" rx="4.6" ry="2.7" fill="#f19a93"/><ellipse cx="74" cy="62" rx="4.6" ry="2.7" fill="#f19a93"/>' +
            '<ellipse cx="50" cy="66" rx="3" ry="1.3" fill="#d8613f"/>' +
            front + accSVG(c) + '</svg>';
    }

    window.MafiaLooks = { SKIN: SKIN, HAIR_STYLES: HAIR_STYLES, HAIR_C: HAIR_C, SHIRT: SHIRT, PANTS: PANTS, OUTFITS: OUTFITS, ACCS: ACCS, ACC_C: ACC_C, ACC_DEF: ACC_DEF, accList: accList, ROLE: ROLE, randomLook: randomLook, fitOutfit: fitOutfit, fitAcc: fitAcc, colors: colors, avatarSVG: avatarSVG };
})();
