/**
 * ألعاب أيمن — مكتبة ألعاب الديسكورد (discord-games.html) بالتصميم الجديد.
 * نفس اللعبة والوصف والرابط اللي بالصفحة القديمة، ببطاقة مكتبة الألعاب.
 * لإضافة لعبة ديسكورد: سطر جديد بـGAMES.
 */
(function () {
  'use strict';
  var GAMES = [
    { icon: 'person_search', name: 'من الأمبوستر', cat: 'خداع اجتماعي', badge: 'جديد', hue: 175,
      desc: 'الكل عنده نفس الكلمة إلا واحد أعطوا تلميحات وصوّتوا على الأمبوستر واكشفوه قبل ما يخمّن كلمتكم',
      info: [['group', '3 لاعبين أو أكثر'], ['devices', 'جوال وكمبيوتر']], href: 'discord-games/impostor/' }
  ];
  var grid = document.getElementById('dc-grid');
  if (!grid) return;
  var n = document.getElementById('dc-n'); if (n) n.textContent = GAMES.length;
  grid.innerHTML = GAMES.map(function (g, i) {
    var k = i + 1;
    return '<article class="gl-card" style="--i:' + i + ';--hue:' + g.hue + '"><span class="gl-glow"></span><span class="gl-bgicon gl-ms" aria-hidden="true">' + g.icon + '</span>' +
      '<div class="gl-top"><span class="gl-tile"><span class="gl-ms" aria-hidden="true">' + g.icon + '</span></span><span class="gl-num" dir="ltr">' + (k < 10 ? '0' : '') + k + '</span></div>' +
      '<div class="gl-meta"><span class="gl-cat">' + g.cat + '</span>' + (g.badge ? '<span class="gl-badge">' + g.badge + '</span>' : '') + '</div>' +
      '<h3 class="gl-title">' + g.name + '</h3><p class="gl-desc">' + g.desc + '</p>' +
      '<div class="gl-info">' + g.info.map(function (x) { return '<span><span class="gl-ms" aria-hidden="true">' + x[0] + '</span>' + x[1] + '</span>'; }).join('') + '</div>' +
      '<a class="gl-play" href="' + g.href + '">العب الآن<span class="gl-ms" aria-hidden="true">arrow_back</span></a></article>';
  }).join('');
  grid.addEventListener('pointermove', function (e) {
    var c = e.target.closest('.gl-card'); if (!c) return;
    var r = c.getBoundingClientRect();
    c.style.setProperty('--x', (e.clientX - r.left) + 'px'); c.style.setProperty('--y', (e.clientY - r.top) + 'px');
  });
  var follow = document.getElementById('dc-follow');
  if (follow && window.AGPTikTokFollow) window.AGPTikTokFollow.insertAfter(follow);
})();
