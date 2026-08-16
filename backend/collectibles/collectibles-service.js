/**
 * ==========================================================================
 * AGP COLLECTIBLES SERVICE — إطارات + دخوليات (منح/سحب/تفعيل)
 * ==========================================================================
 *
 * منطق بحت هنا (بدون أي معالجة HTTP — ذلك في auth-router.js). يدير 3
 * أشياء منفصلة لكل مستخدم:
 *
 * 1) كتالوج الإطارات الثابت (frame_catalog) — 4 "خاصة" (founder/
 * streamer/supporter/distinguished) + 7 "مستوى" — أسماء ملفاتها
 * ثابتة، يرفعها الأدمن يدوياً لجذر المستودع (نفس أسلوب logo.png).
 *
 * 2) إطارات حصرية حرة (custom_frames) — اسم ملف حر يكتبه الأدمن كل
 * مرة يمنح فيها، بدون قيد على الكتالوج الثابت.
 *
 * 3) الدخولية (user_entrances) — نموذج أنيميشن ثابت بالواجهة (gold/
 * neon/fire/ice) + نص حر لكل مستخدم. [0.45.0] + عمود enabled (تفعيل/
 * إيقاف ذاتي من صاحب الحساب — راجع setEntranceEnabled أدناه).
 *
 * قاعدة "الحزمة التلقائية": منح أي إطار من الأربعة "الخاصة" (founder/
 * streamer/supporter/distinguished) يمنح تلقائياً دخولية مطابقة أيضاً
 * (افتراضياً من frame_catalog.default_entrance_*، أو نص/نموذج مخصص لو
 * مرَّره المستدعي). أي إطار آخر (مستوى أو حصري) لا يمنح دخولية إطلاقاً —
 * فقط الأدمن يقدر يضيفها يدوياً بشكل منفصل عبر setEntrance().
 *
 * ⚠️ صلاحية تجاوز الأدمن: grantFrame أدناه لا تتحقق أبداً من
 * level_points_required — أي إطار (حتى المقفول بمستوى) يُمنح فوراً لأي
 * مستخدم يستدعيها الأدمن من أجله، بصرف النظر عن نقاطه الفعلية. فتح
 * المستوى تلقائياً (autoGrantOnLevelUp) هو مسار إضافي منفصل تماماً،
 * وليس القيد الوحيد.
 * ==========================================================================
 */

'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');

function now() { return Date.now(); }

/* ----------------------------------------------------------------------
 * كتالوج الإطارات الثابت
 * ---------------------------------------------------------------------- */

function getCatalog() {
  return db.prepare("SELECT * FROM frame_catalog ORDER BY (kind = 'level'), slug").all();
}

function getCatalogEntry(slug) {
  return db.prepare('SELECT * FROM frame_catalog WHERE slug = ?').get(slug);
}

/**
 * تعديل الأدمن لصف كتالوج موجود مسبقاً (لا إنشاء صفوف جديدة هنا — الكتالوج
 * ثابت من حيث العدد والملفات، فقط بياناته الوصفية قابلة للتعديل).
 * @returns {{success: boolean, error?: string}}
 */
function updateCatalogEntry(slug, fields) {
  var entry = getCatalogEntry(slug);
  if (!entry) return { success: false, error: 'unknown_slug' };

  var displayName = fields.displayNameAr !== undefined ? String(fields.displayNameAr).trim() : entry.display_name_ar;
  var levelPoints = entry.level_points_required;
  if (fields.levelPointsRequired !== undefined) {
    var n = Number(fields.levelPointsRequired);
    levelPoints = (fields.levelPointsRequired === null || fields.levelPointsRequired === '') ? null : (isNaN(n) ? entry.level_points_required : n);
  }
  var entranceTemplate = fields.defaultEntranceTemplate !== undefined ? (fields.defaultEntranceTemplate || null) : entry.default_entrance_template;
  var entranceText = fields.defaultEntranceText !== undefined ? (fields.defaultEntranceText || null) : entry.default_entrance_text;

  db.prepare(
    'UPDATE frame_catalog SET display_name_ar = ?, level_points_required = ?, default_entrance_template = ?, default_entrance_text = ? WHERE slug = ?'
  ).run(displayName, levelPoints, entranceTemplate, entranceText, slug);

  return { success: true };
}

