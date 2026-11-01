/**
 * «المافيا» — أدوات مشتركة لشاشتي الإعدادات واللوبي (نفس روليت الإقصاء):
 * خلفية التوهّج والنجوم والمربعات (buildFx في games/elimination-roulette)،
 * ونص خطوات الدخول للمباراة.
 */
(function () {
    'use strict';
    function rnd(a, b) { return a + Math.random() * (b - a); }

    function buildFx(el) {
        if (!el) return;
        var html = '<div class="glow g1"></div><div class="glow g2"></div><div class="glow g3"></div>';
        for (var i = 0; i < 90; i++) {
            var s = i % 9 ? 1.5 : 3;
            html += '<span class="st" style="left:' + rnd(0, 100).toFixed(2) + '%;top:' + rnd(0, 100).toFixed(2) + '%;width:' + s + 'px;height:' + s + 'px;background:rgba(255,255,255,' + rnd(.12, .35).toFixed(2) + ')"></span>';
        }
        [[88, 14, 14, 1], [73, 82, 18, 0], [16, 66, 10, 1], [42, 8, 12, 0]].forEach(function (q) {
            html += '<span class="sq" style="left:' + q[0] + '%;top:' + q[1] + '%;width:' + q[2] + 'px;height:' + q[2] + 'px;' +
                (q[3] ? 'background:rgba(139,92,246,.45)' : 'border:1.5px solid rgba(139,92,246,.35)') + '"></span>';
        });
        el.innerHTML = html;
    }

    /** خطوات الدخول: باركود أو رقم الغرفة من الموقع، والحساب إلزامي. siteUrl = رابط صفحة الدخول بدون الكود. */
    function joinStepsHtml(siteUrl, code) {
        var c = code ? '<b style="letter-spacing:2px">' + code + '</b>' : '';
        return '<ol class="steps">' +
            '<li><span>1</span><span><b>امسح الباركود</b> أو اكتب رقم الروم ' + c + ' بالصفحة الرئيسية لموقع <b>ألعاب أيمن</b></span></li>' +
            '<li><span>2</span><span class="must"><b class="must">سجّل دخول بحساب الموقع</b></span></li>' +
            '<li><span>3</span><span>اضغط <b>«ادخل الساحة»</b></span></li>' +
            '</ol>' +
            '<div class="steps-note">💡 ما فيه دخول بالشات</div>';
    }

    /** تكبير مرن حسب حجم الشاشة: التصميم مبني على 1440×900، وبالشاشات الأكبر (2K/4K) كل شي يكبر بنفس النسبة
     *  عشان الأدوات والأيقونات تبان بنفس الوضوح. el = العنصر اللي يتكبّر (الافتراضي body). */
    function autoScale(el, base) {
        base = base || [1440, 900];
        function fit() {
            var t = el || document.body; if (!t) return;
            var z = Math.min(window.innerWidth / base[0], window.innerHeight / base[1]);
            z = Math.max(1, Math.min(3, z));   // ما نصغّر تحت الحجم الأصلي، ونكبّر لين 3×
            t.style.zoom = z > 1.04 ? String(Math.round(z * 100) / 100) : '';
        }
        fit(); window.addEventListener('resize', fit);
        return fit;
    }

    window.MafiaHost = { buildFx: buildFx, joinStepsHtml: joinStepsHtml, autoScale: autoScale };
    document.addEventListener('DOMContentLoaded', function () { buildFx(document.querySelector('.fx')); autoScale(); });
})();
