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
        citizen: { n: 'مواطن', icon: '🏠', c: '#f2b632', team: 'town', desc: 'ناقش وصوّت بذكاء عشان تطرد المافيا.' }
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
    function avatarSVG(look, size) {
        var c = colors(look), s = size || 96, hair = '';
        switch (c.style) {
            case 0: hair = '<path d="M22 42 Q22 14 50 14 Q78 14 78 42 Q70 28 50 28 Q30 28 22 42Z" fill="' + c.hair + '"/>'; break;
            case 1: hair = '<rect x="12" y="38" width="12" height="34" rx="6" fill="' + c.hair + '"/><rect x="76" y="38" width="12" height="34" rx="6" fill="' + c.hair + '"/><circle cx="20" cy="40" r="4" fill="#f472b6"/><circle cx="80" cy="40" r="4" fill="#f472b6"/><path d="M22 42 Q22 14 50 14 Q78 14 78 42 Q70 28 50 28 Q30 28 22 42Z" fill="' + c.hair + '"/>'; break;
            case 2: hair = '<path d="M18 74 Q14 16 50 14 Q86 16 82 74 L74 74 Q76 36 50 30 Q24 36 26 74Z" fill="' + c.hair + '"/>'; break;
            case 3: hair = '<circle cx="24" cy="18" r="11" fill="' + c.hair + '"/><circle cx="76" cy="18" r="11" fill="' + c.hair + '"/><path d="M22 42 Q22 14 50 14 Q78 14 78 42 Q70 28 50 28 Q30 28 22 42Z" fill="' + c.hair + '"/>'; break;
            case 4: hair = '<g fill="' + c.hair + '"><circle cx="30" cy="24" r="12"/><circle cx="44" cy="16" r="12"/><circle cx="58" cy="16" r="12"/><circle cx="71" cy="25" r="12"/><circle cx="22" cy="38" r="9"/><circle cx="79" cy="38" r="9"/></g>'; break;
            case 5: hair = '<path d="M20 40 Q20 12 50 12 Q80 12 80 40Z" fill="' + c.hair + '"/><rect x="46" y="36" width="44" height="7" rx="3.5" fill="' + c.hair + '"/>'; break;
            case 6: hair = '<path d="M16 86 Q12 14 50 12 Q88 14 84 86 L72 86 Q74 40 50 34 Q26 40 28 86Z" fill="#f4f1ea"/><path d="M22 40 Q50 22 78 40" stroke="#c4302b" stroke-width="5" fill="none" stroke-dasharray="4 4"/><rect x="20" y="30" width="60" height="7" rx="3" fill="#1f1a17"/>'; break;
        }
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="' + s + '" height="' + s + '" aria-hidden="true">' +
            '<path d="M24 100 Q24 74 50 74 Q76 74 76 100Z" fill="' + c.shirt + '"/>' +
            '<path d="M38 76 Q50 84 62 76" stroke="#fff" stroke-width="4" fill="none" stroke-linecap="round"/><circle cx="50" cy="92" r="2.6" fill="#fde68a"/>' +
            '<ellipse cx="20" cy="48" rx="4.5" ry="6" fill="' + c.skin + '"/><ellipse cx="80" cy="48" rx="4.5" ry="6" fill="' + c.skin + '"/>' +
            '<circle cx="50" cy="46" r="30" fill="' + c.skin + '"/>' +
            '<ellipse cx="39" cy="50" rx="4.4" ry="5.8" fill="#1e1b2e"/><ellipse cx="61" cy="50" rx="4.4" ry="5.8" fill="#1e1b2e"/><circle cx="40.5" cy="47.5" r="1.5" fill="#fff"/><circle cx="62.5" cy="47.5" r="1.5" fill="#fff"/>' +
            '<path d="M34 41 L44 40" stroke="' + c.hair + '" stroke-width="2.4" stroke-linecap="round"/><path d="M56 40 L66 41" stroke="' + c.hair + '" stroke-width="2.4" stroke-linecap="round"/>' +
            '<circle cx="33" cy="60" r="4" fill="#f08a8a" opacity=".45"/><circle cx="67" cy="60" r="4" fill="#f08a8a" opacity=".45"/>' +
            '<path d="M44 63 Q50 67 56 63" stroke="#7a3b2b" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
            hair + '</svg>';
    }

    window.MafiaLooks = { SKIN: SKIN, HAIR_STYLES: HAIR_STYLES, HAIR_C: HAIR_C, SHIRT: SHIRT, PANTS: PANTS, ROLE: ROLE, randomLook: randomLook, colors: colors, avatarSVG: avatarSVG };
})();