/* ----------------------------------------------------------------------
 * إطارات حصرية حرة
 * ---------------------------------------------------------------------- */

function listCustomFrames() {
  return db.prepare('SELECT * FROM custom_frames ORDER BY created_at DESC').all();
}

/**
 * @returns {{success: boolean, id?: number, error?: string}}
 */
function createCustomFrame(imageFilename, displayNameAr) {
  imageFilename = (imageFilename || '').trim();
  if (!imageFilename) return { success: false, error: 'empty_filename' };

  var info = db.prepare('INSERT INTO custom_frames (image_filename, display_name_ar, created_at) VALUES (?, ?, ?)')
    .run(imageFilename, (displayNameAr || '').trim(), now());

  return { success: true, id: info.lastInsertRowid };
}

/* ----------------------------------------------------------------------
 * منح/سحب/تفعيل الإطارات
 * ---------------------------------------------------------------------- */

/**
 * منح إطار لمستخدم. لا يتحقق من شرط المستوى إطلاقاً (راجع الملاحظة أعلى
 * الملف) — الاستدعاء نفسه هو التفويض. يمنح دخولية تلقائياً لو كان الإطار
 * من الأربعة "الخاصة" (frame_catalog.bundles_entrance = 1)، إلا لو
 * opts.skipEntranceBundle صراحة.
 *
 * @param {number} userId
 * @param {'catalog'|'custom'} frameType
 * @param {string} frameRef - slug (catalog) أو id كنص (custom)
 * @param {Object} [opts] - {grantedBy, entranceTemplate, entranceText, skipEntranceBundle}
 * @returns {{success: boolean, error?: string}}
 */
