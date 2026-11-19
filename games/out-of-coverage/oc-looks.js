/**
 * «خارج التغطية» — أشكال الشخصيات.
 *
 * نفس شخصيات «سفينة النجاة» (games/survival-ship/ship3d.js: figure) بنفس الألوان
 * والنسب، لكن كل شكل له قصة شعر خاصة فيه (style). الخادم يعطي كل لاعب رقم شكل
 * (0..11) فما يتكرر الشكل بنفس الغرفة لين 12 لاعب.
 *
 * window.OCLooks = { LOOKS, get(i), avatarSvg(i, size) }
 * avatarSvg: صورة رأس ثنائية الأبعاد بنفس الألوان والقصة — للجوال وقوائم شاشة البث.
 */
(function () {
    'use strict';
    // ألوان سفينة النجاة (LOOKS في games/survival-ship/game.html) + 4 أشكال إضافية
    var LOOKS = [
        { skin: '#f6cfa6', hair: '#3b2414', girl: 0, outfit: '#3b82f6', pants: '#1e3a8a', style: 'spiky', n: 'شوك' },
        { skin: '#f2c49b', hair: '#5b3a1e', girl: 1, outfit: '#a855f7', pants: '#4c1d95', style: 'ponytail', n: 'ذيل حصان' },
        { skin: '#d9a273', hair: '#1f1410', girl: 0, outfit: '#10b981', pants: '#064e3b', style: 'curly', n: 'كيرلي' },
        { skin: '#f8d9bd', hair: '#7c4a1e', girl: 1, outfit: '#f43f5e', pants: '#881337', style: 'bun', n: 'كعكة' },
        { skin: '#c68a5c', hair: '#120c09', girl: 0, outfit: '#f97316', pants: '#7c2d12', style: 'mohawk', n: 'موهوك' },
        { skin: '#f6cfa6', hair: '#2a1a10', girl: 1, outfit: '#14b8a6', pants: '#134e4a', style: 'long', n: 'شعر طويل' },
        { skin: '#e3ae80', hair: '#3b2414', girl: 0, outfit: '#8b5cf6', pants: '#312e81', style: 'quiff', n: 'تسريحة مرفوعة' },
        { skin: '#f2c49b', hair: '#4a2c17', girl: 1, outfit: '#0ea5e9', pants: '#0c4a6e', style: 'bob', n: 'قصير' },
        { skin: '#f8d9bd', hair: '#b45309', girl: 0, outfit: '#eab308', pants: '#713f12', style: 'buzz', n: 'حلاقة قصيرة' },
        { skin: '#d9a273', hair: '#1c1917', girl: 1, outfit: '#ec4899', pants: '#831843', style: 'twinbuns', n: 'كعكتين' },
        { skin: '#f6cfa6', hair: '#57534e', girl: 0, outfit: '#ef4444', pants: '#7f1d1d', style: 'side', n: 'فرق جانبي' },
        { skin: '#e3ae80', hair: '#9a3412', girl: 1, outfit: '#22c55e', pants: '#14532d', style: 'pigtails', n: 'ضفيرتين' }
    ];
    function get(i) { i = Number(i); return LOOKS[(isFinite(i) ? Math.abs(Math.floor(i)) : 0) % LOOKS.length]; }

    // رسم الشعر بالـSVG (رأس دائري نصف قطره 30 بمركز 50,54)
    var HAIR2D = {
        spiky: '<path d="M18 50 L22 26 L32 34 L36 14 L46 28 L52 10 L58 28 L68 14 L70 34 L80 24 L82 50 Q50 30 18 50Z"/>',
        ponytail: '<path d="M20 52 Q18 20 50 20 Q82 20 80 52 Q70 34 50 34 Q30 34 20 52Z"/><path d="M76 34 Q96 46 88 82 Q80 66 74 48Z"/>',
        curly: '<g><circle cx="26" cy="40" r="11"/><circle cx="38" cy="28" r="12"/><circle cx="52" cy="24" r="13"/><circle cx="66" cy="28" r="12"/><circle cx="76" cy="40" r="11"/><circle cx="20" cy="54" r="8"/><circle cx="80" cy="54" r="8"/></g>',
        bun: '<path d="M20 52 Q18 22 50 22 Q82 22 80 52 Q72 36 50 36 Q28 36 20 52Z"/><circle cx="50" cy="14" r="11"/>',
        mohawk: '<path d="M22 50 Q22 30 50 28 Q78 30 78 50 Q64 40 50 40 Q36 40 22 50Z" opacity=".55"/><path d="M42 40 L44 8 L50 16 L56 8 L58 40Z"/>',
        long: '<path d="M18 92 Q12 22 50 20 Q88 22 82 92 L72 92 Q76 46 62 36 Q50 44 38 36 Q24 46 28 92Z"/>',
        quiff: '<path d="M20 50 Q18 26 46 24 Q50 6 72 12 Q66 20 76 28 Q82 36 80 50 Q66 36 50 36 Q32 38 20 50Z"/>',
        bob: '<path d="M16 72 Q12 22 50 20 Q88 22 84 72 L74 72 Q76 42 64 38 Q50 44 34 38 Q24 44 26 72Z"/>',
        buzz: '<path d="M22 48 Q22 24 50 24 Q78 24 78 48 Q66 36 50 36 Q34 36 22 48Z"/>',
        twinbuns: '<path d="M20 52 Q18 22 50 22 Q82 22 80 52 Q72 36 50 36 Q28 36 20 52Z"/><circle cx="24" cy="22" r="10"/><circle cx="76" cy="22" r="10"/>',
        side: '<path d="M20 52 Q16 22 50 20 Q84 22 80 50 Q76 34 40 36 Q30 38 20 52Z"/>',
        pigtails: '<path d="M20 52 Q18 22 50 22 Q82 22 80 52 Q72 36 50 36 Q28 36 20 52Z"/><path d="M18 46 Q4 62 12 84 Q22 70 24 52Z"/><path d="M82 46 Q96 62 88 84 Q78 70 76 52Z"/>'
    };
    function avatarSvg(i, size) {
        var L = get(i), s = size || 40;
        return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 100 100" aria-hidden="true">' +
            '<ellipse cx="50" cy="104" rx="36" ry="22" fill="' + L.outfit + '"/>' +
            '<circle cx="50" cy="54" r="30" fill="' + L.skin + '"/>' +
            '<g fill="' + L.hair + '">' + (HAIR2D[L.style] || HAIR2D.buzz) + '</g>' +
            '<ellipse cx="40" cy="58" rx="3.4" ry="4.6" fill="#1e1b2e"/><ellipse cx="60" cy="58" rx="3.4" ry="4.6" fill="#1e1b2e"/>' +
            '<circle cx="41.3" cy="56.2" r="1.2" fill="#fff"/><circle cx="61.3" cy="56.2" r="1.2" fill="#fff"/>' +
            '<ellipse cx="33" cy="66" rx="4" ry="2.2" fill="#fb7185" opacity=".5"/><ellipse cx="67" cy="66" rx="4" ry="2.2" fill="#fb7185" opacity=".5"/>' +
            '<path d="M44 68 Q50 74 56 68" stroke="#9f1239" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
            '</svg>';
    }

    window.OCLooks = { LOOKS: LOOKS, get: get, avatarSvg: avatarSvg };
})();
