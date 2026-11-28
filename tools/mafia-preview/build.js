// يبني ملفين يشتغلون لحالهم (بدون سيرفر) من ملفات اللعبة نفسها:
//   games/mafia/village-demo.html  ← تجربة نظام القرية (منطق الخادم + شاشة الجوال + المشهد ثلاثي الأبعاد)، والباقين بوتات
//   games/mafia/characters.html    ← استوديو الشخصيات (تلف الشخصية وتغيّر شكلها وتشغّل حركاتها)
// التشغيل من جذر المستودع:  node tools/mafia-preview/build.js
// أعد التشغيل بعد أي تعديل على mafia-scene.js أو mafia-looks.js أو village-*.js أو backend/mafia/*.
var fs = require('fs'), path = require('path');
var ROOT = path.resolve(__dirname, '../..') + '/';
function inline(t) {
    return t.replace(/\/\*INLINE:([^*]+)\*\//g, function (_, p) { return fs.readFileSync(ROOT + p, 'utf8').replace(/<\/script/gi, '<\\/script'); })
        .replace('/*SCENE*/', function () { return fs.readFileSync(ROOT + 'games/mafia/mafia-scene.js', 'utf8').replace(/<\/script/gi, '<\\/script'); });
}
[['village-demo.template.html', 'games/mafia/village-demo.html'], ['characters.template.html', 'games/mafia/characters.html']].forEach(function (f) {
    var out = inline(fs.readFileSync(__dirname + '/' + f[0], 'utf8'));
    fs.writeFileSync(ROOT + f[1], out);
    console.log(f[1], out.length);
});
