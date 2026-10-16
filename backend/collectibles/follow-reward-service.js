/**
 * مكافأة متابعة حساب تيك توك المنصة (@aymngame): أي مستخدم موثَّق يتابع
 * الحساب ياخذ إطار واحد يختاره بنفسه من كل الإطارات.
 *
 * التدفق:
 *  1. أثناء بث حساب المنصة (platform-follow-watcher أو أي لعبة متصلة
 *     ببثه) — حدث متابعة، أو تعليق من متابع → noteFollower → صف 'pending'.
 *  2. المستخدم يدخل الموقع → الرئيسية تعرض نافذة "تأكدنا من متابعتك" مع
 *     كل الإطارات (getRewardForUser) → يختار واحد → claimReward يمنحه.
 *  3. لو علّق لاحقاً ببث المنصة وطلع (بثقة) مو متابع → noteNonFollower
 *     يسحب إطار المكافأة فقط (granted_by = 'follow_reward') → 'revoked'.
 *     لو رجع تابع، يرجع 'pending' ويختار من جديد.
 */
'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');
var collectiblesService = require('./collectibles-service');

var PLATFORM_TIKTOK_USERNAME = (process.env.PLATFORM_TIKTOK_USERNAME || 'aymngame').toLowerCase();
var GRANTED_BY = 'follow_reward';

function now() { return Date.now(); }

function normalize(username) {
  return String(username || '').trim().replace(/^@+/, '').toLowerCase();
}

/** هل البث المتصل به هو بث حساب المنصة؟ */
function isPlatformStream(streamUsername) {
  return normalize(streamUsername) === PLATFORM_TIKTOK_USERNAME;
}

function findVerifiedUserId(tiktokUsername) {
  var u = normalize(tiktokUsername);
  if (!u) return null;
  var row = db.prepare('SELECT id FROM users WHERE tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE').get(u);
  return row ? row.id : null;
}

function getRow(userId) {
  return db.prepare('SELECT * FROM follow_rewards WHERE user_id = ?').get(userId);
}

/**
 * تأكدنا إن هذا اليوزر متابع لحساب المنصة.
 * @returns {boolean} true لو صار عنده مكافأة جديدة بانتظار الاختيار
 */
function noteFollower(tiktokUsername) {
  try {
    var userId = findVerifiedUserId(tiktokUsername);
    if (!userId) return false;
    var row = getRow(userId);
    if (row && row.status !== 'revoked') return false;
    db.prepare(
      "INSERT INTO follow_rewards (user_id, status, frame_type, frame_ref, detected_at, claimed_at) VALUES (?, 'pending', NULL, NULL, ?, NULL) " +
      "ON CONFLICT(user_id) DO UPDATE SET status = 'pending', frame_type = NULL, frame_ref = NULL, detected_at = excluded.detected_at, claimed_at = NULL"
    ).run(userId, now());
    logger.log('Follow reward: user ' + userId + ' (@' + normalize(tiktokUsername) + ') confirmed as follower — reward pending.');
    return true;
  } catch (err) {
    logger.error('Follow reward: noteFollower failed:', err.message);
    return false;
  }
}

/**
 * تأكدنا (بثقة) إن هذا اليوزر مو متابع — يسحب المكافأة لو كانت عنده.
 * @returns {boolean} true لو انسحبت
 */
function noteNonFollower(tiktokUsername) {
  try {
    var userId = findVerifiedUserId(tiktokUsername);
    if (!userId) return false;
    var row = getRow(userId);
    if (!row || row.status === 'revoked') return false;

    var tx = db.transaction(function () {
      if (row.status === 'claimed' && row.frame_type && row.frame_ref) {
        // نسحب الإطار فقط لو انمنح من المكافأة نفسها — مو لو كان يملكه من قبل.
        db.prepare('DELETE FROM user_frames WHERE user_id = ? AND frame_type = ? AND frame_ref = ? AND granted_by = ?')
          .run(userId, row.frame_type, row.frame_ref, GRANTED_BY);
      }
      db.prepare("UPDATE follow_rewards SET status = 'revoked' WHERE user_id = ?").run(userId);
    });
    tx();
    logger.log('Follow reward: user ' + userId + ' (@' + normalize(tiktokUsername) + ') no longer follows — reward revoked.');
    return true;
  } catch (err) {
    logger.error('Follow reward: noteNonFollower failed:', err.message);
    return false;
  }
}