function grantFrame(userId, frameType, frameRef, opts) {
  opts = opts || {};
  frameRef = String(frameRef);

  if (frameType !== 'catalog' && frameType !== 'custom') return { success: false, error: 'invalid_frame_type' };

  var catalogEntry = null;
  if (frameType === 'catalog') {
    catalogEntry = getCatalogEntry(frameRef);
    if (!catalogEntry) return { success: false, error: 'unknown_catalog_slug' };
  } else {
    var customExists = db.prepare('SELECT id FROM custom_frames WHERE id = ?').get(frameRef);
    if (!customExists) return { success: false, error: 'unknown_custom_frame' };
  }

  db.prepare(
    'INSERT OR IGNORE INTO user_frames (user_id, frame_type, frame_ref, granted_by, equipped, granted_at) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(userId, frameType, frameRef, opts.grantedBy || 'admin_manual', now());

  if (catalogEntry && catalogEntry.bundles_entrance && !opts.skipEntranceBundle) {
    setEntrance(
      userId,
      opts.entranceTemplate || catalogEntry.default_entrance_template || 'gold',
      opts.entranceText || catalogEntry.default_entrance_text || '',
      opts.grantedBy === 'auto_permission' ? 'auto_bundle' : 'auto_bundle'
    );
  }

  logger.log('Collectibles: granted frame ' + frameType + ':' + frameRef + ' to user ' + userId);

  return { success: true };
}

/**
 * سحب إطار من مستخدم — لا يزيل الدخولية المرتبطة تلقائياً (قد تكون
 * الدخولية شيء يبيه الأدمن يبقى رغم سحب الإطار)؛ لسحبها أيضاً استدعِ
 * clearEntrance بشكل منفصل.
 * @returns {{success: boolean}}
 */
function revokeFrame(userId, frameType, frameRef) {
  db.prepare('DELETE FROM user_frames WHERE user_id = ? AND frame_type = ? AND frame_ref = ?')
    .run(userId, frameType, String(frameRef));

  return { success: true };
}

/**
 * تفعيل إطار مملوك كالإطار الظاهر الوحيد (يُلغي تفعيل أي إطار آخر لنفس
 * المستخدم أولاً). يُستخدَم من صفحة البروفايل من صاحب الحساب نفسه.
 * @returns {{success: boolean, error?: string}}
 */
function setEquipped(userId, frameType, frameRef) {
  var owned = db.prepare('SELECT id FROM user_frames WHERE user_id = ? AND frame_type = ? AND frame_ref = ?')
    .get(userId, frameType, String(frameRef));

  if (!owned) return { success: false, error: 'not_owned' };

  var tx = db.transaction(function () {
    db.prepare('UPDATE user_frames SET equipped = 0 WHERE user_id = ?').run(userId);
    db.prepare('UPDATE user_frames SET equipped = 1 WHERE id = ?').run(owned.id);
  });

  tx();

  return { success: true };
}

/**
 * كل الإطارات المملوكة لمستخدم، مع بيانات العرض (اسم عربي + ملف الصورة)
 * مدموجة من الكتالوج أو من custom_frames حسب النوع.
 * @returns {Array<Object>}
 */
function getUserFrames(userId) {
  var rows = db.prepare('SELECT * FROM user_frames WHERE user_id = ? ORDER BY granted_at DESC').all(userId);

  return rows.map(function (row) {
    var display = { image_filename: null, display_name_ar: '' };

    if (row.frame_type === 'catalog') {
      var cat = getCatalogEntry(row.frame_ref);
      if (cat) display = { image_filename: cat.image_filename, display_name_ar: cat.display_name_ar };
    } else {
      var custom = db.prepare('SELECT * FROM custom_frames WHERE id = ?').get(row.frame_ref);
      if (custom) display = { image_filename: custom.image_filename, display_name_ar: custom.display_name_ar };
    }

    return {
      frameType: row.frame_type,
      frameRef: row.frame_ref,
      equipped: Boolean(row.equipped),
      grantedBy: row.granted_by,
      grantedAt: row.granted_at,
      imageFilename: display.image_filename,
      displayNameAr: display.display_name_ar
    };
  });
}

/**
 * ⚠️ الإطار المفعَّل حالياً (equipped) لمستخدم مسجَّل بالمنصة،
 * *فقط* لو ربط ووثَّق (tiktok_verified = 1) نفس يوزرنيم التيك توك
 * الممرَّر — يُستخدَم من tiktok-connector.js عند كل تعليق وارد بالشات
 * عشان نعرف هل هذا المعلِّق يملك إطاراً مفعَّلاً يظهر ببطاقته باللوبي.
 *
 * ⚠️ الاستعلام هنا مكرَّر عمداً (بدل استدعاء
 * authService.findVerifiedUserByTikTok) لتفادي اعتمادية دائرية —
 * auth-service.js يستورد هذا الملف أصلاً، فلا يجوز العكس. نفس شرط
 * التحقق بالضبط (tiktok_verified = 1، مطابقة غير حساسة لحالة الأحرف).
 *
 * @param {string} tiktokUsername - يوزرنيم تيك توك خام (بدون بادئة 'tiktok:')
 * @returns {{frameType: string, frameRef: string, imageFilename: string}|null}
 */
function getEquippedFrameForVerifiedTikTok(tiktokUsername) {
  tiktokUsername = (tiktokUsername || '').trim();
  if (!tiktokUsername) return null;

  // [0.45.6] "= ? COLLATE NOCASE" بدل LOWER(tiktok_username) = LOWER(?) —
  // يسمح باستخدام فهرس idx_users_tiktok_username_nocase (راجع backend/
  // db/database.js) بدل مسح جدول users كاملاً على كل تعليق وارد بالشات.
  var user = db.prepare(
    'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
  ).get(tiktokUsername);

  if (!user) return null;

  var row = db.prepare('SELECT * FROM user_frames WHERE user_id = ? AND equipped = 1').get(user.id);
  if (!row) return null;

  var imageFilename = null;
  if (row.frame_type === 'catalog') {
    var cat = getCatalogEntry(row.frame_ref);
    if (cat) imageFilename = cat.image_filename;
  } else {
    var custom = db.prepare('SELECT * FROM custom_frames WHERE id = ?').get(row.frame_ref);
    if (custom) imageFilename = custom.image_filename;
  }

  if (!imageFilename) return null;

  return { frameType: row.frame_type, frameRef: row.frame_ref, imageFilename: imageFilename };
}

/**
 * ⚠️ [0.44.4] الدخولية النشطة حالياً لمستخدم مسجَّل بالمنصة، *فقط* لو
 * ربط ووثَّق (tiktok_verified = 1) نفس يوزرنيم التيك توك الممرَّر —
 * نظير getEquippedFrameForVerifiedTikTok أعلاه بالضبط (نفس منطق
 * التحقق ونفس سبب تكرار الاستعلام بدل استدعاء auth-service.js).
 *
 * ⚠️ [0.45.0] تُستبعَد الآن أي دخولية مُطفأة ذاتياً من صاحبها
 * (enabled = 0) — تماماً كأنها غير موجودة من منظور اللوبي، رغم بقاء
 * قالبها/نصها محفوظين بالصف بقاعدة البيانات (راجع setEntranceEnabled
 * أدناه لإعادة التفعيل بضغطة واحدة).
 *
 * ⚠️ [0.45.11] **شرط جديد**: الدخولية الآن تتطلب أيضاً وجود **إطار
 * مُجهَّز فعلاً** (user_frames.equipped = 1) لنفس المستخدم — نفس شرط
 * getEquippedFrameForVerifiedTikTok أعلاه بالضبط، بطلب صريح من صاحب
 * المنصة بعد تشخيص حالة حقيقية: حساب عنده دخولية مفعَّلة (enabled=1)
 * وإطار *ممنوح* لكن غير *مُجهَّز* من صاحبه بعد — النتيجة: الإطار ما
 * يظهر (متوقَّع، ما جُهِّز)، لكن الدخولية أيضاً ما ظهرت رغم إنها كانت
 * "مفعَّلة" بالبروفايل — لأن التفعيل الذاتي (enabled) شيء، وتجهيز إطار
 * فعلي شيء ثاني تماماً، وما كان فيه ربط بينهما. الحل: اعتماد "نفس أساس
 * تفعيل الإطار" كشرط إضافي للدخولية، بدل الاعتماد فقط على enabled
 * المنفصل — يعني: **دخولية بلا إطار مُجهَّز = لا تظهر باللوبي إطلاقاً**،
 * حتى لو enabled=1. لا حذف لأي بيانات — enabled يبقى كما هو بقاعدة
 * البيانات (يقدر المستخدم لسا يوقفها/يفعّلها من بروفايله بشكل طبيعي)،
 * فقط شرط عرض إضافي بهذي الدالة تحديداً.
 * @param {string} tiktokUsername - يوزرنيم تيك توك خام (بدون بادئة 'tiktok:')
 * @returns {{templateKey: string, entranceText: string}|null}
 */
function getEquippedEntranceForVerifiedTikTok(tiktokUsername) {
  tiktokUsername = (tiktokUsername || '').trim();
  if (!tiktokUsername) return null;

  // [0.45.6] نفس تعليق getEquippedFrameForVerifiedTikTok أعلاه بالضبط.
  var user = db.prepare(
    'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
  ).get(tiktokUsername);

  if (!user) return null;

  // [0.45.11] الشرط الجديد: إطار مُجهَّز فعلاً (بصرف النظر عن نوعه —
  // كتالوج أو حصري، ونوعه بالضبط غير مهم هنا، فقط وجوده).
  var hasEquippedFrame = db.prepare('SELECT id FROM user_frames WHERE user_id = ? AND equipped = 1').get(user.id);
  if (!hasEquippedFrame) return null;

  var row = db.prepare('SELECT template_key, entrance_text FROM user_entrances WHERE user_id = ? AND enabled = 1').get(user.id);
  if (!row) return null;

  return { templateKey: row.template_key, entranceText: row.entrance_text || '' };
}

/* ----------------------------------------------------------------------
 * الدخولية (نموذج أنيميشن + نص حر)
 * ---------------------------------------------------------------------- */

/**
 * تعيين/استبدال الدخولية النشطة لمستخدم بالكامل — سواء تلقائياً (كجزء
 * من حزمة إطار خاص) أو يدوياً من الأدمن بشكل منفصل تماماً عن أي إطار.
 * [0.45.0] كل استبدال/تعيين جديد يعيد enabled = 1 تلقائياً (منح جديد
 * من الأدمن يُفترَض يكون فعّالاً فوراً، حتى لو كانت دخولية سابقة
 * لنفس المستخدم مطفأة ذاتياً قبل هذا).
 * @param {'gold'|'neon'|'fire'|'ice'} templateKey
 */
function setEntrance(userId, templateKey, entranceText, source) {
  db.prepare(
    'INSERT INTO user_entrances (user_id, template_key, entrance_text, source, enabled, updated_at) VALUES (?, ?, ?, ?, 1, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET template_key = excluded.template_key, entrance_text = excluded.entrance_text, source = excluded.source, enabled = 1, updated_at = excluded.updated_at'
  ).run(userId, templateKey, entranceText || '', source || 'admin_manual', now());

  return { success: true };
}

function clearEntrance(userId) {
  db.prepare('DELETE FROM user_entrances WHERE user_id = ?').run(userId);

  return { success: true };
}

function getEntrance(userId) {
  return db.prepare('SELECT template_key, entrance_text, source, enabled FROM user_entrances WHERE user_id = ?').get(userId) || null;
}

/**
 * [0.45.0] تفعيل/إيقاف ذاتي من صاحب الحساب نفسه — لا يحذف الصف (يبقى
 * القالب/النص محفوظين لإعادة التفعيل بضغطة واحدة لاحقاً)، فقط يبدّل
 * عمود enabled. يفشل بأمان (success: false) لو المستخدم ما عنده
 * دخولية أصلاً (لا شيء لتفعيله/إيقافه).
 * @param {number} userId
 * @param {boolean} enabled
 * @returns {{success: boolean, error?: string}}
 */
function setEntranceEnabled(userId, enabled) {
  var existing = db.prepare('SELECT user_id FROM user_entrances WHERE user_id = ?').get(userId);
  if (!existing) return { success: false, error: 'no_entrance' };

  db.prepare('UPDATE user_entrances SET enabled = ?, updated_at = ? WHERE user_id = ?')
    .run(enabled ? 1 : 0, now(), userId);

  return { success: true };
}

/* ----------------------------------------------------------------------
 * فتح تلقائي عند بلوغ مستوى (يُستدعى من points-service.js بعد كل زيادة
 * بالنقاط — لا معرفة هنا بكيفية حساب النقاط نفسها).
 * ---------------------------------------------------------------------- */

/**
 * يمنح تلقائياً أي إطار "مستوى" لم يمتلكه المستخدم بعد وبلغ شرط نقاطه
 * (level_points_required قد تكون NULL لمستوى لم يحدده الأدمن بعد — يُتجاهَل).
 * لا يمنح دخولية (إطارات المستوى لا تأتي بحزمة دخولية — راجع ملاحظة أعلى
 * الملف)، ولا يسحب أي إطار مستوى سابق.
 */
function autoGrantOnLevelUp(userId, totalPoints) {
  var levelRows = db.prepare("SELECT slug, level_points_required FROM frame_catalog WHERE kind = 'level' AND level_points_required IS NOT NULL").all();

  levelRows.forEach(function (row) {
    if (totalPoints < row.level_points_required) return;

    var owned = db.prepare("SELECT id FROM user_frames WHERE user_id = ? AND frame_type = 'catalog' AND frame_ref = ?").get(userId, row.slug);
    if (owned) return;

    grantFrame(userId, 'catalog', row.slug, { grantedBy: 'auto_level', skipEntranceBundle: true });
  });
}

module.exports = {
  getCatalog: getCatalog,
  getCatalogEntry: getCatalogEntry,
  updateCatalogEntry: updateCatalogEntry,
  listCustomFrames: listCustomFrames,
  createCustomFrame: createCustomFrame,
  grantFrame: grantFrame,
  revokeFrame: revokeFrame,
  setEquipped: setEquipped,
  getUserFrames: getUserFrames,
  getEquippedFrameForVerifiedTikTok: getEquippedFrameForVerifiedTikTok,
  getEquippedEntranceForVerifiedTikTok: getEquippedEntranceForVerifiedTikTok,
  setEntrance: setEntrance,
  clearEntrance: clearEntrance,
  getEntrance: getEntrance,
  setEntranceEnabled: setEntranceEnabled,
  autoGrantOnLevelUp: autoGrantOnLevelUp
};
