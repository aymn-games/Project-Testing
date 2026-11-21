/**
 * AGP COINS SERVICE — «عملات أيمن»: عملة تنصرف (مختلفة عن النقاط اللي هي
 * خبرة ومستوى بس). كل القيم هنا ثابتة بالكود، وأي تعديل عليها ينطبق على
 * كل الألعاب مرة وحدة (نفس فكرة points-service.js).
 *
 * الرصيد = مجموع سجل الحركات (coin_ledger). كل إضافة أو خصم تنكتب بسطر
 * ما ينعدل، والرصيد المخزّن بـcoin_wallets نسخة سريعة منه تتحدث بنفس
 * المعاملة (transaction).
 *
 * اليوم يبدأ 12:00 ص بتوقيت السعودية (UTC+3): الحد اليومي يتجدد معه.
 *
 * اللاعب (حساب موثّق تيك توك):
 *   إكمال مباراة 2 · فوز +5 (فريقين +3) · أول مباراة باليوم +5 ·
 *   كل 7 أيام لعب متتالية +30 · المهام اليومية (3 مباريات / فوز / لعبتين
 *   مختلفتين) +5 لكل وحدة و+10 لو خلّصها كلها. الحد اليومي 150.
 *   لا تنحسب أكثر من 15 مباراة باليوم عند نفس الستريمر، وحساب الستريمر
 *   نفسه ما يكسب كلاعب بمبارياته.
 *
 * الستريمر (المباراة لازم تكون وقت بث مسجّل — streamer-hours.js):
 *   مباراة فيها 3 لاعبين موثّقين أو أكثر 3 · كل ساعة لعب +20 · كل 5 لاعبين
 *   موثّقين مختلفين باليوم +2 · ترقية مستوى SP = 100 × رقم المستوى.
 *   الحد اليومي 250. ربع أي عملة يكسبها الستريمر تروح لـ«رصيد التوزيع»
 *   (pool) اللي ما ينصرف إلا منحاً للاعبين.
 *
 * التصنيف الأسبوعي (يتصفّر سبت 12:00 ص بتوقيت السعودية): توب 10 لاعبين
 * بالفوز وتوب 10 ستريمرز بالساعات ياخذون جوائز — خارج الحد اليومي.
 *
 * رصيد افتتاحي 200 لكل حساب، ينضاف مرة وحدة أول ما تنشأ محفظته.
 *
 * متجر العملات: الأدمن يختار يدوياً وش ينسترد (إطار/بطاقة إقصاء/بطاقة
 * فوز/دخولية) وسعره. الاسترداد يخصم ويمنح العنصر بنفس المعاملة، فيطلع
 * بمقتنيات اللاعب على طول.
 */

'use strict';

var db = require('../db/database');
var logger = require('../utils/logger');
var collectibles = require('../collectibles/collectibles-service');
var streamerLevelService = require('../points/streamer-level-service');
var streamerHours = require('../points/streamer-hours');

/* ----------------------------------------------------------------------
 * القواعد
 * ---------------------------------------------------------------------- */
var OPENING_BALANCE = 200;

var PLAYER = {
    match: 2,
    soloWin: 5,
    teamWin: 3,
    firstMatchOfDay: 5,
    streakEvery: 7,
    streakBonus: 30,
    mission: 5,
    allMissions: 10,
    dailyCap: 150,
    maxMatchesPerStreamer: 15
};

// المهام اليومية — target = العدد المطلوب من العدّاد field.
var MISSIONS = [
    { key: 'play3', label: 'العب 3 مباريات', field: 'matches', target: 3 },
    { key: 'win1', label: 'افز بمباراة', field: 'wins', target: 1 },
    { key: 'games2', label: 'العب لعبتين مختلفتين', field: 'games', target: 2 }
];

var STREAMER = {
    match: 3,
    minVerifiedPlayers: 3,
    perHour: 20,
    playersEvery: 5,
    playersBonus: 2,
    levelBonusPerLevel: 100,
    dailyCap: 250,
    poolShare: 0.25
};

var WEEKLY_PLAYERS = [150, 100, 80, 60, 50, 40, 35, 30, 25, 20];
var WEEKLY_STREAMERS = [500, 350, 250, 200, 150, 120, 100, 80, 60, 50];

var MAX_GRANT = 100000;
var HOUR_MS = 3600000;
var DAY_MS = 24 * HOUR_MS;
var RIYADH_OFFSET_MS = 3 * HOUR_MS;
var SATURDAY = 6;

var REASONS = {
    opening: 'رصيد افتتاحي',
    match: 'إكمال مباراة',
    win: 'فوز',
    first_match: 'أول مباراة اليوم',
    streak: 'سلسلة أيام متتالية',
    mission: 'مهمة يومية',
    all_missions: 'إنهاء كل المهام',
    weekly_player: 'جائزة التصنيف الأسبوعي',
    weekly_streamer: 'جائزة توب الستريمرز الأسبوعي',
    streamer_match: 'مباراة على بثّك',
    streamer_hour: 'ساعة لعب على بثّك',
    streamer_players: 'لاعبين جدد على بثّك',
    streamer_level: 'ترقية مستوى الستريمر',
    streamer_gift: 'منحة من ستريمر',
    pool_grant: 'منحت لاعب',
    redeem: 'استرداد من المتجر',
    admin: 'تعديل من الإدارة'
};

