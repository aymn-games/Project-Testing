/**
 * AGP COLLECTIBLES SERVICE — إطارات + دخوليات (منح/سحب/تفعيل). يدير 3
 * أشياء منفصلة لكل مستخدم:
 * 1) كتالوج الإطارات الثابت (frame_catalog) — 4 "خاصة" + 7 "مستوى".
 * 2) إطارات حصرية حرة (custom_frames) — اسم ملف حر يكتبه الأدمن كل منح.
 * 3) الدخولية (user_entrances) — نموذج أنيميشن (gold/neon/fire/ice) + نص
 *    حر، مع عمود enabled (تفعيل/إيقاف ذاتي من صاحب الحساب).
 * 4) بطاقة الإقصاء (user_elim_cards) — منح يدوي من الأدمن + تفعيل/إيقاف
 *    ذاتي، مستقلة عن الإطارات.
 *
 * قاعدة "الحزمة التلقائية": منح أي إطار من الأربعة "الخاصة" يمنح تلقائياً
 * دخولية مطابقة (من frame_catalog.default_entrance_*، أو مخصصة). أي إطار
 * آخر (مستوى أو حصري) لا يمنح دخولية — فقط الأدمن يضيفها عبر setEntrance().
 *
 * ⚠️ grantFrame لا تتحقق من level_points_required — أي إطار يُمنح فوراً
 * بصرف النظر عن نقاط المستخدم؛ فتح المستوى تلقائياً (autoGrantOnLevelUp)
 * مسار إضافي منفصل، وليس القيد الوحيد.
 */

'use strict';

var crypto = require('crypto');
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
      'auto_bundle'
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
 * الإطار المفعَّل حالياً لمستخدم مسجَّل، فقط لو ربط ووثَّق (tiktok_verified
 * = 1) نفس يوزرنيم التيك توك الممرَّر. يُستخدَم عند كل تعليق وارد بالشات.
 *
 * ⚠️ الاستعلام مكرَّر عمداً (بدل authService.findVerifiedUserByTikTok)
 * لتفادي اعتمادية دائرية — auth-service.js يستورد هذا الملف أصلاً.
 *
 * @param {string} tiktokUsername - يوزرنيم تيك توك خام (بدون بادئة 'tiktok:')
 * @returns {{frameType: string, frameRef: string, imageFilename: string}|null}
 */
