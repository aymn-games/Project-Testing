/**
 * AGP STORE SERVICE — المتجر (store.html) ولوحة إدارته (admin-store.html)
 * وصفحة إحصائيات مبيعات كل استريمر (streamer-stats.html).
 *
 * كل الحسابات المالية هنا بالسيرفر (الأسعار، الخصومات، أكواد الخصم،
 * الإجمالي، إنشاء الطلب، توزيع سعر الباكج على منتجاته) — الواجهة تعرض فقط.
 *
 * الدفع: ميسّر أو بيلينك (activeGateway). checkout ينشئ طلباً 'pending'
 * ويرجّع رابط صفحة الدفع، والطلب ما يكتمل إلا بعد التحقق من البوابة نفسها
 * (verifyOrder). بدون بوابة مفعّلة: دفع تجريبي مقفول لغير الأدمن
 * (راجع config.storeMockPayments).
 *
 * التسليم: بعد اكتمال الطلب كل منتج (وكل منتج داخل باكج) ينضاف لجدول
 * store_inventory، وحسب delivery المنتج ينضاف لمقتنيات المستخدم الفعلية
 * (إطار/بطاقة إقصاء/بطاقة فوز) عبر collectibles-service.
 */

'use strict';

var crypto = require('crypto');
var db = require('../db/database');
var config = require('../config');
var logger = require('../utils/logger');
var collectiblesService = require('../collectibles/collectibles-service');
var paylink = require('./paylink-client');
var moyasar = require('./moyasar-client');

var FIRST_ORDER_ID = 482100;
var MAX_NAME_LENGTH = 80;
var MAX_BADGE_LENGTH = 24;
var MAX_CART_ITEMS = 50;
var MAX_PRICE = 100000;
var PAY_METHODS = ['mada', 'applepay', 'card', 'stcpay'];
var PLAN_KEYS = ['basic', 'mid', 'full'];
var PLAN_CATEGORY_NAME = 'اشتراك متجر الاستريمر';
var AUTO_OFFER_BADGE_PREFIX = 'وفّر';

function now() { return Date.now(); }

function cleanText(value, maxLength) {
    return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, maxLength);
}

function toPrice(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) return null;
    return Math.min(MAX_PRICE, Math.round(n * 100) / 100);
}

function toId(value) {
    var n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : null;
}

function round2(n) { return Math.round(n * 100) / 100; }

/**
 * صور المنتجات/الاستريمرز: إما ملف داخل المستودع (مسار نسبي بسيط مثل
 * assets/win-cards/x.png) أو رابط Cloudinary مرفوع من لوحة الأدمن لمجلد
 * المتجر. أي شيء غير ذلك يُرفض.
 */
function isAllowedImageUrl(url) {
    if (url === '') return true;
    if (/^[A-Za-z0-9_\-]+(\/[A-Za-z0-9_\-.]+)*\.(png|jpe?g|webp|gif)$/i.test(url) && url.indexOf('..') === -1) return true;
    if (!config.cloudinaryCloudName) return false;
    var prefix = 'https://res.cloudinary.com/' + config.cloudinaryCloudName + '/image/upload/';
    return url.indexOf(prefix) === 0 && /\/agp-store\//.test(url) && /^[A-Za-z0-9_\-.\/:]+$/.test(url);
}

/* ----------------------------------------------------------------------
 * القراءة وتحويل الصفوف
 * ---------------------------------------------------------------------- */