/* ----------------------------------------------------------------------
 * الجداول
 * ---------------------------------------------------------------------- */
db.exec(`
    CREATE TABLE IF NOT EXISTS coin_wallets (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        balance INTEGER NOT NULL DEFAULT 0,
        pool_balance INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS coin_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        wallet TEXT NOT NULL DEFAULT 'main',
        amount INTEGER NOT NULL,
        balance_after INTEGER NOT NULL,
        reason TEXT NOT NULL,
        note TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_coin_ledger_user ON coin_ledger(user_id, id);
    CREATE TABLE IF NOT EXISTS coin_daily (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        role TEXT NOT NULL,
        earned INTEGER NOT NULL DEFAULT 0,
        matches INTEGER NOT NULL DEFAULT 0,
        wins INTEGER NOT NULL DEFAULT 0,
        games TEXT NOT NULL DEFAULT '[]',
        claimed TEXT NOT NULL DEFAULT '[]',
        live_ms INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (user_id, day, role)
    );
    CREATE TABLE IF NOT EXISTS coin_streaks (
        user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
        last_day TEXT NOT NULL,
        days INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS coin_streamer_players (
        streamer_id INTEGER NOT NULL,
        day TEXT NOT NULL,
        player_id INTEGER NOT NULL,
        matches INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (streamer_id, day, player_id)
    );
    CREATE TABLE IF NOT EXISTS coin_level_bonus (
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        slug TEXT NOT NULL,
        paid INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, slug)
    );
    CREATE TABLE IF NOT EXISTS coin_weekly_payouts (
        week_start INTEGER NOT NULL,
        board TEXT NOT NULL,
        paid_at INTEGER NOT NULL,
        PRIMARY KEY (week_start, board)
    );
    CREATE TABLE IF NOT EXISTS coin_shop_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        price INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        stock INTEGER,
        sold INTEGER NOT NULL DEFAULT 0,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (kind, ref)
    );
    CREATE TABLE IF NOT EXISTS coin_redemptions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        shop_item_id INTEGER NOT NULL,
        kind TEXT NOT NULL,
        ref TEXT NOT NULL,
        price INTEGER NOT NULL,
        created_at INTEGER NOT NULL
    );
`);

// أول تشغيل للنظام: جوائز الأسبوع تبدأ من الأسبوع الجاري (ما نصرف عن أسابيع
// قبل وجود العملات). آمن للتكرار.
db.prepare('INSERT OR IGNORE INTO app_settings (key, value) VALUES (?, ?)').run('coins_weekly_from', String(weekStart(Date.now())));

/* ----------------------------------------------------------------------
 * أدوات الوقت
 * ---------------------------------------------------------------------- */
function now() { return Date.now(); }

/** تاريخ اليوم بتوقيت السعودية (YYYY-MM-DD) — يتغير 12:00 ص. */
function riyadhDay(ms) { return new Date((ms || now()) + RIYADH_OFFSET_MS).toISOString().slice(0, 10); }

function previousDay(day) { return new Date(Date.parse(day + 'T00:00:00Z') - DAY_MS).toISOString().slice(0, 10); }

/** بداية أسبوع التصنيف (سبت 12:00 ص بتوقيت السعودية) اللي فيه ms. */
function weekStart(ms) {
    var riyadh = new Date(ms + RIYADH_OFFSET_MS);
    var midnight = Date.UTC(riyadh.getUTCFullYear(), riyadh.getUTCMonth(), riyadh.getUTCDate());
    return midnight - ((riyadh.getUTCDay() - SATURDAY + 7) % 7) * DAY_MS - RIYADH_OFFSET_MS;
}

/** الوقت الباقي لين يتجدد الحد اليومي (12:00 ص بتوقيت السعودية). */
function nextResetAt(ms) {
    var day = riyadhDay(ms);
    return Date.parse(day + 'T00:00:00Z') + DAY_MS - RIYADH_OFFSET_MS;
}