function getEquippedFrameForVerifiedTikTok(tiktokUsername) {
  tiktokUsername = (tiktokUsername || '').trim();
  if (!tiktokUsername) return null;

  // "= ? COLLATE NOCASE" بدل LOWER() — يسمح باستخدام فهرس
  // idx_users_tiktok_username_nocase بدل مسح جدول users كاملاً كل تعليق.
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
 * الدخولية النشطة حالياً لمستخدم مسجَّل، فقط لو ربط ووثَّق نفس يوزرنيم
 * التيك توك الممرَّر — نظير getEquippedFrameForVerifiedTikTok أعلاه.
 *
 * تُستبعَد أي دخولية مُطفأة ذاتياً (enabled = 0)، وأيضاً أي دخولية بلا
 * إطار مُجهَّز فعلاً (user_frames.equipped = 1) لنفس المستخدم — تفعيل
 * الدخولية ذاتياً وتجهيز إطار شيئان منفصلان، وكلاهما مطلوب للظهور باللوبي.
 * لا حذف بيانات — enabled يبقى كما هو، فقط شرط عرض إضافي هنا.
 * @param {string} tiktokUsername - يوزرنيم تيك توك خام (بدون بادئة 'tiktok:')
 * @returns {{templateKey: string, entranceText: string}|null}
 */
function getEquippedEntranceForVerifiedTikTok(tiktokUsername) {
  tiktokUsername = (tiktokUsername || '').trim();
  if (!tiktokUsername) return null;

  var user = db.prepare(
    'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
  ).get(tiktokUsername);

  if (!user) return null;

  // إطار مُجهَّز فعلاً (بصرف النظر عن نوعه، فقط وجوده).
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
 * تعيين/استبدال الدخولية النشطة لمستخدم بالكامل — تلقائياً (حزمة إطار
 * خاص) أو يدوياً من الأدمن. كل تعيين جديد يعيد enabled = 1 تلقائياً.
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
 * تفعيل/إيقاف ذاتي من صاحب الحساب — لا يحذف الصف، فقط يبدّل عمود enabled.
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
 * بطاقة الإقصاء — منح/سحب يدوي من الأدمن فقط، مستقلة عن الإطارات. تظهر
 * بدل بطاقة إعلان الإقصاء العادية فقط لو "المُقصي" يملكها ومفعّلها.
 * ---------------------------------------------------------------------- */

// المفاتيح المسموحة — تصميم كل بطاقة (صورة + مواضع الدوائر والنص) معرَّف
// بنفس المفتاح في js/agp-elim-card.js.
var ELIM_CARD_CATALOG = [
  { key: 'ksa-green', displayNameAr: 'بطاقة الإقصاء — السعودية الخضراء', imageFilename: 'assets/elim-cards/elim-card-ksa-green.png' },
  { key: 'blue-bunny', displayNameAr: 'بطاقة الإقصاء — الأرنب الأزرق', imageFilename: 'assets/elim-cards/elim-card-blue-bunny.png' }
];

function getElimCardCatalog() {
  return ELIM_CARD_CATALOG.slice();
}

function isValidElimCardKey(cardKey) {
  return ELIM_CARD_CATALOG.some(function (c) { return c.key === cardKey; });
}

/**
 * منح/استبدال بطاقة الإقصاء لمستخدم (بطاقة واحدة لكل مستخدم). كل منح
 * جديد يعيد enabled = 1.
 * @returns {{success: boolean, error?: string}}
 */
function grantElimCard(userId, cardKey, grantedBy) {
  cardKey = String(cardKey || '');
  if (!isValidElimCardKey(cardKey)) return { success: false, error: 'unknown_card_key' };

  var userExists = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!userExists) return { success: false, error: 'unknown_user' };

  db.prepare(
    'INSERT INTO user_elim_cards (user_id, card_key, enabled, granted_by, granted_at) VALUES (?, ?, 1, ?, ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET card_key = excluded.card_key, enabled = 1, granted_by = excluded.granted_by, granted_at = excluded.granted_at'
  ).run(userId, cardKey, grantedBy || 'admin_manual', now());

  logger.log('Collectibles: granted elimination card ' + cardKey + ' to user ' + userId);

  return { success: true };
}

function revokeElimCard(userId) {
  db.prepare('DELETE FROM user_elim_cards WHERE user_id = ?').run(userId);

  return { success: true };
}

/** للبروفايل — null لو ما يملك بطاقة. */
function getElimCard(userId) {
  var row = db.prepare('SELECT card_key, enabled, granted_at FROM user_elim_cards WHERE user_id = ?').get(userId);
  if (!row) return null;

  var entry = ELIM_CARD_CATALOG.filter(function (c) { return c.key === row.card_key; })[0];

  return {
    cardKey: row.card_key,
    displayNameAr: entry ? entry.displayNameAr : row.card_key,
    imageFilename: entry ? entry.imageFilename : null,
    enabled: Boolean(row.enabled),
    grantedAt: row.granted_at
  };
}

/**
 * تفعيل/إيقاف ذاتي من صاحب الحساب — نفس نمط setEntranceEnabled.
 * @returns {{success: boolean, error?: string}}
 */
function setElimCardEnabled(userId, enabled) {
  var existing = db.prepare('SELECT user_id FROM user_elim_cards WHERE user_id = ?').get(userId);
  if (!existing) return { success: false, error: 'no_elim_card' };

  db.prepare('UPDATE user_elim_cards SET enabled = ? WHERE user_id = ?').run(enabled ? 1 : 0, userId);

  return { success: true };
}

/**
 * بطاقة الإقصاء المفعّلة لصاحب تعليق — فقط لحساب مسجَّل وثَّق نفس يوزرنيم
 * التيك توك، ونفس نمط getEquippedFrameForVerifiedTikTok أعلاه.
 * @param {string} tiktokUsername - يوزرنيم تيك توك خام (بدون بادئة 'tiktok:')
 * @returns {{cardKey: string}|null}
 */
function getElimCardForVerifiedTikTok(tiktokUsername) {
  tiktokUsername = (tiktokUsername || '').trim();
  if (!tiktokUsername) return null;

  var user = db.prepare(
    'SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE'
  ).get(tiktokUsername);

  if (!user) return null;

  var row = db.prepare('SELECT card_key FROM user_elim_cards WHERE user_id = ? AND enabled = 1').get(user.id);
  if (!row || !isValidElimCardKey(row.card_key)) return null;

  return { cardKey: row.card_key };
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

/* ----------------------------------------------------------------------
 * أكواد استرداد الإطارات (بيع عبر متجر خارجي)
 * الأدمن يولّد دفعة أكواد لإطار معيّن ويرفعها للمتجر، والمتجر يرسل كوداً
 * واحداً لكل مشتري. الاسترداد يمنح الإطار فقط (بدون دخولية) ويُعلِّم الكود
 * كمستخدَم مرة واحدة فقط.
 * ---------------------------------------------------------------------- */

// بدون أحرف متشابهة (0/O، 1/I/L) لتقليل أخطاء الكتابة.
var CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
var MAX_CODES_PER_BATCH = 500;

function randomCodeChunk(length) {
  var out = '';
  for (var i = 0; i < length; i++) out += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return out;
}

/** "agp 7k3m-q9xd" / "AGP7K3MQ9XD" → "AGP-7K3M-Q9XD" */
function normalizeFrameCode(raw) {
  var compact = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (compact.indexOf('AGP') === 0) compact = compact.slice(3);
  if (compact.length !== 8) return null;
  return 'AGP-' + compact.slice(0, 4) + '-' + compact.slice(4);
}

function frameExists(frameType, frameRef) {
  if (frameType === 'catalog') return Boolean(getCatalogEntry(frameRef));
  if (frameType === 'custom') return Boolean(db.prepare('SELECT id FROM custom_frames WHERE id = ?').get(frameRef));
  return false;
}

function frameDisplay(frameType, frameRef) {
  if (frameType === 'catalog') {
    var cat = getCatalogEntry(frameRef);
    return cat ? { imageFilename: cat.image_filename, displayNameAr: cat.display_name_ar } : null;
  }
  var custom = db.prepare('SELECT image_filename, display_name_ar FROM custom_frames WHERE id = ?').get(frameRef);
  return custom ? { imageFilename: custom.image_filename, displayNameAr: custom.display_name_ar } : null;
}

/**
 * توليد دفعة أكواد لإطار واحد.
 * @returns {{success: boolean, codes?: string[], error?: string}}
 */
function generateFrameCodes(frameType, frameRef, count, note) {
  frameRef = String(frameRef);
  count = Math.floor(Number(count));
  if (!count || count < 1 || count > MAX_CODES_PER_BATCH) return { success: false, error: 'invalid_count' };
  if (!frameExists(frameType, frameRef)) return { success: false, error: 'unknown_frame' };

  var insert = db.prepare('INSERT OR IGNORE INTO frame_codes (code, frame_type, frame_ref, note, created_at) VALUES (?, ?, ?, ?, ?)');
  var codes = [];
  var createdAt = now();
  db.transaction(function () {
    while (codes.length < count) {
      var code = 'AGP-' + randomCodeChunk(4) + '-' + randomCodeChunk(4);
      if (insert.run(code, frameType, frameRef, String(note || '').slice(0, 200), createdAt).changes === 1) codes.push(code);
    }
  })();

  logger.log('Collectibles: generated ' + codes.length + ' redeem codes for frame ' + frameType + ':' + frameRef);
  return { success: true, codes: codes };
}

/** آخر الأكواد (الأحدث أولاً) مع اسم الإطار ومن استردها. */
function listFrameCodes(limit) {
  limit = Math.min(Math.max(Math.floor(Number(limit)) || 300, 1), 2000);
  var rows = db.prepare(
    'SELECT c.*, u.username AS redeemed_username, u.custom_id AS redeemed_custom_id ' +
    'FROM frame_codes c LEFT JOIN users u ON u.id = c.redeemed_by ' +
    'ORDER BY c.created_at DESC, c.code ASC LIMIT ?'
  ).all(limit);
  return rows.map(function (row) {
    var display = frameDisplay(row.frame_type, row.frame_ref) || {};
    return {
      code: row.code,
      frameType: row.frame_type,
      frameRef: row.frame_ref,
      displayNameAr: display.displayNameAr || '',
      note: row.note,
      createdAt: row.created_at,
      redeemedAt: row.redeemed_at,
      redeemedBy: row.redeemed_by,
      redeemedUsername: row.redeemed_username || null,
      redeemedCustomId: row.redeemed_custom_id || null
    };
  });
}

// حد المحاولات الفاشلة لكل مستخدم (ذاكرة فقط — يتصفّر مع إعادة تشغيل
// الخادم، وهذا كافٍ لمنع تخمين الأكواد).
var REDEEM_MAX_FAILS = 10;
var REDEEM_WINDOW_MS = 15 * 60 * 1000;
var redeemFails = {};

function isRedeemRateLimited(userId) {
  var entry = redeemFails[userId];
  if (!entry || now() - entry.since > REDEEM_WINDOW_MS) return false;
  return entry.count >= REDEEM_MAX_FAILS;
}

function recordRedeemFail(userId) {
  var entry = redeemFails[userId];
  if (!entry || now() - entry.since > REDEEM_WINDOW_MS) entry = redeemFails[userId] = { count: 0, since: now() };
  entry.count++;
}

/**
 * استرداد كود من صاحب الحساب. لو يملك الإطار مسبقاً يُرفض ويبقى الكود صالحاً.
 * @returns {{success: boolean, frame?: Object, error?: string}}
 */
function redeemFrameCode(userId, rawCode) {
  if (isRedeemRateLimited(userId)) return { success: false, error: 'rate_limited' };

  var code = normalizeFrameCode(rawCode);
  var row = code ? db.prepare('SELECT * FROM frame_codes WHERE code = ?').get(code) : null;
  if (!row) { recordRedeemFail(userId); return { success: false, error: 'invalid_code' }; }
  if (row.redeemed_at) return { success: false, error: 'code_used' };

  var owned = db.prepare('SELECT id FROM user_frames WHERE user_id = ? AND frame_type = ? AND frame_ref = ?')
    .get(userId, row.frame_type, row.frame_ref);
  if (owned) return { success: false, error: 'already_owned' };

  var result = db.transaction(function () {
    var claimed = db.prepare('UPDATE frame_codes SET redeemed_by = ?, redeemed_at = ? WHERE code = ? AND redeemed_at IS NULL')
      .run(userId, now(), code);
    if (claimed.changes !== 1) return { success: false, error: 'code_used' };
    var granted = grantFrame(userId, row.frame_type, row.frame_ref, { grantedBy: 'redeem_code', skipEntranceBundle: true });
    if (!granted.success) throw new Error('grant_failed:' + granted.error); // يلغي تعليم الكود
    return { success: true };
  })();
  if (!result.success) return result;

  logger.log('Collectibles: user ' + userId + ' redeemed code ' + code);
  return { success: true, frame: Object.assign({ frameType: row.frame_type, frameRef: row.frame_ref }, frameDisplay(row.frame_type, row.frame_ref)) };
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
  autoGrantOnLevelUp: autoGrantOnLevelUp,
  getElimCardCatalog: getElimCardCatalog,
  grantElimCard: grantElimCard,
  revokeElimCard: revokeElimCard,
  getElimCard: getElimCard,
  setElimCardEnabled: setElimCardEnabled,
  getElimCardForVerifiedTikTok: getElimCardForVerifiedTikTok,
  generateFrameCodes: generateFrameCodes,
  listFrameCodes: listFrameCodes,
  redeemFrameCode: redeemFrameCode
};
