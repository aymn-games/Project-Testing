/**
 * بنك كلمات النمط المعروف (عامية ومفهومة): كل كلمات المواضيع بملف
 * codenames-easy-words.js + CODENAMES_EXTRA، عشوائية بدون مواضيع.
 * لازم يتحمّل بعد codenames-easy-words.js.
 */
window.CODENAMES_WORDS = (function () {
    var seen = {}, out = [];
    (window.CODENAMES_EASY || []).forEach(function (c) { c.words.forEach(add); });
    (window.CODENAMES_EXTRA || []).forEach(add);
    function add(x) { if (x && !seen[x]) { seen[x] = 1; out.push(x); } }
    return out;
}());