function parseList(text) {
    try { var v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

/* ----------------------------------------------------------------------
 * المحفظة والسجل
 * ---------------------------------------------------------------------- */
function userExists(userId) { return Boolean(userId && db.prepare('SELECT id FROM users WHERE id = ?').get(userId)); }

/**
 * ينشئ المحفظة أول مرة: رصيد افتتاحي 200، ومستويات SP اللي وصلها الستريمر
 * قبل النظام تنعلّم «محسوبة» (ما ينصرف عنها بأثر رجعي).
 */
function ensureWallet(userId) {
    var row = db.prepare('SELECT * FROM coin_wallets WHERE user_id = ?').get(userId);
    if (row) return row;
    if (!userExists(userId)) return null;
    db.transaction(function () {
        var t = now();
        var inserted = db.prepare('INSERT OR IGNORE INTO coin_wallets (user_id, balance, pool_balance, created_at, updated_at) VALUES (?, 0, 0, ?, ?)').run(userId, t, t);
        if (!inserted.changes) return;
        applyEntry(userId, 'main', OPENING_BALANCE, 'opening', '');
        markReachedLevels(userId, false);
    })();
    return db.prepare('SELECT * FROM coin_wallets WHERE user_id = ?').get(userId);
}

/** سطر بالسجل + تحديث الرصيد. لازم يُستدعى داخل معاملة. */
function applyEntry(userId, wallet, amount, reason, note) {
    var col = wallet === 'pool' ? 'pool_balance' : 'balance';
    db.prepare('UPDATE coin_wallets SET ' + col + ' = ' + col + ' + ?, updated_at = ? WHERE user_id = ?').run(amount, now(), userId);
    var after = db.prepare('SELECT ' + col + ' AS v FROM coin_wallets WHERE user_id = ?').get(userId).v;
    if (after < 0) throw new Error('insufficient_balance');
    db.prepare('INSERT INTO coin_ledger (user_id, wallet, amount, balance_after, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .run(userId, wallet === 'pool' ? 'pool' : 'main', amount, after, reason, String(note || '').slice(0, 200), now());
    return after;
}

function getBalance(userId) {
    var w = ensureWallet(userId);
    return w ? w.balance : 0;
}

/* ----------------------------------------------------------------------
 * الحد اليومي
 * ---------------------------------------------------------------------- */
function getDaily(userId, role, day) {
    db.prepare('INSERT OR IGNORE INTO coin_daily (user_id, day, role) VALUES (?, ?, ?)').run(userId, day, role);
    return db.prepare('SELECT * FROM coin_daily WHERE user_id = ? AND day = ? AND role = ?').get(userId, day, role);
}

/**
 * يصرف قائمة مكافآت بالترتيب لين يوصل الحد اليومي. للستريمر: ربع الصافي
 * يروح لرصيد التوزيع.
 * @returns {number} المصروف فعلياً
 */
function payCapped(userId, role, day, items) {
    var cap = role === 'streamer' ? STREAMER.dailyCap : PLAYER.dailyCap;
    var daily = getDaily(userId, role, day);
    var room = Math.max(0, cap - daily.earned);
    var total = 0;
    items.forEach(function (it) {
        var amount = Math.min(it.amount, room - total);
        if (amount <= 0) return;
        total += amount;
        if (role === 'streamer') {
            var pool = Math.floor(amount * STREAMER.poolShare);
            if (amount - pool > 0) applyEntry(userId, 'main', amount - pool, it.reason, it.note);
            if (pool > 0) applyEntry(userId, 'pool', pool, it.reason, it.note);
        } else {
            applyEntry(userId, 'main', amount, it.reason, it.note);
        }
    });
    if (total) db.prepare('UPDATE coin_daily SET earned = earned + ? WHERE user_id = ? AND day = ? AND role = ?').run(total, userId, day, role);
    return total;
}

/* ----------------------------------------------------------------------
 * كسب اللاعب
 * ---------------------------------------------------------------------- */
function normalizeGame(game) {
    var g = String(game || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
    return g || '';
}

function awardPlayer(userId, opts, day) {
    if (!ensureWallet(userId)) return 0;
    var daily = getDaily(userId, 'player', day);
    var firstToday = daily.matches === 0;
    var games = parseList(daily.games);
    var game = normalizeGame(opts.game);
    if (game && games.indexOf(game) < 0) games.push(game);
    var matches = daily.matches + 1;
    var wins = daily.wins + (opts.won ? 1 : 0);
    db.prepare('UPDATE coin_daily SET matches = ?, wins = ?, games = ? WHERE user_id = ? AND day = ? AND role = ?')
        .run(matches, wins, JSON.stringify(games), userId, day, 'player');

    var items = [{ amount: PLAYER.match, reason: 'match', note: '' }];
    if (opts.won) items.push({ amount: opts.teamGame ? PLAYER.teamWin : PLAYER.soloWin, reason: 'win', note: '' });

    if (firstToday) {
        items.push({ amount: PLAYER.firstMatchOfDay, reason: 'first_match', note: '' });
        var streak = db.prepare('SELECT * FROM coin_streaks WHERE user_id = ?').get(userId);
        var days = streak && streak.last_day === previousDay(day) ? streak.days + 1 : (streak && streak.last_day === day ? streak.days : 1);
        db.prepare('INSERT INTO coin_streaks (user_id, last_day, days) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET last_day = excluded.last_day, days = excluded.days')
            .run(userId, day, days);
        if (days % PLAYER.streakEvery === 0) items.push({ amount: PLAYER.streakBonus, reason: 'streak', note: days + ' يوم' });
    }

    var claimed = parseList(daily.claimed);
    var counters = { matches: matches, wins: wins, games: games.length };
    MISSIONS.forEach(function (m) {
        if (claimed.indexOf(m.key) < 0 && counters[m.field] >= m.target) {
            claimed.push(m.key);
            items.push({ amount: PLAYER.mission, reason: 'mission', note: m.label });
        }
    });
    var allDone = MISSIONS.every(function (m) { return claimed.indexOf(m.key) >= 0; });
    if (allDone && claimed.indexOf('all') < 0) {
        claimed.push('all');
        items.push({ amount: PLAYER.allMissions, reason: 'all_missions', note: '' });
    }
    db.prepare('UPDATE coin_daily SET claimed = ? WHERE user_id = ? AND day = ? AND role = ?').run(JSON.stringify(claimed), userId, day, 'player');

    return payCapped(userId, 'player', day, items);
}

/* ----------------------------------------------------------------------
 * كسب الستريمر
 * ---------------------------------------------------------------------- */
/** يعلّم مستويات SP اللي وصلها. pay = true يصرف مكافأتها (المستوى 1 مجاني للكل). */
function markReachedLevels(userId, pay) {
    var info;
    try { info = streamerLevelService.getStreamerLevelInfo(userId); } catch (e) { return []; }
    var sp = info ? info.sp : 0;
    var items = [];
    streamerLevelService.listLevels().forEach(function (lvl) {
        var order = lvl.sort_order != null ? lvl.sort_order : lvl.sortOrder;
        var minSp = lvl.min_sp != null ? lvl.min_sp : lvl.minSp;
        if (!(order >= 2) || sp < minSp) return;
        var ins = db.prepare('INSERT OR IGNORE INTO coin_level_bonus (user_id, slug, paid, created_at) VALUES (?, ?, ?, ?)').run(userId, lvl.slug, pay ? 1 : 0, now());
        if (ins.changes && pay) items.push({ amount: order * STREAMER.levelBonusPerLevel, reason: 'streamer_level', note: (lvl.display_name_ar || lvl.displayNameAr || lvl.slug) });
    });
    return items;
}

function awardStreamer(streamerId, opts, day, verifiedPlayerIds, newPlayers) {
    if (!(opts.recordedMs > 0) || !ensureWallet(streamerId)) return 0;
    var daily = getDaily(streamerId, 'streamer', day);
    var items = [];
    if (verifiedPlayerIds.length >= STREAMER.minVerifiedPlayers) items.push({ amount: STREAMER.match, reason: 'streamer_match', note: '' });

    var liveMs = daily.live_ms + opts.recordedMs;
    var hours = Math.floor(liveMs / HOUR_MS) - Math.floor(daily.live_ms / HOUR_MS);
    for (var i = 0; i < hours; i++) items.push({ amount: STREAMER.perHour, reason: 'streamer_hour', note: '' });

    var playersToday = db.prepare('SELECT COUNT(*) AS n FROM coin_streamer_players WHERE streamer_id = ? AND day = ?').get(streamerId, day).n;
    var tiers = Math.floor(playersToday / STREAMER.playersEvery) - Math.floor((playersToday - newPlayers) / STREAMER.playersEvery);
    for (var j = 0; j < tiers; j++) items.push({ amount: STREAMER.playersBonus, reason: 'streamer_players', note: playersToday + ' لاعب اليوم' });

    items = items.concat(markReachedLevels(streamerId, true));
    db.prepare('UPDATE coin_daily SET matches = matches + 1, live_ms = ? WHERE user_id = ? AND day = ? AND role = ?').run(liveMs, streamerId, day, 'streamer');
    return payCapped(streamerId, 'streamer', day, items);
}

/**
 * نقطة الدخول الوحيدة لنهاية أي مباراة (round-complete وتحديات البثين).
 * @param {{streamerId: ?number, recordedMs: number, teamGame: boolean, game: string,
 *          participants: Array<{userId: number, won: boolean}>}} opts
 *   participants = لاعبين موثّقين بس (مطابَقين بحساباتهم).
 * @returns {{players: Object<number, number>, streamer: number}} المصروف لكل واحد
 */
function recordMatch(opts) {
    opts = opts || {};
    var day = riyadhDay();
    var streamerId = opts.streamerId || null;
    var out = { players: {}, streamer: 0 };
    var seen = {};
    var verified = [];
    (opts.participants || []).forEach(function (p) {
        if (!p || !p.userId || seen[p.userId]) return;
        seen[p.userId] = true;
        if (p.userId !== streamerId) verified.push(p);
    });
    try {
        db.transaction(function () {
            var newPlayers = 0;
            verified.forEach(function (p) {
                var count = 1;
                if (streamerId) {
                    var ins = db.prepare('INSERT OR IGNORE INTO coin_streamer_players (streamer_id, day, player_id, matches) VALUES (?, ?, ?, 0)').run(streamerId, day, p.userId);
                    if (ins.changes) newPlayers++;
                    db.prepare('UPDATE coin_streamer_players SET matches = matches + 1 WHERE streamer_id = ? AND day = ? AND player_id = ?').run(streamerId, day, p.userId);
                    count = db.prepare('SELECT matches FROM coin_streamer_players WHERE streamer_id = ? AND day = ? AND player_id = ?').get(streamerId, day, p.userId).matches;
                }
                if (count > PLAYER.maxMatchesPerStreamer) return;
                out.players[p.userId] = awardPlayer(p.userId, { won: Boolean(p.won), teamGame: Boolean(opts.teamGame), game: opts.game }, day);
            });
            if (streamerId) out.streamer = awardStreamer(streamerId, { recordedMs: Number(opts.recordedMs) || 0 }, day, verified, newPlayers);
        })();
    } catch (err) {
        logger.error('Coins: recordMatch failed:', err);
    }
    return out;
}

/* ----------------------------------------------------------------------
 * جوائز التصنيف الأسبوعي
 * ---------------------------------------------------------------------- */
function topPlayersBetween(from, to) {
    return db.prepare(
        `SELECT user_id, SUM(won) AS w, COUNT(*) AS n FROM player_rounds_log
         WHERE created_at >= ? AND created_at < ? GROUP BY user_id
         HAVING w > 0 ORDER BY w DESC, n ASC LIMIT ?`
    ).all(from, to, WEEKLY_PLAYERS.length);
}

function topStreamersBetween(from, to) {
    var cutover = streamerHours.getCutoverAt();
    return db.prepare(
        `SELECT h.user_id, SUM(h.ms) AS ms FROM (
            SELECT user_id, MAX(0, MIN(ended_at, @cutover, @to) - MAX(started_at, @from)) AS ms
              FROM broadcasts WHERE ended_at IS NOT NULL
            UNION ALL
            SELECT user_id, MAX(0, MIN(ended_at, @to) - MAX(started_at, @cutover, @from)) AS ms
              FROM streamer_match_time
         ) h JOIN users u ON u.id = h.user_id
         WHERE u.tiktok_verified = 1 AND u.tiktok_username IS NOT NULL
         GROUP BY h.user_id HAVING ms > 0 ORDER BY ms DESC LIMIT @limit`
    ).all({ cutover: cutover, from: from, to: to, limit: WEEKLY_STREAMERS.length });
}

/** يصرف جوائز الأسبوع اللي خلص (مرة وحدة لكل أسبوع ولكل تصنيف). */
function runWeeklyPayouts(nowMs) {
    var current = weekStart(nowMs || now());
    var prev = current - 7 * DAY_MS;
    var from = Number((db.prepare("SELECT value FROM app_settings WHERE key = 'coins_weekly_from'").get() || {}).value) || current;
    if (prev < from) return { paid: false };
    var boards = [
        { board: 'players', reason: 'weekly_player', prizes: WEEKLY_PLAYERS, rows: function () { return topPlayersBetween(prev, current); } },
        { board: 'streamers', reason: 'weekly_streamer', prizes: WEEKLY_STREAMERS, rows: function () { return topStreamersBetween(prev, current); } }
    ];
    var paid = 0;
    boards.forEach(function (b) {
        try {
            db.transaction(function () {
                var mark = db.prepare('INSERT OR IGNORE INTO coin_weekly_payouts (week_start, board, paid_at) VALUES (?, ?, ?)').run(prev, b.board, now());
                if (!mark.changes) return;
                b.rows().forEach(function (r, i) {
                    if (!ensureWallet(r.user_id)) return;
                    applyEntry(r.user_id, 'main', b.prizes[i], b.reason, 'المركز ' + (i + 1));
                    paid++;
                });
            })();
        } catch (err) {
            logger.error('Coins: weekly payout failed (' + b.board + '):', err);
        }
    });
    if (paid) logger.log('Coins: weekly payouts for week ' + new Date(prev).toISOString() + ' → ' + paid + ' winners');
    return { paid: paid > 0, count: paid };
}

var _timer = null;
function start() {
    if (_timer) return;
    try { runWeeklyPayouts(); } catch (e) { logger.error('Coins: weekly check failed:', e); }
    _timer = setInterval(function () {
        try { runWeeklyPayouts(); } catch (e) { logger.error('Coins: weekly check failed:', e); }
    }, 10 * 60 * 1000);
    if (_timer.unref) _timer.unref();
}

/* ----------------------------------------------------------------------
 * المتجر: العناصر القابلة للاسترداد
 * ---------------------------------------------------------------------- */
var KINDS = ['frame', 'elim', 'win', 'entrance'];

/** وصف العنصر (اسم + صورة) أو null لو العنصر ما عاد موجود. */
function describeItem(kind, ref) {
    if (kind === 'frame') {
        var parts = String(ref).split(':');
        var type = parts[0], key = parts.slice(1).join(':');
        if (type === 'catalog') {
            var cat = collectibles.getCatalogEntry(key);
            return cat ? { name: cat.display_name_ar || key, image: cat.image_filename } : null;
        }
        if (type === 'custom') {
            var custom = db.prepare('SELECT image_filename, display_name_ar FROM custom_frames WHERE id = ?').get(key);
            return custom ? { name: custom.display_name_ar || ('إطار #' + key), image: custom.image_filename } : null;
        }
        return null;
    }
    var list = kind === 'elim' ? collectibles.getElimCardCatalog() : kind === 'win' ? collectibles.getWinCardCatalog() : kind === 'entrance' ? collectibles.getEntranceCatalog() : [];
    var entry = list.filter(function (e) { return e.key === ref; })[0];
    if (!entry) return null;
    return { name: entry.displayNameAr || ref, image: entry.imageFilename || '' };
}

function ownsItem(userId, kind, ref) {
    if (kind === 'frame') {
        var parts = String(ref).split(':');
        return Boolean(db.prepare('SELECT id FROM user_frames WHERE user_id = ? AND frame_type = ? AND frame_ref = ?').get(userId, parts[0], parts.slice(1).join(':')));
    }
    if (kind === 'elim') return Boolean(db.prepare('SELECT id FROM user_elim_cards WHERE user_id = ? AND card_key = ?').get(userId, ref));
    if (kind === 'win') return Boolean(db.prepare('SELECT id FROM user_win_cards WHERE user_id = ? AND card_key = ?').get(userId, ref));
    if (kind === 'entrance') return Boolean(db.prepare('SELECT user_id FROM user_owned_entrances WHERE user_id = ? AND entrance_key = ?').get(userId, ref));
    return false;
}

function grantShopItem(userId, kind, ref) {
    if (kind === 'frame') {
        var parts = String(ref).split(':');
        return collectibles.grantFrame(userId, parts[0], parts.slice(1).join(':'), { grantedBy: 'coin_shop', skipEntranceBundle: true });
    }
    if (kind === 'elim') return collectibles.grantElimCard(userId, ref, 'coin_shop');
    if (kind === 'win') return collectibles.grantWinCard(userId, ref, 'coin_shop');
    if (kind === 'entrance') return collectibles.grantEntrance(userId, ref, 'coin_shop');
    return { success: false, error: 'unknown_kind' };
}

function mapShopRow(row, userId) {
    var d = describeItem(row.kind, row.ref);
    var out = {
        id: row.id,
        kind: row.kind,
        ref: row.ref,
        price: row.price,
        active: Boolean(row.active),
        stock: row.stock == null ? null : row.stock,
        sold: row.sold,
        remaining: row.stock == null ? null : Math.max(0, row.stock - row.sold),
        sortOrder: row.sort_order,
        name: d ? d.name : row.ref,
        image: d ? d.image : '',
        missing: !d
    };
    if (userId) out.owned = ownsItem(userId, row.kind, row.ref);
    return out;
}

/** المتجر كما يشوفه اللاعب: العناصر المفعّلة بس، مع «تملكه» و«خلص». */
function listShop(userId) {
    return db.prepare('SELECT * FROM coin_shop_items WHERE active = 1 ORDER BY sort_order ASC, id ASC').all()
        .map(function (r) { return mapShopRow(r, userId); })
        .filter(function (it) { return !it.missing; });
}

/** الأدمن: كل العناصر (المفعّلة والمخفية). */
function adminListShop() {
    return db.prepare('SELECT * FROM coin_shop_items ORDER BY sort_order ASC, id ASC').all().map(function (r) { return mapShopRow(r); });
}

/** الأدمن: كل اللي ممكن يُضاف للمتجر (لقائمة الاختيار). */
function adminShopOptions() {
    var out = [];
    collectibles.getCatalog().forEach(function (f) { out.push({ kind: 'frame', ref: 'catalog:' + f.slug, name: f.display_name_ar || f.slug, image: f.image_filename, group: 'إطارات الكتالوج' }); });
    collectibles.listCustomFrames().forEach(function (f) {
        var id = f.id != null ? f.id : f.frameRef;
        out.push({ kind: 'frame', ref: 'custom:' + id, name: f.display_name_ar || f.displayNameAr || ('إطار #' + id), image: f.image_filename || f.imageFilename, group: 'إطارات حصرية' });
    });
    collectibles.getElimCardCatalog().forEach(function (c) { out.push({ kind: 'elim', ref: c.key, name: c.displayNameAr, image: c.imageFilename, group: 'بطاقات الإقصاء' }); });
    collectibles.getWinCardCatalog().forEach(function (c) { out.push({ kind: 'win', ref: c.key, name: c.displayNameAr, image: c.imageFilename, group: 'بطاقات الفوز' }); });
    collectibles.getEntranceCatalog().forEach(function (e) { out.push({ kind: 'entrance', ref: e.key, name: 'دخولية ' + e.displayNameAr, image: '', group: 'الدخوليات' }); });
    var listed = {};
    db.prepare('SELECT kind, ref FROM coin_shop_items').all().forEach(function (r) { listed[r.kind + '|' + r.ref] = true; });
    out.forEach(function (o) { o.listed = Boolean(listed[o.kind + '|' + o.ref]); });
    return out;
}

function toInt(v) { var n = Math.floor(Number(v)); return isFinite(n) ? n : NaN; }

/**
 * الأدمن: إضافة عنصر للمتجر أو تعديله.
 * @param {{id?: number, kind: string, ref: string, price: number, active?: boolean, stock?: ?number, sortOrder?: number}} f
 */
function adminSaveShopItem(f) {
    f = f || {};
    var price = toInt(f.price);
    if (!(price >= 1 && price <= 1000000)) return { success: false, error: 'invalid_price' };
    var stock = (f.stock === null || f.stock === undefined || f.stock === '') ? null : toInt(f.stock);
    if (stock !== null && !(stock >= 0)) return { success: false, error: 'invalid_stock' };
    var sort = toInt(f.sortOrder);
    if (!isFinite(sort)) sort = 0;
    var active = f.active === undefined ? 1 : (f.active ? 1 : 0);
    var t = now();
    if (f.id) {
        var row = db.prepare('SELECT * FROM coin_shop_items WHERE id = ?').get(f.id);
        if (!row) return { success: false, error: 'not_found' };
        db.prepare('UPDATE coin_shop_items SET price = ?, active = ?, stock = ?, sort_order = ?, updated_at = ? WHERE id = ?').run(price, active, stock, sort, t, f.id);
        return { success: true, item: mapShopRow(db.prepare('SELECT * FROM coin_shop_items WHERE id = ?').get(f.id)) };
    }
    var kind = String(f.kind || ''), ref = String(f.ref || '');
    if (KINDS.indexOf(kind) < 0 || !describeItem(kind, ref)) return { success: false, error: 'unknown_item' };
    if (db.prepare('SELECT id FROM coin_shop_items WHERE kind = ? AND ref = ?').get(kind, ref)) return { success: false, error: 'already_listed' };
    var info = db.prepare('INSERT INTO coin_shop_items (kind, ref, price, active, stock, sold, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)')
        .run(kind, ref, price, active, stock, sort, t, t);
    logger.log('Coins: shop item added ' + kind + ':' + ref + ' @ ' + price);
    return { success: true, item: mapShopRow(db.prepare('SELECT * FROM coin_shop_items WHERE id = ?').get(info.lastInsertRowid)) };
}

/** الأدمن: حذف عنصر من المتجر (اللي استردوه يبقى عندهم). */
function adminDeleteShopItem(id) {
    var info = db.prepare('DELETE FROM coin_shop_items WHERE id = ?').run(id);
    return info.changes ? { success: true } : { success: false, error: 'not_found' };
}

/**
 * استرداد عنصر بالعملات. الخصم والمنح بنفس المعاملة: لو فشل المنح ما ينخصم شي.
 * @returns {{success: boolean, error?: string, balance?: number, item?: Object}}
 */
function redeem(userId, itemId) {
    if (!ensureWallet(userId)) return { success: false, error: 'unknown_user' };
    var row = db.prepare('SELECT * FROM coin_shop_items WHERE id = ?').get(itemId);
    if (!row || !row.active) return { success: false, error: 'not_available' };
    var d = describeItem(row.kind, row.ref);
    if (!d) return { success: false, error: 'not_available' };
    try {
        return db.transaction(function () {
            if (row.stock != null) {
                var claimed = db.prepare('UPDATE coin_shop_items SET sold = sold + 1 WHERE id = ? AND sold < stock').run(row.id);
                if (!claimed.changes) return { success: false, error: 'sold_out' };
            } else {
                db.prepare('UPDATE coin_shop_items SET sold = sold + 1 WHERE id = ?').run(row.id);
            }
            if (ownsItem(userId, row.kind, row.ref)) throw new Error('already_owned');
            var bal = db.prepare('SELECT balance FROM coin_wallets WHERE user_id = ?').get(userId).balance;
            if (bal < row.price) throw new Error('insufficient_balance');
            var after = applyEntry(userId, 'main', -row.price, 'redeem', d.name);
            var granted = grantShopItem(userId, row.kind, row.ref);
            if (!granted || !granted.success) throw new Error((granted && granted.error) || 'grant_failed');
            db.prepare('INSERT INTO coin_redemptions (user_id, shop_item_id, kind, ref, price, created_at) VALUES (?, ?, ?, ?, ?, ?)')
                .run(userId, row.id, row.kind, row.ref, row.price, now());
            logger.log('Coins: user ' + userId + ' redeemed ' + row.kind + ':' + row.ref + ' for ' + row.price);
            return { success: true, balance: after, item: mapShopRow(db.prepare('SELECT * FROM coin_shop_items WHERE id = ?').get(row.id), userId) };
        })();
    } catch (err) {
        var code = String(err && err.message || '');
        if (code === 'already_owned' || code === 'insufficient_balance') return { success: false, error: code };
        logger.error('Coins: redeem failed:', err);
        return { success: false, error: 'server_error' };
    }
}

/* ----------------------------------------------------------------------
 * المنح: الستريمر من رصيد التوزيع، والأدمن مباشرة
 * ---------------------------------------------------------------------- */
/** يلقى لاعب بآيدي البروفايل (#1234) أو يوزر تيك توك الموثّق (@user). */
function findTarget(query) {
    var raw = String(query || '').trim().replace(/^[@#]+/, '').trim();
    if (!raw) return null;
    var cols = 'SELECT id, username, display_name, custom_id, tiktok_username, tiktok_verified FROM users WHERE ';
    return db.prepare(cols + 'custom_id = ?').get(raw) ||
        db.prepare(cols + 'tiktok_verified = 1 AND tiktok_username = ? COLLATE NOCASE').get(raw) || null;
}

function publicTarget(u) {
    return { id: u.id, name: u.display_name || u.username, customId: u.custom_id || null, tiktokUsername: u.tiktok_verified ? u.tiktok_username : null };
}

/** الستريمر يمنح لاعب عملات من رصيد التوزيع. */
function grantFromPool(streamerId, query, amount) {
    amount = toInt(amount);
    if (!(amount >= 1 && amount <= MAX_GRANT)) return { success: false, error: 'invalid_amount' };
    var target = findTarget(query);
    if (!target) return { success: false, error: 'user_not_found' };
    if (target.id === streamerId) return { success: false, error: 'self_grant' };
    var w = ensureWallet(streamerId);
    if (!w) return { success: false, error: 'unknown_user' };
    if (w.pool_balance < amount) return { success: false, error: 'insufficient_pool' };
    var streamer = db.prepare('SELECT username, display_name FROM users WHERE id = ?').get(streamerId);
    try {
        var pool = db.transaction(function () {
            ensureWallet(target.id);
            var after = applyEntry(streamerId, 'pool', -amount, 'pool_grant', target.display_name || target.username);
            applyEntry(target.id, 'main', amount, 'streamer_gift', streamer ? (streamer.display_name || streamer.username) : '');
            return after;
        })();
        logger.log('Coins: streamer ' + streamerId + ' granted ' + amount + ' to user ' + target.id);
        return { success: true, pool: pool, target: publicTarget(target) };
    } catch (err) {
        if (String(err && err.message) === 'insufficient_balance') return { success: false, error: 'insufficient_pool' };
        logger.error('Coins: pool grant failed:', err);
        return { success: false, error: 'server_error' };
    }
}

/** الأدمن: يضيف (موجب) أو يخصم (سالب) من رصيد مستخدم. */
function adminAdjust(userId, amount, note, wallet) {
    amount = toInt(amount);
    if (!amount || Math.abs(amount) > MAX_GRANT) return { success: false, error: 'invalid_amount' };
    if (!ensureWallet(userId)) return { success: false, error: 'user_not_found' };
    try {
        var after = db.transaction(function () { return applyEntry(userId, wallet === 'pool' ? 'pool' : 'main', amount, 'admin', note || ''); })();
        logger.log('Coins: admin adjusted user ' + userId + ' by ' + amount + ' (' + (wallet || 'main') + ')');
        return { success: true, balance: after };
    } catch (err) {
        if (String(err && err.message) === 'insufficient_balance') return { success: false, error: 'insufficient_balance' };
        logger.error('Coins: admin adjust failed:', err);
        return { success: false, error: 'server_error' };
    }
}

/* ----------------------------------------------------------------------
 * القراءة للبروفايل
 * ---------------------------------------------------------------------- */
function getHistory(userId, limit) {
    return db.prepare('SELECT id, wallet, amount, balance_after, reason, note, created_at FROM coin_ledger WHERE user_id = ? ORDER BY id DESC LIMIT ?')
        .all(userId, Math.min(100, limit || 30))
        .map(function (r) {
            return { id: r.id, wallet: r.wallet, amount: r.amount, balanceAfter: r.balance_after, reason: r.reason, label: REASONS[r.reason] || r.reason, note: r.note, createdAt: r.created_at };
        });
}

/** كل اللي يحتاجه قسم «عملات أيمن» بالبروفايل. */
function getWallet(userId) {
    var w = ensureWallet(userId);
    if (!w) return null;
    var day = riyadhDay();
    var p = db.prepare('SELECT * FROM coin_daily WHERE user_id = ? AND day = ? AND role = ?').get(userId, day, 'player');
    var s = db.prepare('SELECT * FROM coin_daily WHERE user_id = ? AND day = ? AND role = ?').get(userId, day, 'streamer');
    var streak = db.prepare('SELECT * FROM coin_streaks WHERE user_id = ?').get(userId);
    var streakDays = streak && (streak.last_day === day || streak.last_day === previousDay(day)) ? streak.days : 0;
    var claimed = p ? parseList(p.claimed) : [];
    var counters = { matches: p ? p.matches : 0, wins: p ? p.wins : 0, games: p ? parseList(p.games).length : 0 };
    return {
        balance: w.balance,
        poolBalance: w.pool_balance,
        today: {
            earned: p ? p.earned : 0,
            cap: PLAYER.dailyCap,
            resetsAt: nextResetAt(),
            streakDays: streakDays,
            missions: MISSIONS.map(function (m) {
                return { key: m.key, label: m.label, progress: Math.min(m.target, counters[m.field]), target: m.target, done: claimed.indexOf(m.key) >= 0, reward: PLAYER.mission };
            }),
            allMissionsReward: PLAYER.allMissions,
            allMissionsDone: claimed.indexOf('all') >= 0,
            streamerEarned: s ? s.earned : 0,
            streamerCap: STREAMER.dailyCap
        },
        rules: getRules(),
        history: getHistory(userId, 30)
    };
}

function getRules() {
    return {
        openingBalance: OPENING_BALANCE,
        player: Object.assign({}, PLAYER),
        streamer: Object.assign({}, STREAMER),
        weeklyPlayers: WEEKLY_PLAYERS.slice(),
        weeklyStreamers: WEEKLY_STREAMERS.slice()
    };
}

module.exports = {
    OPENING_BALANCE: OPENING_BALANCE,
    PLAYER: PLAYER,
    STREAMER: STREAMER,
    riyadhDay: riyadhDay,
    weekStart: weekStart,
    ensureWallet: ensureWallet,
    getBalance: getBalance,
    getWallet: getWallet,
    getHistory: getHistory,
    getRules: getRules,
    recordMatch: recordMatch,
    runWeeklyPayouts: runWeeklyPayouts,
    start: start,
    listShop: listShop,
    adminListShop: adminListShop,
    adminShopOptions: adminShopOptions,
    adminSaveShopItem: adminSaveShopItem,
    adminDeleteShopItem: adminDeleteShopItem,
    redeem: redeem,
    findTarget: findTarget,
    grantFromPool: grantFromPool,
    adminAdjust: adminAdjust
};
