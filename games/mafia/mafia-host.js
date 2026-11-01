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
            '<li><span>1</span><span><b>امسح الباركود</b> أو افتح <b dir="ltr">' + siteUrl + '</b> واكتب رقم الروم ' + c + '</span></li>' +
            '<li><span>2</span><span class="must"><b class="must">سجّل دخول بحساب الموقع</b> (إلزامي)</span></li>' +
            '<li><span>3</span><span>جهّز شخصيتك واضغط <b>«ادخل الساحة»</b> — تظهر هنا فوراً</span></li>' +
            '</ol>' +
            '<div class="steps-note">💡 الدخول <b>بالباركود أو رقم الروم فقط</b> — مو بكتابة كلمة بالشات</div>';
    }

    window.MafiaHost = { buildFx: buildFx, joinStepsHtml: joinStepsHtml };
    document.addEventListener('DOMContentLoaded', function () { buildFx(document.querySelector('.fx')); });
})();