/** كل الإطارات (الكتالوج + الحصرية) مع حالة الاستثناء من المكافأة. */
function listAllFrames() {
  var excluded = {};
  db.prepare('SELECT frame_type, frame_ref FROM follow_reward_excluded_frames').all()
    .forEach(function (r) { excluded[r.frame_type + ':' + r.frame_ref] = true; });

  var frames = [];
  collectiblesService.getCatalog().forEach(function (c) {
    frames.push({ frameType: 'catalog', frameRef: c.slug, imageFilename: c.image_filename, displayNameAr: c.display_name_ar || '', excluded: Boolean(excluded['catalog:' + c.slug]) });
  });
  collectiblesService.listCustomFrames().forEach(function (c) {
    var ref = String(c.id);
    frames.push({ frameType: 'custom', frameRef: ref, imageFilename: c.image_filename, displayNameAr: c.display_name_ar || '', excluded: Boolean(excluded['custom:' + ref]) });
  });
  return frames;
}

/** الإطارات المتاحة للاختيار: غير مستثناة من الأدمن، وما يملكها المستخدم. */
function listChoices(userId) {
  var owned = {};
  db.prepare('SELECT frame_type, frame_ref FROM user_frames WHERE user_id = ?').all(userId)
    .forEach(function (r) { owned[r.frame_type + ':' + r.frame_ref] = true; });

  return listAllFrames()
    .filter(function (f) { return !f.excluded && !owned[f.frameType + ':' + f.frameRef]; })
    .map(function (f) { return { frameType: f.frameType, frameRef: f.frameRef, imageFilename: f.imageFilename, displayNameAr: f.displayNameAr }; });
}

/* ---- الأدمن ---- */

/** كل الإطارات مع حالة الاستثناء + أعداد المكافآت حسب الحالة. */
function getAdminOverview() {
  var counts = { pending: 0, claimed: 0, revoked: 0 };
  db.prepare('SELECT status, COUNT(*) AS n FROM follow_rewards GROUP BY status').all()
    .forEach(function (r) { counts[r.status] = r.n; });
  return { platformTikTok: PLATFORM_TIKTOK_USERNAME, counts: counts, frames: listAllFrames() };
}

/**
 * استثناء إطار من قائمة الاختيار أو إرجاعه. ما يأثر على من اختاره من قبل.
 * @returns {{success: boolean, error?: string}}
 */
function setFrameExcluded(frameType, frameRef, excluded) {
  frameRef = String(frameRef == null ? '' : frameRef);
  var exists = listAllFrames().some(function (f) { return f.frameType === frameType && f.frameRef === frameRef; });
  if (!exists) return { success: false, error: 'unknown_frame' };
  if (excluded) {
    db.prepare('INSERT OR IGNORE INTO follow_reward_excluded_frames (frame_type, frame_ref) VALUES (?, ?)').run(frameType, frameRef);
  } else {
    db.prepare('DELETE FROM follow_reward_excluded_frames WHERE frame_type = ? AND frame_ref = ?').run(frameType, frameRef);
  }
  return { success: true };
}

/**
 * حالة مكافأة المستخدم للواجهة. choices ترجع بس لو المكافأة بانتظار الاختيار.
 * @returns {{status: string|null, platformTikTok: string, choices?: Array}}
 */
function getRewardForUser(userId) {
  var row = getRow(userId);
  var result = { status: row ? row.status : null, platformTikTok: PLATFORM_TIKTOK_USERNAME };
  if (row && row.status === 'pending') result.choices = listChoices(userId);
  return result;
}

/**
 * المستخدم اختار إطاره.
 * @returns {{success: boolean, error?: string}}
 */
function claimReward(userId, frameType, frameRef) {
  frameRef = String(frameRef == null ? '' : frameRef);
  var row = getRow(userId);
  if (!row || row.status !== 'pending') return { success: false, error: 'no_pending_reward' };

  var allowed = listChoices(userId).some(function (c) { return c.frameType === frameType && c.frameRef === frameRef; });
  if (!allowed) return { success: false, error: 'invalid_frame' };

  var result = { success: false, error: 'grant_failed' };
  var tx = db.transaction(function () {
    // نتأكد مرة ثانية داخل المعاملة — يمنع طلبين متزامنين ياخذون إطارين.
    var fresh = getRow(userId);
    if (!fresh || fresh.status !== 'pending') { result = { success: false, error: 'no_pending_reward' }; return; }
    var grant = collectiblesService.grantFrame(userId, frameType, frameRef, { grantedBy: GRANTED_BY, skipEntranceBundle: true });
    if (!grant.success) { result = grant; return; }
    db.prepare("UPDATE follow_rewards SET status = 'claimed', frame_type = ?, frame_ref = ?, claimed_at = ? WHERE user_id = ?")
      .run(frameType, frameRef, now(), userId);
    result = { success: true };
  });
  tx();
  return result;
}

module.exports = {
  PLATFORM_TIKTOK_USERNAME: PLATFORM_TIKTOK_USERNAME,
  isPlatformStream: isPlatformStream,
  noteFollower: noteFollower,
  noteNonFollower: noteNonFollower,
  getRewardForUser: getRewardForUser,
  claimReward: claimReward,
  getAdminOverview: getAdminOverview,
  setFrameExcluded: setFrameExcluded
};