function parseJsonArray(raw) {
    try { var v = JSON.parse(raw || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

function mapCategory(row) {
    return { id: row.id, name: row.name, kind: row.kind };
}

function mapProduct(row) {
    return {
        id: row.id,
        categoryId: row.category_id,
        name: row.name,
        price: row.price,
        oldPrice: row.old_price != null ? row.old_price : null,
        offPct: row.off_pct != null ? row.off_pct : null,
        badge: row.badge || '',
        imageUrl: row.image_url || '',
        streamerId: row.streamer_id || null,
        subcatId: row.streamer_subcat_id || null,
        items: row.bundle_items ? parseJsonArray(row.bundle_items) : null,
        plan: row.plan || null,
        hidden: !!row.hidden
    };
}

function listCategories() {
    return db.prepare('SELECT * FROM store_categories ORDER BY sort_order, id').all().map(mapCategory);
}

function listStreamers() {
    var subcats = db.prepare('SELECT * FROM store_streamer_subcats ORDER BY id').all();
    return db.prepare('SELECT * FROM store_streamers ORDER BY id').all().map(function (s) {
        return {
            id: s.id,
            name: s.name,
            user: s.tiktok_user,
            avatarUrl: s.avatar_url || '',
            subcats: subcats.filter(function (b) { return b.streamer_id === s.id; }).map(function (b) { return { id: b.id, name: b.name }; })
        };
    });
}

function listProductRows() {
    // الأحدث أولاً — نفس ترتيب البروتوتايب (المنتج الجديد يظهر بالبداية).
    return db.prepare('SELECT * FROM store_products ORDER BY created_at DESC, id DESC').all();
}

function getProductRow(id) {
    return db.prepare('SELECT * FROM store_products WHERE id = ?').get(id);
}

function getCategoryRow(id) {
    return id ? db.prepare('SELECT * FROM store_categories WHERE id = ?').get(id) : null;
}

function getCategoryByKind(kind) {
    return db.prepare('SELECT * FROM store_categories WHERE kind = ? ORDER BY id LIMIT 1').get(kind);
}

function categoryNameOf(row, categoriesById) {
    if (row.plan) return PLAN_CATEGORY_NAME;
    var cat = categoriesById[row.category_id];
    return cat ? cat.name : '';
}

/**
 * بيانات المتجر العامة — بدون أي معلومة حساسة (لا delivery ولا مبيعات).
 * @param {Object|null} user - من الجلسة لو موجودة
 */
function getPublicStore(user) {
    var favorites = user
        ? db.prepare('SELECT product_id FROM store_favorites WHERE user_id = ?').all(user.id).map(function (r) { return r.product_id; })
        : [];
    return {
        success: true,
        categories: listCategories(),
        streamers: listStreamers(),
        products: listProductRows().map(mapProduct),
        favorites: favorites,
        paymentsEnabled: canPay(user),
        // بوابة مفعّلة = الدفع يتحوّل لصفحة البوابة ويحتاج رقم جوال
        gateway: useGatewayFor(user) ? activeGateway() : 'mock'
    };
}

function isAdmin(user) { return !!(user && user.role === 'admin'); }

var GATEWAYS = { moyasar: moyasar, paylink: paylink };

/** البوابة المستخدمة: PAYMENT_GATEWAY لو محددة ومفعّلة، وإلا ميسّر ثم بيلينك. */
function activeGateway() {
    var wanted = String(config.paymentGateway || '').toLowerCase();
    if (GATEWAYS[wanted]) return GATEWAYS[wanted].isEnabled() ? wanted : null;
    if (moyasar.isEnabled()) return 'moyasar';
    if (paylink.isEnabled()) return 'paylink';
    return null;
}

function gatewayEnv() {
    var g = activeGateway();
    return g ? GATEWAYS[g].env() : null;
}

/**
 * البوابة لهذا المستخدم؟ بيئة التجربة (test) للأدمن فقط — البطاقات
 * التجريبية تنجح بدون فلوس حقيقية، فلو انفتحت للكل ياخذون منتجات مجاناً.
 */
function useGatewayFor(user) {
    var e = gatewayEnv();
    if (e === 'production') return true;
    if (e === 'live-admin') return isAdmin(user); // دفع حقيقي — للأدمن فقط
    return e === 'test' && (isAdmin(user) || config.storeMockPayments);
}

function canPay(user) {
    var e = gatewayEnv();
    if (e === 'live-admin') return isAdmin(user); // ولا حتى الدفع التجريبي لغير الأدمن
    return !!(e === 'production' || config.storeMockPayments || isAdmin(user));
}

/* ----------------------------------------------------------------------
 * أكواد الخصم
 * ---------------------------------------------------------------------- */

function findActiveCoupon(code) {
    code = cleanText(code, 40);
    if (!code) return null;
    return db.prepare('SELECT * FROM store_coupons WHERE code = ? COLLATE NOCASE AND active = 1').get(code) || null;
}

// حد بسيط بالذاكرة ضد تجربة الأكواد عشوائياً (يُصفَّر مع إعادة التشغيل).
var couponHits = new Map();
var COUPON_WINDOW_MS = 10 * 60 * 1000;
var MAX_COUPON_TRIES = 30;
function allowCouponTry(key) {
    var t = now();
    var list = (couponHits.get(key) || []).filter(function (ts) { return t - ts < COUPON_WINDOW_MS; });
    if (list.length >= MAX_COUPON_TRIES) { couponHits.set(key, list); return false; }
    list.push(t);
    couponHits.set(key, list);
    if (couponHits.size > 5000) couponHits.clear();
    return true;
}

function checkCoupon(code, rateKey) {
    if (!allowCouponTry(rateKey || 'anon')) return { success: false, error: 'rate_limited' };
    var coupon = findActiveCoupon(code);
    if (!coupon) return { success: false, error: 'invalid_coupon' };
    return { success: true, code: coupon.code, pct: coupon.pct };
}

/* ----------------------------------------------------------------------
 * الطلبات
 * ---------------------------------------------------------------------- */

/**
 * نسخة ثابتة من منتج داخل الطلب. الباكج يُوزَّع سعره على منتجاته بنسبة
 * (oldPrice || price) لكل منتج — لإحصائيات الاستريمرز.
 */
function buildOrderItem(row, rowsById, categoriesById) {
    var item = {
        productId: row.id,
        name: row.name,
        price: row.price,
        categoryName: categoryNameOf(row, categoriesById),
        streamerId: row.streamer_id || null
    };
    if (row.bundle_items) {
        var parts = parseJsonArray(row.bundle_items).map(function (id) { return rowsById[id]; }).filter(Boolean);
        var base = parts.reduce(function (a, x) { return a + (x.old_price || x.price); }, 0) || 1;
        item.parts = parts.map(function (x) {
            return { productId: x.id, name: x.name, streamerId: x.streamer_id || null, amount: round2(row.price * (x.old_price || x.price) / base) };
        });
    }
    return item;
}

/**
 * يحسب السلة بالسيرفر من أرقام المنتجات فقط (الأسعار من قاعدة البيانات،
 * مو من المتصفح).
 * @returns {{success: boolean, error?: string, rows?: Array, subtotal?: number, discount?: number, total?: number, coupon?: Object}}
 */
function priceCart(productIds, couponCode) {
    if (!Array.isArray(productIds)) return { success: false, error: 'invalid_items' };
    var ids = [];
    productIds.forEach(function (raw) { var id = toId(raw); if (id && ids.indexOf(id) === -1) ids.push(id); });
    if (ids.length === 0) return { success: false, error: 'empty_cart' };
    if (ids.length > MAX_CART_ITEMS) return { success: false, error: 'too_many_items' };

    var rows = [];
    for (var i = 0; i < ids.length; i++) {
        var row = getProductRow(ids[i]);
        if (!row || (row.hidden && !row.plan)) return { success: false, error: 'product_unavailable', productId: ids[i] };
        rows.push(row);
    }
    if (rows.filter(function (r) { return r.plan; }).length > 1) return { success: false, error: 'one_plan_only' };

    var subtotal = round2(rows.reduce(function (a, r) { return a + r.price; }, 0));
    var coupon = null;
    var discount = 0;
    if (couponCode) {
        coupon = findActiveCoupon(couponCode);
        if (!coupon) return { success: false, error: 'invalid_coupon' };
        discount = Math.round(subtotal * coupon.pct / 100);
    }
    return { success: true, rows: rows, subtotal: subtotal, discount: discount, total: round2(subtotal - discount), coupon: coupon };
}

function nextOrderId() {
    var row = db.prepare('SELECT MAX(id) AS m FROM store_orders').get();
    return Math.max(row && row.m ? row.m : 0, FIRST_ORDER_ID - 1) + 1;
}

/** يربط منتج 'frame' بصف custom_frames بنفس صورة المنتج (يعيد استخدامه لو موجود). */
function ensureCustomFrameForProduct(row) {
    if (row.custom_frame_id) {
        var existing = db.prepare('SELECT id, image_filename FROM custom_frames WHERE id = ?').get(row.custom_frame_id);
        if (existing && existing.image_filename === row.image_url) return existing.id;
    }
    var sameImage = db.prepare('SELECT id FROM custom_frames WHERE image_filename = ? ORDER BY id LIMIT 1').get(row.image_url);
    var frameId = sameImage ? sameImage.id : collectiblesService.createCustomFrame(row.image_url, row.name).id;
    db.prepare('UPDATE store_products SET custom_frame_id = ? WHERE id = ?').run(frameId, row.id);
    return frameId;
}

/** يضيف المنتج لمقتنيات المستخدم الفعلية حسب delivery. لا يرمي أخطاء. */
function deliverToCollectibles(userId, row) {
    var delivery = row.delivery || '';
    try {
        if (delivery === 'frame') {
            if (!row.image_url) return;
            collectiblesService.grantFrame(userId, 'custom', String(ensureCustomFrameForProduct(row)), { grantedBy: 'store' });
        } else if (delivery.indexOf('catalog:') === 0) {
            collectiblesService.grantFrame(userId, 'catalog', delivery.slice(8), { grantedBy: 'store' });
        } else if (delivery.indexOf('elim:') === 0) {
            collectiblesService.grantElimCard(userId, delivery.slice(5), 'store');
        } else if (delivery.indexOf('win:') === 0) {
            collectiblesService.grantWinCard(userId, delivery.slice(4), 'store');
        }
    } catch (err) {
        logger.error('Store: delivery failed for product ' + row.id + ' to user ' + userId + ':', err);
    }
}

/**
 * يكمّل طلباً: ينشئه + يسلّم المنتجات. معاملة واحدة.
 * @returns {Object} الطلب بعد الإنشاء
 */
/** ينشئ الطلب بنسخة ثابتة من المنتجات وأسعارها وقت الشراء. */
function insertOrder(userId, priced, paymentMethod, status, extra) {
    var categoriesById = {};
    listCategories().forEach(function (c) { categoriesById[c.id] = c; });
    var rowsById = {};
    listProductRows().forEach(function (r) { rowsById[r.id] = r; });

    var items = priced.rows.map(function (r) { return buildOrderItem(r, rowsById, categoriesById); });
    var id = nextOrderId();
    extra = extra || {};
    db.prepare(
        'INSERT INTO store_orders (id, user_id, created_at, subtotal, discount, total, coupon_code, payment_method, payment_ref, status, items, customer_mobile) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(id, userId, now(), priced.subtotal, priced.discount, priced.total,
        priced.coupon ? priced.coupon.code : null, paymentMethod, extra.paymentRef || null, status, JSON.stringify(items), extra.mobile || null);
    return id;
}

/**
 * يحوّل طلباً من 'pending' إلى 'completed' ويسلّم منتجاته — مرة وحدة فقط
 * (لو وصل تأكيد الدفع أكثر من مرة، الثانية ما تسوي شي).
 * @returns {boolean} true لو هذا الاستدعاء هو اللي أكمل الطلب
 */
var finalizeOrder = db.transaction(function (orderId) {
    var info = db.prepare("UPDATE store_orders SET status = 'completed' WHERE id = ? AND status = 'pending'").run(orderId);
    if (info.changes === 0) return false;
    var order = db.prepare('SELECT * FROM store_orders WHERE id = ?').get(orderId);
    var createdAt = now();
    var addInventory = db.prepare('INSERT INTO store_inventory (user_id, product_id, order_id, created_at) VALUES (?, ?, ?, ?)');
    parseJsonArray(order.items).forEach(function (item) {
        // المنتج نفسه من قاعدة البيانات (لنوع التسليم)؛ لو انحذف بعد الطلب يُسجَّل بالمقتنيات بدون تسليم.
        var row = getProductRow(item.productId);
        addInventory.run(order.user_id, item.productId, orderId, createdAt);
        if (row) deliverToCollectibles(order.user_id, row);
        (item.parts || []).forEach(function (pt) {
            var part = getProductRow(pt.productId);
            addInventory.run(order.user_id, pt.productId, orderId, createdAt);
            if (part) deliverToCollectibles(order.user_id, part);
        });
    });
    return true;
});

/** رقم جوال سعودي → بصيغة 05xxxxxxxx، أو null لو غير صالح. */
function normalizeMobile(raw) {
    var digits = String(raw || '').replace(/[\u0660-\u0669]/g, function (d) { return String(d.charCodeAt(0) - 0x0660); }).replace(/[^\d]/g, '');
    if (/^9665\d{8}$/.test(digits)) digits = '0' + digits.slice(3);
    else if (/^5\d{8}$/.test(digits)) digits = '0' + digits;
    return /^05\d{8}$/.test(digits) ? digits : null;
}

function storeUrl(query) {
    return String(config.frontendBaseUrl || '').replace(/\/+$/, '') + '/store.html' + query;
}

/**
 * الدفع + إنشاء الطلب.
 * - بيلينك مفعّل: طلب معلّق + فاتورة بيلينك، ويرجّع رابط الدفع (redirectUrl).
 *   الطلب ما يكتمل إلا بعد التحقق من بيلينك نفسه (verifyOrder).
 * - بيلينك غير مفعّل: الدفع التجريبي القديم (للأدمن أو STORE_MOCK_PAYMENTS).
 * @param {Object} user - من الجلسة
 * @param {{items: number[], coupon?: string, method?: string, mobile?: string}} input
 * @returns {Promise<Object>}
 */
function checkout(user, input) {
    input = input || {};
    var method = PAY_METHODS.indexOf(input.method) !== -1 ? input.method : PAY_METHODS[0];

    if (!canPay(user)) return Promise.resolve(fail('payments_not_configured'));
    if (!useGatewayFor(user)) {
        var mockPriced = priceCart(input.items, input.coupon ? cleanText(input.coupon, 40) : '');
        if (!mockPriced.success) return Promise.resolve(mockPriced);
        var mockId = db.transaction(function () {
            var id = insertOrder(user.id, mockPriced, method, 'pending', { paymentRef: 'mock-' + crypto.randomBytes(6).toString('hex') });
            finalizeOrder(id);
            return id;
        })();
        logger.log('Store: order #' + mockId + ' completed for user ' + user.id + ' (' + mockPriced.total + ' SAR, mock payment)');
        return Promise.resolve({ success: true, order: getOrderForUser(user, mockId) });
    }

    var mobile = normalizeMobile(input.mobile);
    if (!mobile) return Promise.resolve(fail('invalid_mobile'));
    var priced = priceCart(input.items, input.coupon ? cleanText(input.coupon, 40) : '');
    if (!priced.success) return Promise.resolve(priced);
    if (!(priced.total > 0)) return Promise.resolve(fail('invalid_total'));

    var orderId = insertOrder(user.id, priced, method, 'pending', { mobile: mobile });
    var names = priced.rows.map(function (r) { return r.name; }).join('، ');
    var gateway = activeGateway();
    db.prepare('UPDATE store_orders SET payment_gateway = ? WHERE id = ?').run(gateway, orderId);
    var created = gateway === 'moyasar' ? createMoyasarInvoice(user, orderId, priced, names, mobile)
        : createPaylinkInvoice(user, orderId, priced, names, mobile);
    return created.then(function (redirectUrl) {
        return { success: true, orderId: orderId, redirectUrl: redirectUrl };
    }, function (err) {
        db.prepare("UPDATE store_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(orderId);
        logger.error('Store: ' + gateway + ' invoice failed for order #' + orderId + ':', err && err.message, err && err.detail);
        var out = fail('payment_gateway_error');
        // سبب رفض البوابة بالضبط — للأدمن فقط (للتشخيص)، العميل يشوف الرسالة العامة.
        if (isAdmin(user)) out.detail = (err && (err.detail || err.message)) || 'unknown';
        return out;
    });
}

function createMoyasarInvoice(user, orderId, priced, names, mobile) {
    return moyasar.createInvoice({
        amount: priced.total,
        description: ('طلب متجر ألعاب أيمن #' + orderId + ' — ' + names).slice(0, 250),
        callbackUrl: String(config.publicApiBaseUrl || '').replace(/\/+$/, '') + '/api/store/moyasar/webhook',
        successUrl: storeUrl('?order=' + orderId),
        backUrl: storeUrl('?order=' + orderId),
        metadata: { order_id: String(orderId), user_id: String(user.id), mobile: mobile }
    }).then(function (inv) {
        db.prepare('UPDATE store_orders SET moyasar_invoice_id = ?, payment_ref = ? WHERE id = ?').run(inv.id, inv.id, orderId);
        logger.log('Store: order #' + orderId + ' pending Moyasar payment (' + priced.total + ' SAR, ' + moyasar.env() + ')');
        return inv.url;
    });
}

function createPaylinkInvoice(user, orderId, priced, names, mobile) {
    return paylink.addInvoice({
        amount: priced.total,
        orderNumber: String(orderId),
        clientName: cleanText(user.tiktok_display_name || user.username || 'عميل', 60),
        clientMobile: mobile,
        clientEmail: user.email || undefined,
        callBackUrl: storeUrl('?order=' + orderId),
        cancelUrl: storeUrl('?order=' + orderId),
        note: 'طلب متجر ألعاب أيمن #' + orderId,
        // سطر واحد بالمبلغ النهائي (بعد كود الخصم) عشان مجموع المنتجات = مبلغ الفاتورة.
        products: [{ title: 'طلب #' + orderId, price: priced.total, qty: 1, description: names.slice(0, 250), isDigital: true }]
    }).then(function (inv) {
        db.prepare('UPDATE store_orders SET paylink_transaction_no = ?, payment_ref = ? WHERE id = ?').run(inv.transactionNo, inv.transactionNo, orderId);
        logger.log('Store: order #' + orderId + ' pending Paylink payment (' + priced.total + ' SAR, ' + paylink.env() + ')');
        return inv.url;
    });
}

/**
 * يتأكد من بيلينك مباشرة (ما نثق بأي بيانات جاية من المتصفح أو الإشعار):
 * الفاتورة مدفوعة وبنفس مبلغ الطلب → نكمل الطلب ونسلّم المنتجات.
 * @returns {Promise<string>} حالة الطلب بعد التحقق
 */
function verifyOrder(orderId) {
    var order = db.prepare('SELECT * FROM store_orders WHERE id = ?').get(orderId);
    if (!order) return Promise.resolve('not_found');
    if (order.moyasar_invoice_id) return verifyMoyasarOrder(order);
    if (order.status !== 'pending' || !order.paylink_transaction_no || !paylink.isEnabled()) return Promise.resolve(order.status);
    return paylink.getInvoice(order.paylink_transaction_no).then(function (inv) {
        var status = inv.orderStatus.toLowerCase();
        if (status === 'paid') {
            if (Math.abs(inv.amount - order.total) > 0.01) {
                logger.error('Store: Paylink amount mismatch for order #' + orderId + ' (paid ' + inv.amount + ', expected ' + order.total + ')');
                return 'pending';
            }
            if (finalizeOrder(orderId)) logger.log('Store: order #' + orderId + ' paid via Paylink and delivered');
            return 'completed';
        }
        if (status === 'cancelled' || status === 'canceled' || status === 'declined') {
            db.prepare("UPDATE store_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(orderId);
            return 'failed';
        }
        return 'pending';
    }, function (err) {
        logger.error('Store: Paylink verify failed for order #' + orderId + ':', err && err.message);
        return 'pending';
    });
}

/** نفس verifyOrder لكن من ميسّر: الفاتورة 'paid' وبنفس المبلغ والعملة. */
function verifyMoyasarOrder(order) {
    var orderId = order.id;
    if (order.status !== 'pending' || !moyasar.isEnabled()) return Promise.resolve(order.status);
    return moyasar.getInvoice(order.moyasar_invoice_id).then(function (inv) {
        if (inv.status === 'paid') {
            if (Math.abs(inv.amount - order.total) > 0.01 || inv.currency !== 'SAR') {
                logger.error('Store: Moyasar amount mismatch for order #' + orderId + ' (paid ' + inv.amount + ' ' + inv.currency + ', expected ' + order.total + ')');
                return 'pending';
            }
            if (finalizeOrder(orderId)) logger.log('Store: order #' + orderId + ' paid via Moyasar and delivered');
            return 'completed';
        }
        if (inv.status === 'canceled' || inv.status === 'cancelled' || inv.status === 'expired' || inv.status === 'failed') {
            db.prepare("UPDATE store_orders SET status = 'failed' WHERE id = ? AND status = 'pending'").run(orderId);
            return 'failed';
        }
        return 'pending';
    }, function (err) {
        logger.error('Store: Moyasar verify failed for order #' + orderId + ':', err && err.message);
        return 'pending';
    });
}

function getOrderForUser(user, orderId) {
    var row = db.prepare('SELECT * FROM store_orders WHERE id = ? AND user_id = ?').get(orderId, user.id);
    return row ? mapOrder(row) : null;
}

/** صفحة المتجر بعد الرجوع من بيلينك تسأل عن طلبها. */
function getOrderStatus(user, orderId) {
    var id = toId(orderId);
    if (!id || !getOrderForUser(user, id)) return Promise.resolve(fail('not_found'));
    return verifyOrder(id).then(function () {
        return { success: true, order: getOrderForUser(user, id) };
    });
}

/**
 * إشعار بيلينك (Webhook). محتواه نفسه ما يُعتمد عليه — نستخرج منه رقم
 * الطلب أو رقم الفاتورة بس، ونتحقق من بيلينك مباشرة.
 */
function handlePaylinkWebhook(body) {
    body = body || {};
    var orderId = toId(body.merchantOrderNumber || body.orderNumber || body.order_number);
    var tx = cleanText(body.transactionNo || body.transaction_no || '', 60);
    var row = orderId ? db.prepare('SELECT id FROM store_orders WHERE id = ?').get(orderId)
        : (tx ? db.prepare('SELECT id FROM store_orders WHERE paylink_transaction_no = ?').get(tx) : null);
    if (!row) return Promise.resolve({ success: true, ignored: true });
    return verifyOrder(row.id).then(function (status) { return { success: true, status: status }; });
}

/**
 * إشعار ميسّر (callback_url للفاتورة أو Webhook من لوحة ميسّر). نفس الفكرة:
 * نستخرج رقم الفاتورة/الطلب فقط ونتحقق من ميسّر مباشرة.
 */
function handleMoyasarWebhook(body) {
    body = body || {};
    var data = body.data && typeof body.data === 'object' ? body.data : body;
    var meta = data.metadata || {};
    var invoiceId = cleanText(data.invoice_id || (body.type ? '' : data.id) || '', 80);
    var orderId = toId(meta.order_id);
    var row = invoiceId ? db.prepare('SELECT id FROM store_orders WHERE moyasar_invoice_id = ?').get(invoiceId) : null;
    if (!row && orderId) row = db.prepare('SELECT id FROM store_orders WHERE id = ? AND moyasar_invoice_id IS NOT NULL').get(orderId);
    if (!row) return Promise.resolve({ success: true, ignored: true });
    return verifyOrder(row.id).then(function (status) { return { success: true, status: status }; });
}

function mapOrder(row) {
    return {
        id: row.id,
        createdAt: row.created_at,
        subtotal: row.subtotal,
        discount: row.discount,
        total: row.total,
        coupon: row.coupon_code || null,
        paymentMethod: row.payment_method,
        status: row.status,
        items: parseJsonArray(row.items)
    };
}

function listMyOrders(user) {
    var rows = db.prepare("SELECT * FROM store_orders WHERE user_id = ? AND status = 'completed' ORDER BY created_at DESC, id DESC").all(user.id);
    var images = {};
    db.prepare('SELECT id, image_url FROM store_products').all().forEach(function (r) { images[r.id] = r.image_url; });
    return {
        success: true,
        orders: rows.map(function (r) {
            var o = mapOrder(r);
            o.items.forEach(function (i) { i.imageUrl = images[i.productId] || ''; });
            return o;
        })
    };
}

/* ----------------------------------------------------------------------
 * المفضلة
 * ---------------------------------------------------------------------- */

function setFavorite(user, productId, on) {
    var id = toId(productId);
    if (!id || !getProductRow(id)) return { success: false, error: 'not_found' };
    if (on) db.prepare('INSERT OR IGNORE INTO store_favorites (user_id, product_id, created_at) VALUES (?, ?, ?)').run(user.id, id, now());
    else db.prepare('DELETE FROM store_favorites WHERE user_id = ? AND product_id = ?').run(user.id, id);
    return { success: true };
}

/* ----------------------------------------------------------------------
 * إحصائيات الاستريمر (رابط موقَّع قابل للمشاركة)
 * ---------------------------------------------------------------------- */

/**
 * مفتاح التوقيع: STORE_STATS_SECRET لو مضبوط، وإلا مفتاح عشوائي يُولَّد مرة
 * وحدة ويُحفظ بقاعدة البيانات (عشان الروابط المنسوخة تبقى صالحة بعد إعادة التشغيل).
 */
var statsSecret = null;
function getStatsSecret() {
    if (statsSecret) return statsSecret;
    if (config.storeStatsSecret) return (statsSecret = config.storeStatsSecret);
    db.prepare("INSERT OR IGNORE INTO app_settings (key, value) VALUES ('store_stats_secret', ?)").run(crypto.randomBytes(32).toString('hex'));
    statsSecret = db.prepare("SELECT value FROM app_settings WHERE key = 'store_stats_secret'").get().value;
    return statsSecret;
}

function statsToken(streamerId) {
    return crypto.createHmac('sha256', getStatsSecret()).update('store-stats:' + streamerId).digest('hex').slice(0, 32);
}

function isValidStatsToken(streamerId, token) {
    var expected = Buffer.from(statsToken(streamerId));
    var given = Buffer.from(String(token || ''));
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

/**
 * سطور مبيعات استريمر: منتجاته المباشرة + حصته من الباكجات. كل سطر
 * مضروب بنسبة (المدفوع ÷ مجموع أسعار الطلب) عشان خصم الكود ينعكس.
 */
function streamerLines(streamerId) {
    var out = [];
    db.prepare("SELECT * FROM store_orders WHERE status = 'completed' ORDER BY created_at").all().forEach(function (row) {
        var items = parseJsonArray(row.items);
        var sum = items.reduce(function (a, i) { return a + i.price; }, 0) || 1;
        var f = row.total / sum;
        items.forEach(function (i) {
            if (i.parts) {
                i.parts.forEach(function (pt) {
                    if (pt.streamerId === streamerId) out.push({ order: row.id, t: row.created_at, productId: pt.productId, name: pt.name, amount: round2(pt.amount * f), via: i.name });
                });
            } else if (i.streamerId === streamerId) {
                out.push({ order: row.id, t: row.created_at, productId: i.productId, name: i.name, amount: round2(i.price * f), via: null });
            }
        });
    });
    return out;
}

/**
 * @param {number} streamerId
 * @param {string} token - من رابط المشاركة (غير مطلوب للأدمن)
 * @param {Object|null} user
 */
function getStreamerStats(streamerId, token, user) {
    var isAdmin = !!(user && user.role === 'admin');
    var id = toId(streamerId);
    if (!id && !isAdmin) return { success: false, error: 'forbidden' };
    var streamers = listStreamers();
    if (!id && isAdmin && streamers.length) id = streamers[0].id;
    var streamer = streamers.filter(function (s) { return s.id === id; })[0];
    if (!streamer) return { success: false, error: 'not_found' };
    if (!isAdmin && !isValidStatsToken(id, token)) return { success: false, error: 'forbidden' };

    var images = {};
    db.prepare('SELECT id, image_url FROM store_products WHERE streamer_id = ?').all(id).forEach(function (r) { images[r.id] = r.image_url; });

    return {
        success: true,
        streamer: { id: streamer.id, name: streamer.name, user: streamer.user, avatarUrl: streamer.avatarUrl },
        // قائمة الاستريمرز للتنقّل بينهم — للأدمن فقط
        streamers: isAdmin ? streamers.map(function (s) { return { id: s.id, name: s.name }; }) : null,
        lines: streamerLines(id),
        images: images
    };
}

/* ----------------------------------------------------------------------
 * الأدمن — قراءة كل البيانات
 * ---------------------------------------------------------------------- */

function deliveryOptions() {
    var frames = collectiblesService.getCatalog().map(function (c) {
        return { value: 'catalog:' + c.slug, label: 'إطار: ' + (c.display_name_ar || c.slug) };
    });
    var elims = collectiblesService.getElimCardCatalog().filter(function (c) { return !c.limited; }).map(function (c) { return { value: 'elim:' + c.key, label: c.displayNameAr }; });
    var wins = collectiblesService.getWinCardCatalog().filter(function (c) { return !c.limited; }).map(function (c) { return { value: 'win:' + c.key, label: c.displayNameAr }; });
    return [{ value: '', label: 'بدون تسليم تلقائي' }, { value: 'frame', label: 'إطار بروفايل (صورة المنتج)' }]
        .concat(frames, elims, wins);
}

function isValidDelivery(value) {
    return deliveryOptions().some(function (o) { return o.value === value; });
}

function adminGetData() {
    var streamers = listStreamers().map(function (s) { s.statsToken = statsToken(s.id); return s; });
    var deliveries = {};
    listProductRows().forEach(function (r) { deliveries[r.id] = r.delivery || ''; });
    var products = listProductRows().map(mapProduct).map(function (p) { p.delivery = deliveries[p.id]; return p; });
    return {
        success: true,
        categories: listCategories(),
        streamers: streamers,
        products: products,
        coupons: db.prepare('SELECT * FROM store_coupons ORDER BY created_at DESC, id DESC').all().map(function (c) {
            return { id: c.id, code: c.code, pct: c.pct, active: !!c.active };
        }),
        orders: db.prepare("SELECT * FROM store_orders WHERE status = 'completed' ORDER BY created_at").all().map(mapOrder),
        deliveryOptions: deliveryOptions(),
        cloudinaryReady: Boolean(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret)
    };
}

/* ----------------------------------------------------------------------
 * الأدمن — التعديلات (كل دالة ترجع {success, error?})
 * ---------------------------------------------------------------------- */

var OK = { success: true };

function fail(error) { return { success: false, error: error }; }

function createCategory(input) {
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    if (!name) return fail('empty_name');
    if (db.prepare('SELECT id FROM store_categories WHERE name = ?').get(name)) return fail('name_taken');
    var maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM store_categories').get().m || 0;
    var info = db.prepare("INSERT INTO store_categories (name, kind, sort_order, created_at) VALUES (?, 'normal', ?, ?)").run(name, maxOrder + 1, now());
    return { success: true, id: Number(info.lastInsertRowid) };
}

function updateCategory(input) {
    var cat = getCategoryRow(toId(input.id));
    if (!cat) return fail('not_found');
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    if (!name) return fail('empty_name');
    if (db.prepare('SELECT id FROM store_categories WHERE name = ? AND id != ?').get(name, cat.id)) return fail('name_taken');
    db.prepare('UPDATE store_categories SET name = ? WHERE id = ?').run(name, cat.id);
    return OK;
}

var deleteCategory = db.transaction(function (input) {
    var cat = getCategoryRow(toId(input.id));
    if (!cat) return fail('not_found');
    db.prepare('DELETE FROM store_products WHERE category_id = ?').run(cat.id);
    db.prepare('DELETE FROM store_categories WHERE id = ?').run(cat.id);
    return OK;
});

function createStreamer(input) {
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    var user = cleanText(input.user, 40).replace(/@/g, '');
    if (!name || !user) return fail('missing_fields');
    var info = db.prepare('INSERT INTO store_streamers (name, tiktok_user, created_at) VALUES (?, ?, ?)').run(name, user, now());
    return { success: true, id: Number(info.lastInsertRowid) };
}

function updateStreamer(input) {
    var id = toId(input.id);
    var s = id && db.prepare('SELECT * FROM store_streamers WHERE id = ?').get(id);
    if (!s) return fail('not_found');
    var name = input.name !== undefined ? cleanText(input.name, MAX_NAME_LENGTH) : s.name;
    var user = input.user !== undefined ? cleanText(input.user, 40).replace(/@/g, '') : s.tiktok_user;
    var avatar = input.avatarUrl !== undefined ? cleanText(input.avatarUrl, 500) : s.avatar_url;
    if (!name) return fail('empty_name');
    if (!isAllowedImageUrl(avatar)) return fail('invalid_image');
    db.prepare('UPDATE store_streamers SET name = ?, tiktok_user = ?, avatar_url = ? WHERE id = ?').run(name, user, avatar, id);
    return OK;
}

var deleteStreamer = db.transaction(function (input) {
    var id = toId(input.id);
    if (!id || !db.prepare('SELECT id FROM store_streamers WHERE id = ?').get(id)) return fail('not_found');
    db.prepare('DELETE FROM store_products WHERE streamer_id = ?').run(id);
    db.prepare('DELETE FROM store_streamer_subcats WHERE streamer_id = ?').run(id);
    db.prepare('DELETE FROM store_streamers WHERE id = ?').run(id);
    return OK;
});

function createSubcat(input) {
    var streamerId = toId(input.streamerId);
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    if (!streamerId || !db.prepare('SELECT id FROM store_streamers WHERE id = ?').get(streamerId)) return fail('not_found');
    if (!name) return fail('empty_name');
    if (db.prepare('SELECT id FROM store_streamer_subcats WHERE streamer_id = ? AND name = ?').get(streamerId, name)) return fail('name_taken');
    var info = db.prepare('INSERT INTO store_streamer_subcats (streamer_id, name, created_at) VALUES (?, ?, ?)').run(streamerId, name, now());
    return { success: true, id: Number(info.lastInsertRowid) };
}

var deleteSubcat = db.transaction(function (input) {
    var id = toId(input.id);
    if (!id) return fail('not_found');
    db.prepare('UPDATE store_products SET streamer_subcat_id = NULL WHERE streamer_subcat_id = ?').run(id);
    db.prepare('DELETE FROM store_streamer_subcats WHERE id = ?').run(id);
    return OK;
});

function firstStreamerId() {
    var row = db.prepare('SELECT id FROM store_streamers ORDER BY id LIMIT 1').get();
    return row ? row.id : null;
}

function validSubcatFor(streamerId, subcatId) {
    if (!streamerId || !subcatId) return null;
    return db.prepare('SELECT id FROM store_streamer_subcats WHERE id = ? AND streamer_id = ?').get(subcatId, streamerId) ? subcatId : null;
}

function createProduct(input) {
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    var price = toPrice(input.price);
    var cat = getCategoryRow(toId(input.categoryId));
    if (!name) return fail('empty_name');
    if (!(price > 0)) return fail('invalid_price');
    if (!cat || cat.kind === 'bundles') return fail('invalid_category');
    var streamerId = null;
    var subcatId = null;
    if (cat.kind === 'streamers') {
        streamerId = toId(input.streamerId) || firstStreamerId();
        if (!streamerId || !db.prepare('SELECT id FROM store_streamers WHERE id = ?').get(streamerId)) return fail('invalid_streamer');
        subcatId = validSubcatFor(streamerId, toId(input.subcatId));
    }
    var delivery = input.delivery !== undefined ? String(input.delivery) : (cat.kind === 'streamers' || /إطار/.test(cat.name) ? 'frame' : '');
    if (!isValidDelivery(delivery)) delivery = '';
    var info = db.prepare(
        'INSERT INTO store_products (category_id, name, price, badge, streamer_id, streamer_subcat_id, delivery, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(cat.id, name, price, cleanText(input.badge, MAX_BADGE_LENGTH), streamerId, subcatId, delivery, now());
    return { success: true, id: Number(info.lastInsertRowid) };
}

/** مجموع أسعار منتجات الباكج الحالية. */
function bundleSum(items) {
    return round2(items.reduce(function (a, id) { var r = getProductRow(id); return a + (r ? r.price : 0); }, 0));
}

function updateProduct(input) {
    var row = getProductRow(toId(input.id));
    if (!row) return fail('not_found');
    var next = {
        name: row.name, category_id: row.category_id, price: row.price, old_price: row.old_price, off_pct: row.off_pct,
        badge: row.badge, image_url: row.image_url, streamer_id: row.streamer_id, streamer_subcat_id: row.streamer_subcat_id,
        delivery: row.delivery
    };

    if (input.name !== undefined) {
        next.name = cleanText(input.name, MAX_NAME_LENGTH);
        if (!next.name) return fail('empty_name');
    }
    if (input.badge !== undefined) next.badge = cleanText(input.badge, MAX_BADGE_LENGTH);
    if (input.imageUrl !== undefined) {
        next.image_url = cleanText(input.imageUrl, 500);
        if (!isAllowedImageUrl(next.image_url)) return fail('invalid_image');
    }
    if (input.delivery !== undefined) {
        if (!isValidDelivery(String(input.delivery))) return fail('invalid_delivery');
        next.delivery = String(input.delivery);
    }
    if (input.categoryId !== undefined && !row.bundle_items && !row.plan) {
        var cat = getCategoryRow(toId(input.categoryId));
        if (!cat || cat.kind === 'bundles') return fail('invalid_category');
        next.category_id = cat.id;
        if (cat.kind === 'streamers') {
            next.streamer_id = row.streamer_id || firstStreamerId();
        } else {
            next.streamer_id = null;
            next.streamer_subcat_id = null;
        }
    }
    if (input.streamerId !== undefined && next.streamer_id) {
        var sid = toId(input.streamerId);
        if (!sid || !db.prepare('SELECT id FROM store_streamers WHERE id = ?').get(sid)) return fail('invalid_streamer');
        if (sid !== next.streamer_id) next.streamer_subcat_id = null;
        next.streamer_id = sid;
    }
    if (input.subcatId !== undefined) {
        next.streamer_subcat_id = validSubcatFor(next.streamer_id, toId(input.subcatId));
    }
    if (input.price !== undefined) {
        var price = toPrice(input.price);
        if (price === null) return fail('invalid_price');
        next.price = price;
        if (row.bundle_items) {
            var sum = bundleSum(parseJsonArray(row.bundle_items));
            next.old_price = sum > price ? sum : null;
        }
    }
    if (input.offPct !== undefined && !row.bundle_items) {
        // نفس قاعدة "العروض": old = السعر الأساسي، السعر = مقرّب بعد الخصم.
        var pct = Math.min(90, Math.max(0, Math.round(Number(input.offPct) || 0)));
        var base = next.old_price || next.price;
        var autoBadge = !next.badge || next.badge.indexOf(AUTO_OFFER_BADGE_PREFIX) === 0;
        if (pct > 0) {
            next.old_price = base;
            next.price = Math.round(base * (1 - pct / 100));
            next.off_pct = pct;
            if (autoBadge) next.badge = AUTO_OFFER_BADGE_PREFIX + ' ' + pct + '٪';
        } else {
            next.price = base;
            next.old_price = null;
            next.off_pct = null;
            if (autoBadge) next.badge = '';
        }
    }

    db.prepare(
        'UPDATE store_products SET name = ?, category_id = ?, price = ?, old_price = ?, off_pct = ?, badge = ?, image_url = ?, ' +
        'streamer_id = ?, streamer_subcat_id = ?, delivery = ? WHERE id = ?'
    ).run(next.name, next.category_id, next.price, next.old_price, next.off_pct, next.badge, next.image_url,
        next.streamer_id, next.streamer_subcat_id, next.delivery, row.id);

    // صورة جديدة لمنتج "إطار بروفايل" سبق بيعه: نحدّث صورة الإطار عند كل من اشتراه.
    if (row.custom_frame_id && next.image_url && next.image_url !== row.image_url) {
        var shared = db.prepare('SELECT COUNT(*) AS n FROM store_products WHERE custom_frame_id = ?').get(row.custom_frame_id).n;
        if (shared === 1) db.prepare('UPDATE custom_frames SET image_filename = ? WHERE id = ?').run(next.image_url, row.custom_frame_id);
        else db.prepare('UPDATE store_products SET custom_frame_id = NULL WHERE id = ?').run(row.id);
    }
    return OK;
}

function deleteProduct(input) {
    var row = getProductRow(toId(input.id));
    if (!row) return fail('not_found');
    if (row.plan) return fail('cannot_delete_plan');
    db.prepare('DELETE FROM store_products WHERE id = ?').run(row.id);
    db.prepare('DELETE FROM store_favorites WHERE product_id = ?').run(row.id);
    return OK;
}

function applyOffer(input) {
    var row = getProductRow(toId(input.productId));
    if (!row || row.bundle_items) return fail('not_found');
    if (row.old_price) return fail('offer_exists');
    var pct = Math.round(Number(input.pct));
    if (!(pct >= 1 && pct <= 90)) return fail('invalid_pct');
    var badge = cleanText(input.badge, MAX_BADGE_LENGTH) || (AUTO_OFFER_BADGE_PREFIX + ' ' + pct + '٪');
    db.prepare('UPDATE store_products SET old_price = price, price = ?, off_pct = ?, badge = ? WHERE id = ?')
        .run(Math.round(row.price * (1 - pct / 100)), pct, badge, row.id);
    return OK;
}

function removeOffer(input) {
    var row = getProductRow(toId(input.productId));
    if (!row || !row.old_price || row.bundle_items) return fail('not_found');
    var badge = row.badge && row.badge.indexOf(AUTO_OFFER_BADGE_PREFIX) === 0 ? '' : row.badge;
    db.prepare('UPDATE store_products SET price = old_price, old_price = NULL, off_pct = NULL, badge = ? WHERE id = ?').run(badge, row.id);
    return OK;
}

function ensureBundlesCategory() {
    var cat = getCategoryByKind('bundles');
    if (cat) return cat.id;
    var maxOrder = db.prepare('SELECT MAX(sort_order) AS m FROM store_categories').get().m || 0;
    return Number(db.prepare("INSERT INTO store_categories (name, kind, sort_order, created_at) VALUES ('الباكجات', 'bundles', ?, ?)").run(maxOrder + 1, now()).lastInsertRowid);
}

var createBundle = db.transaction(function (input) {
    var name = cleanText(input.name, MAX_NAME_LENGTH);
    var price = toPrice(input.price);
    if (!name) return fail('empty_name');
    var items = [];
    (Array.isArray(input.items) ? input.items : []).forEach(function (raw) {
        var id = toId(raw);
        var r = id && getProductRow(id);
        if (r && !r.bundle_items && !r.hidden && items.indexOf(id) === -1) items.push(id);
    });
    if (items.length < 2) return fail('min_two_items');
    if (!(price > 0)) return fail('invalid_price');
    var sum = bundleSum(items);
    var info = db.prepare(
        'INSERT INTO store_products (category_id, name, price, old_price, badge, bundle_items, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(ensureBundlesCategory(), name, price, sum > price ? sum : null, cleanText(input.badge, MAX_BADGE_LENGTH) || 'باكج', JSON.stringify(items), now());
    return { success: true, id: Number(info.lastInsertRowid) };
});

function createCoupon(input) {
    var code = cleanText(input.code, 40).toUpperCase().replace(/\s/g, '');
    var pct = Math.round(Number(input.pct));
    if (!code) return fail('empty_code');
    if (!/^[A-Z0-9_\-]+$/.test(code)) return fail('invalid_code');
    if (!(pct >= 1 && pct <= 90)) return fail('invalid_pct');
    if (db.prepare('SELECT id FROM store_coupons WHERE code = ? COLLATE NOCASE').get(code)) return fail('code_taken');
    var info = db.prepare('INSERT INTO store_coupons (code, pct, active, created_at) VALUES (?, ?, 1, ?)').run(code, pct, now());
    return { success: true, id: Number(info.lastInsertRowid) };
}

function toggleCoupon(input) {
    var id = toId(input.id);
    var info = db.prepare('UPDATE store_coupons SET active = 1 - active WHERE id = ?').run(id || 0);
    return info.changes ? OK : fail('not_found');
}

function deleteCoupon(input) {
    var info = db.prepare('DELETE FROM store_coupons WHERE id = ?').run(toId(input.id) || 0);
    return info.changes ? OK : fail('not_found');
}

/* ----------------------------------------------------------------------
 * رفع الصور (Cloudinary — توقيع فقط، الملف يُرفع مباشرة من المتصفح)
 * ---------------------------------------------------------------------- */

var MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function getUploadSignature(input) {
    if (!(config.cloudinaryCloudName && config.cloudinaryApiKey && config.cloudinaryApiSecret)) return fail('uploads_not_configured');
    input = input || {};
    var ext = String(input.fileName || '').split('.').pop().toLowerCase();
    if (['png', 'jpg', 'jpeg', 'webp', 'gif'].indexOf(ext) === -1) return fail('file_type_not_allowed');
    var size = Number(input.fileSize);
    if (!isFinite(size) || size <= 0) return fail('invalid_file_size');
    if (size > MAX_IMAGE_BYTES) return fail('file_too_large');
    var params = {
        allowed_formats: 'png,jpg,jpeg,webp,gif',
        public_id: 'agp-store/' + crypto.randomBytes(12).toString('hex'),
        timestamp: Math.floor(now() / 1000)
    };
    var toSign = Object.keys(params).sort().map(function (k) { return k + '=' + params[k]; }).join('&');
    return {
        success: true,
        apiKey: config.cloudinaryApiKey,
        uploadUrl: 'https://api.cloudinary.com/v1_1/' + encodeURIComponent(config.cloudinaryCloudName) + '/image/upload',
        params: params,
        signature: crypto.createHash('sha1').update(toSign + config.cloudinaryApiSecret).digest('hex')
    };
}

/* ----------------------------------------------------------------------
 * البيانات الأولية (أول تشغيل فقط — لو جدول التصنيفات فاضي)
 * ---------------------------------------------------------------------- */

// التصنيفات + الاستريمر «الريس» بإطاراته الثلاثة (صورها موجودة أصلاً
// بالمستودع، ومربوطة بنفس مقتنياتها: بطاقة الفوز/بطاقة الإقصاء/الإطار) +
// باقات برنامج الاستريمرز + كودا الخصم من ملف التسليم. باقي المنتجات
// والاستريمرز في البروتوتايب كانت أمثلة وهمية، فما تنضاف.
(function ensureStoreSeed() {
    if (db.prepare('SELECT COUNT(*) AS n FROM store_categories').get().n > 0) return;
    var t = now();
    var seed = db.transaction(function () {
        var catIds = {};
        [
            ['إطارات الأندية', 'normal'], ['إطارات عامة', 'normal'], ['إطارات الاستريمرز', 'streamers'],
            ['باقات ألعاب', 'normal'], ['تأثيرات البث', 'normal'], ['اشتراكات', 'normal'], ['الباكجات', 'bundles']
        ].forEach(function (c, i) {
            catIds[c[1] === 'normal' ? c[0] : c[1]] = Number(db.prepare('INSERT INTO store_categories (name, kind, sort_order, created_at) VALUES (?, ?, ?, ?)').run(c[0], c[1], i + 1, t).lastInsertRowid);
        });

        var rayes = Number(db.prepare('INSERT INTO store_streamers (name, tiktok_user, created_at) VALUES (?, ?, ?)').run('الريس', 'alrayes', t).lastInsertRowid);
        var subBroadcast = Number(db.prepare('INSERT INTO store_streamer_subcats (streamer_id, name, created_at) VALUES (?, ?, ?)').run(rayes, 'إطارات البث', t).lastInsertRowid);
        var subBattles = Number(db.prepare('INSERT INTO store_streamer_subcats (streamer_id, name, created_at) VALUES (?, ?, ?)').run(rayes, 'إطارات المعارك', t).lastInsertRowid);

        var insertProduct = db.prepare(
            'INSERT INTO store_products (category_id, name, price, old_price, badge, image_url, streamer_id, streamer_subcat_id, plan, hidden, delivery, created_at) ' +
            'VALUES (@category_id, @name, @price, @old_price, @badge, @image_url, @streamer_id, @streamer_subcat_id, @plan, @hidden, @delivery, @created_at)'
        );
        function product(p) {
            return insertProduct.run(Object.assign({
                category_id: null, old_price: null, badge: '', image_url: '', streamer_id: null, streamer_subcat_id: null,
                plan: null, hidden: 0, delivery: '', created_at: t
            }, p));
        }
        // created_at تنازلي بسيط عشان يحافظ على ترتيب العرض بالبروتوتايب.
        product({ category_id: catIds.streamers, name: 'إطار فوز الريس', price: 59, badge: 'الأكثر طلباً', image_url: 'assets/win-cards/win-card-rais-blue.png', streamer_id: rayes, streamer_subcat_id: subBroadcast, delivery: 'win:rais-blue', created_at: t + 3 });
        product({ category_id: catIds.streamers, name: 'إطار عملية إقصاء', price: 69, badge: 'جديد', image_url: 'assets/elim-cards/elim-card-crystal-crown.png', streamer_id: rayes, streamer_subcat_id: subBattles, delivery: 'elim:crystal-crown', created_at: t + 2 });
        product({ category_id: catIds.streamers, name: 'إطار الريس الكريستالي', price: 49, old_price: 65, image_url: 'frame-rais-sapphire.png', streamer_id: rayes, streamer_subcat_id: subBroadcast, delivery: 'frame', created_at: t + 1 });

        product({ name: 'الباقة الأساسية', price: 39, plan: 'basic', hidden: 1 });
        product({ name: 'الباقة المتوسطة', price: 49, plan: 'mid', hidden: 1 });
        product({ name: 'الباقة المتكاملة', price: 59, plan: 'full', hidden: 1 });

        var insertCoupon = db.prepare('INSERT INTO store_coupons (code, pct, active, created_at) VALUES (?, ?, 1, ?)');
        insertCoupon.run('WELCOME10', 10, t);
        insertCoupon.run('RAYES20', 20, t + 1);
    });
    seed();
    logger.log('Store: seeded default categories, streamer, plans and coupons');
}());

// تحديث الكتالوج (مرة وحدة لكل قاعدة بيانات): حذف منتجات الريس الثلاثة،
// إضافة إطارات التصميم الموجودة صورها بالمستودع في «إطارات الأندية» و«إطارات
// عامة»، وتوحيد سعر كل المنتجات القابلة للبيع على 17.95 (الباقات والباكجات
// ما تتغير).
var CATALOG_V2_PRICE = 17.95;
var CATALOG_V2_FRAMES = [
    ['إطارات الأندية', 'إطار الأهلي', 'frame-al-ahli.png'],
    ['إطارات الأندية', 'إطار الأهلي الجوهرة', 'frame-club-ahli-jawahara.png'],
    ['إطارات الأندية', 'إطار الهلال المدينة', 'frame-club-hilal-city.png'],
    ['إطارات الأندية', 'إطار الهلال التاج', 'frame-club-hilal-crown.png'],
    ['إطارات الأندية', 'إطار الهلال الراية', 'frame-club-hilal-flag.png'],
    ['إطارات الأندية', 'إطار الهلال النجوم', 'frame-club-hilal-stars.png'],
    ['إطارات الأندية', 'إطار الهلال الكأس', 'frame-club-hilal-trophy.png'],
    ['إطارات الأندية', 'إطار الهلال الذيب', 'frame-club-hilal-wolf.png'],
    ['إطارات الأندية', 'إطار الاتحاد التاج', 'frame-club-ittihad-crown.png'],
    ['إطارات الأندية', 'إطار النصر التاج', 'frame-club-nassr-crown.png'],
    ['إطارات الأندية', 'إطار النصر النسر', 'frame-club-nassr-eagle.png'],
    ['إطارات الأندية', 'إطار النصر النخلة', 'frame-club-nassr-palm.png'],
    ['إطارات عامة', 'إطار السعودية الدلة', 'frame-country-ksa-dallah.png'],
    ['إطارات عامة', 'إطار السعودية الصقر', 'frame-country-ksa-falcon.png'],
    ['إطارات عامة', 'إطار الملعب', 'frame-general-stadium.png'],
    ['إطارات عامة', 'إطار ملاك القمر', 'frame-girls-angel-moon.png'],
    ['إطارات عامة', 'إطار الأرنب الأزرق', 'frame-girls-bunny-blue.png'],
    ['إطارات عامة', 'إطار تاج الورد', 'frame-girls-crown-rose.png'],
    ['إطارات عامة', 'إطار كيتي القلوب', 'frame-girls-kitty-hearts.png'],
    ['إطارات عامة', 'إطار كيتي الهلال', 'frame-girls-kitty-hilal.png'],
    ['إطارات عامة', 'إطار كيتي', 'frame-girls-kitty.png'],
    ['إطارات عامة', 'إطار التنين', 'frame-rare-dragon.png']
];
var CATALOG_V2_REMOVED_IMAGES = ['assets/win-cards/win-card-rais-blue.png', 'assets/elim-cards/elim-card-crystal-crown.png', 'frame-rais-sapphire.png'];
var CATALOG_V2_REMOVED_NAMES = ['إطار فوز الريس', 'إطار عملية إقصاء', 'إطار الريس الكريستالي'];

(function ensureCatalogV2() {
    if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'store_catalog_v2'").get()) return;
    var t = now();
    db.transaction(function () {
        db.prepare('SELECT id, name, image_url FROM store_products').all().forEach(function (r) {
            if (CATALOG_V2_REMOVED_IMAGES.indexOf(r.image_url) === -1 && CATALOG_V2_REMOVED_NAMES.indexOf(r.name) === -1) return;
            db.prepare('DELETE FROM store_products WHERE id = ?').run(r.id);
            db.prepare('DELETE FROM store_favorites WHERE product_id = ?').run(r.id);
        });

        var catIds = {};
        function categoryId(name) {
            if (catIds[name]) return catIds[name];
            var row = db.prepare("SELECT id FROM store_categories WHERE name = ? AND kind = 'normal'").get(name);
            if (!row) {
                var order = db.prepare('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM store_categories').get().n;
                row = { id: Number(db.prepare("INSERT INTO store_categories (name, kind, sort_order, created_at) VALUES (?, 'normal', ?, ?)").run(name, order, t).lastInsertRowid) };
            }
            return (catIds[name] = row.id);
        }
        var insert = db.prepare(
            "INSERT INTO store_products (category_id, name, price, badge, image_url, hidden, delivery, created_at) VALUES (?, ?, ?, '', ?, 0, 'frame', ?)"
        );
        // created_at تنازلي عشان يطلع أول إطار بالقائمة أول واحد بالمتجر.
        CATALOG_V2_FRAMES.forEach(function (f, i) {
            if (db.prepare('SELECT 1 FROM store_products WHERE image_url = ?').get(f[2])) return;
            insert.run(categoryId(f[0]), f[1], CATALOG_V2_PRICE, f[2], t + CATALOG_V2_FRAMES.length - i);
        });

        var bundlesCat = getCategoryByKind('bundles');
        db.prepare('UPDATE store_products SET price = ?, old_price = NULL, off_pct = NULL WHERE plan IS NULL AND bundle_items IS NULL' +
            (bundlesCat ? ' AND (category_id IS NULL OR category_id != ' + Number(bundlesCat.id) + ')' : '')).run(CATALOG_V2_PRICE);

        db.prepare("INSERT INTO app_settings (key, value) VALUES ('store_catalog_v2', ?)").run(String(t));
    })();
    logger.log('Store: catalog v2 applied (design frames at ' + CATALOG_V2_PRICE + ')');
}());

// حذف الاستريمر «الريس» من المتجر (مرة وحدة) — نفس حذفه من لوحة الإدارة.
(function removeRayesStreamer() {
    if (db.prepare("SELECT 1 FROM app_settings WHERE key = 'store_rayes_removed'").get()) return;
    db.prepare("SELECT id FROM store_streamers WHERE tiktok_user = 'alrayes' OR name = 'الريس'").all().forEach(function (s) {
        deleteStreamer({ id: s.id });
    });
    db.prepare("INSERT INTO app_settings (key, value) VALUES ('store_rayes_removed', ?)").run(String(now()));
}());

module.exports = {
    PLAN_KEYS: PLAN_KEYS,
    getPublicStore: getPublicStore,
    checkCoupon: checkCoupon,
    priceCart: priceCart,
    checkout: checkout,
    getOrderStatus: getOrderStatus,
    handlePaylinkWebhook: handlePaylinkWebhook,
    handleMoyasarWebhook: handleMoyasarWebhook,
    listMyOrders: listMyOrders,
    setFavorite: setFavorite,
    getStreamerStats: getStreamerStats,
    statsToken: statsToken,
    adminGetData: adminGetData,
    getUploadSignature: getUploadSignature,
    adminActions: {
        'category/create': createCategory,
        'category/update': updateCategory,
        'category/delete': deleteCategory,
        'streamer/create': createStreamer,
        'streamer/update': updateStreamer,
        'streamer/delete': deleteStreamer,
        'subcat/create': createSubcat,
        'subcat/delete': deleteSubcat,
        'product/create': createProduct,
        'product/update': updateProduct,
        'product/delete': deleteProduct,
        'offer/apply': applyOffer,
        'offer/remove': removeOffer,
        'bundle/create': createBundle,
        'coupon/create': createCoupon,
        'coupon/toggle': toggleCoupon,
        'coupon/delete': deleteCoupon
    }
};
