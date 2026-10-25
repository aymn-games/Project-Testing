// كوّن كلمة — تقرير تحقق بنك الجولات (مراجعة منفصلة عن تشغيل اللعبة).
// التشغيل: node games/word-hive/tools/wh-report.js
// يكتب games/word-hive/rounds-report.md: لكل جولة الكلمات المقبولة والمرفوضة وسبب الرفض والعدد والحالة.
'use strict';
const fs = require('fs');
const path = require('path');
const E = require('../wh-engine.js');
const ROUNDS = require('../wh-rounds.js');

const bank = E.buildBank(ROUNDS);
const DIFF = { easy: 'سهل', medium: 'متوسط' };
const lines = [
    '# تقرير تحقق بنك جولات كوّن كلمة',
    '',
    '> مُولَّد تلقائياً بـ `node games/word-hive/tools/wh-report.js` — لا تعدّله يدوياً.',
    '',
    `- الجولات: ${bank.rounds.length} · المعتمدة: ${bank.approved.length} · المسودات: ${bank.drafts.length}`,
    `- شرط الاعتماد: ${E.MIN_APPROVED_WORDS} كلمة صحيحة فريدة على الأقل، وحالة معلنة approved، و7 أحرف مختلفة.`,
    '',
    '| الجولة | الوسط | الأحرف | الصعوبة | الكلمات الصحيحة | المرفوضة | الذهبية | الحالة |',
    '|---|---|---|---|---|---|---|---|'
];
bank.rounds.forEach(r => lines.push(`| ${r.id} | ${r.center} | ${r.letters.join(' ')} | ${DIFF[r.difficulty] || r.difficulty} | ${r.count} | ${r.rejected.length} | ${r.golden.join('، ') || '—'} | ${r.status === 'approved' ? 'معتمدة' : 'مسودة'} |`));
bank.rounds.forEach(r => {
    lines.push('', `## ${r.id} — الوسط «${r.center}» · ${r.status === 'approved' ? 'معتمدة' : 'مسودة'}`, '');
    if (r.problems.length) lines.push('**ملاحظات:** ' + r.problems.join(' · '), '');
    lines.push(`**الكلمات الصحيحة (${r.count}):** ${r.answers.join('، ')}`, '');
    lines.push(r.rejected.length ? '**المرفوضة:** ' + r.rejected.map(x => `${x.word} (${x.message})`).join('، ') : '**المرفوضة:** لا يوجد');
});
const out = path.join(__dirname, '..', 'rounds-report.md');
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log(`approved ${bank.approved.length} · drafts ${bank.drafts.length} → ${path.relative(process.cwd(), out)}`);
bank.rounds.forEach(r => console.log(`${r.id}\t${r.status}\t${r.count}\trejected:${r.rejected.length}`));
