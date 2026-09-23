/**
 * AGP LETTERS-CELL QUESTIONS SERVICE — مسودة بنك أسئلة "خلية الحروف"
 * المشتركة. صف واحد ثابت (id = 1) بجدول letters_cell_questions_draft؛
 * أي أدمن (أو مستخدم عنده can_manage_letters_cell) يحفظ فيه كل تعديل
 * فور حدوثه، فيبقى محفوظاً ومرئياً لأي أدمن آخر مهما حدّث الصفحة أو دخل
 * من جهاز مختلف — قبل تنزيل questions-bank.json ورفعه لـGitHub بوقت طويل.
 */

'use strict';

var db = require('../db/database');

function now() { return Date.now(); }

/**
 * @returns {{questions: Object, updatedAt: number}|null} null لو ما فيه
 *   مسودة محفوظة بعد (أول استخدام قبل أي حفظ).
 */
function getDraft() {
    var row = db.prepare('SELECT data, updated_at FROM letters_cell_questions_draft WHERE id = 1').get();
    if (!row) return null;
    var parsed;
    try { parsed = JSON.parse(row.data); } catch (err) { return null; }
    return { questions: parsed, updatedAt: row.updated_at };
}

/**
 * يستبدل المسودة بالكامل بآخر نسخة من لوحة الإدارة — نفس فلسفة
 * announcement/site_theme (صف واحد، آخر كتابة تفوز).
 * @param {Object} questions - { letter: [{id, question, answer, aliases}] }
 * @param {number} [updatedByUserId]
 * @returns {{success: boolean, error?: string}}
 */
function saveDraft(questions, updatedByUserId) {
    if (!questions || typeof questions !== 'object' || Array.isArray(questions)) {
        return { success: false, error: 'invalid_data' };
    }

    db.prepare(
        'INSERT INTO letters_cell_questions_draft (id, data, updated_by, updated_at) VALUES (1, ?, ?, ?) ' +
        'ON CONFLICT(id) DO UPDATE SET data = excluded.data, updated_by = excluded.updated_by, updated_at = excluded.updated_at'
    ).run(JSON.stringify(questions), updatedByUserId || null, now());

    return { success: true };
}

module.exports = {
    getDraft: getDraft,
    saveDraft: saveDraft
};
