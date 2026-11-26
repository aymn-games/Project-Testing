/**
 * «المافيا» — ملامح الشخصيات (مشتركة بين شاشة البث والجوال).
 *
 * look = {skin, hair, hairC, shirt, pants} أرقام داخل حدود اللوحات تحت —
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
        return { skin: r(SKIN.length), hair: r(HAIR_STYLES.length), hairC: r(HAIR_C.length), shirt: r(SHIRT.length), pants: r(PANTS.length) };
    }

    function colors(look) {
        look = look || {};
        return {
            skin: SKIN[look.skin] || SKIN[0], hair: HAIR_C[look.hairC] || HAIR_C[0],
            shirt: SHIRT[look.shirt] || SHIRT[0], pants: PANTS[look.pants] || PANTS[0], style: look.hair | 0
        };
    }

    /** صورة SVG للوجه والجسم (للجوال والقوائم). */
    /** صورة SVG للرأس والكتوف (للجوال والقوائم) — نفس الشخصية ثلاثية الأبعاد: رأس مربع بحواف مدوّرة ووجه مسطّح،
     *  عيون سودا بيضاوية بلمعة، خدود وردية، فم صغير، غُرّة مستقيمة، صدر بلون القميص وزر أصفر وأكمام بيضاء. */
    function avatarSVG(look, size) {
        var c = colors(look), s = size || 96, h = c.hair, back = '', front = '';
        var top = '<rect x="15" y="10" width="70" height="24" rx="11" fill="' + h + '"/><rect x="17" y="24" width="66" height="11" rx="3" fill="' + h + '"/>';
        var sides = function (len) { return '<rect x="13" y="22" width="9" height="' + len + '" rx="3" fill="' + h + '"/><rect x="78" y="22" width="9" height="' + len + '" rx="3" fill="' + h + '"/>'; };
        switch (c.style) {
            case 0: front = top + sides(26); break;
            case 1: back = '<rect x="5" y="30" width="11" height="44" rx="5.5" fill="' + h + '"/><rect x="84" y="30" width="11" height="44" rx="5.5" fill="' + h + '"/>';
                front = top + sides(24) + '<circle cx="12" cy="29" r="4" fill="#f26d7d"/><circle cx="88" cy="29" r="4" fill="#f26d7d"/>'; break;
            case 2: back = '<rect x="15" y="40" width="70" height="56" rx="4" fill="' + h + '"/>'; front = top + sides(74); break;
            case 3: back = '<circle cx="31" cy="9" r="9" fill="' + h + '"/><circle cx="69" cy="9" r="9" fill="' + h + '"/>'; front = top + sides(26); break;
            case 4: front = '<g fill="' + h + '"><circle cx="22" cy="24" r="11"/><circle cx="36" cy="14" r="12"/><circle cx="50" cy="11" r="12"/><circle cx="64" cy="14" r="12"/><circle cx="78" cy="24" r="11"/><circle cx="16" cy="38" r="8"/><circle cx="84" cy="38" r="8"/></g>'; break;
            case 5: front = '<rect x="15" y="10" width="70" height="24" rx="11" fill="' + h + '"/><rect x="22" y="29" width="72" height="6" rx="3" fill="' + h + '"/>' + sides(20); break;
            case 6: back = '<rect x="11" y="16" width="78" height="80" rx="8" fill="#f4f1ea"/>';
                front = '<rect x="13" y="9" width="74" height="24" rx="11" fill="#f4f1ea"/><path d="M18 22 H82" stroke="#c4302b" stroke-width="4" stroke-dasharray="4 4"/><rect x="16" y="10" width="68" height="6" rx="3" fill="#1f1a17"/>' +
                    '<rect x="11" y="24" width="8" height="66" rx="3" fill="#f4f1ea"/><rect x="81" y="24" width="8" height="66" rx="3" fill="#f4f1ea"/>'; break;
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + s + '" height="' + s + '" aria-hidden="true">' + back +
            // الكتوف: أكمام بيضاء وصدر بلون القميص وزر أصفر وياقة صفرا
            '<rect x="16" y="80" width="16" height="24" rx="7" fill="#f6f3ec"/><rect x="68" y="80" width="16" height="24" rx="7" fill="#f6f3ec"/>' +
            '<path d="M28 100 L30 82 Q50 76 70 82 L72 100Z" fill="' + c.shirt + '"/><path d="M36 80 Q50 85 64 80" stroke="#f2c230" stroke-width="2.6" fill="none"/><circle cx="50" cy="93" r="4.2" fill="#f2c230"/>' +
            // الرأس المربع والوجه
            '<rect x="19" y="18" width="62" height="62" rx="15" fill="' + c.skin + '"/>' +
            '<ellipse cx="38" cy="54" rx="5.6" ry="6.6" fill="#221a26"/><ellipse cx="62" cy="54" rx="5.6" ry="6.6" fill="#221a26"/><circle cx="40.2" cy="51.6" r="1.9" fill="#fff"/><circle cx="64.2" cy="51.6" r="1.9" fill="#fff"/>' +
            '<ellipse cx="26" cy="62" rx="4.6" ry="2.7" fill="#f19a93"/><ellipse cx="74" cy="62" rx="4.6" ry="2.7" fill="#f19a93"/>' +
            '<ellipse cx="50" cy="66" rx="3" ry="1.3" fill="#d8613f"/>' +
            front + '</svg>';
    }

    window.MafiaLooks = { SKIN: SKIN, HAIR_STYLES: HAIR_STYLES, HAIR_C: HAIR_C, SHIRT: SHIRT, PANTS: PANTS, ROLE: ROLE, randomLook: randomLook, colors: colors, avatarSVG: avatarSVG };
})();
