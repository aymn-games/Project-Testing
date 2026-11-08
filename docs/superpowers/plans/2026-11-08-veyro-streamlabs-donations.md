# Veyro: ربط Streamlabs والدونيشن — خطة التنفيذ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** دونيشن Streamlabs (ومنه كريترز) يوصل Veyro ويطلع بالأليرتات والتوب والهدف و«آخر دعم» والإحصائيات، بدون ضياع أو تكرار.

**Architecture:** السيرفر يحفظ رمز Socket API لكل ستريمر ويفتح اتصال socket.io v2 مع Streamlabs طول الوقت؛ كل دونيشن ينحفظ بـSQLite (`UNIQUE(user_id, sl_id)`) ويدخل طابور بالذاكرة. رابط الشاشة ياخذ الجديد مع طلب الأحداث (`dseq`/`donations`)، والتوب/الهدف/آخر دعم من ملخص الإحصائيات (`donors`، `totals.donations`، `totals.lastDonation`).

**Tech Stack:** Node.js + better-sqlite3 + `socket.io-client@2.5.0` (جديد)، `node:test`، Vanilla JS بالواجهة.

**Spec:** `docs/superpowers/specs/2026-11-08-veyro-streamlabs-donations-design.md`

## Global Constraints

- رمز Streamlabs ما يرجع للواجهة أبداً، وما يدخل تصميم الشاشة.
- المبالغ بالسنتات (عدد صحيح) بالتخزين والجمع؛ الواجهة تعرض دولار (`$25`، `$1,250.50` لو فيه سنتات).
- المجاميع (التوب/الهدف/الإحصائيات/آخر دعم بالمجموع) = الدولار بس (`currency` = `USD`) وغير التجارب (`is_test = 0`)، من «بداية العدّاد».
- بداية العدّاد الفعلية = `counter_from`، ولو `auto_reset` = الأكبر من `counter_from` وبداية جلسة البث الحالية (`getRecentEvents(username).sid`).
- التجارب والعملات الثانية: تنحفظ وتطلع أليرت، وما تنحسب.
- رسالة الداعم مخفية افتراضياً (`showMessage: false`) بالأليرت وأداة «آخر دعم».
- `streamlabs-*` يشتغل على الإنتاج بدون أي متغيّر بيئة جديد.
- صفوف الإعدادات: العنوان يمين والتحكم يسار.
- اختبارات السيرفر: `cd backend && node --test <files>`.

## Review Focus

1. نفس الدونيشن يوصل مرتين (إعادة اتصال Streamlabs) ← ينحفظ ويطلع أليرت مرة وحدة.
2. رمز غلط ← الربط يرجع `invalid_token` بسرعة، وما يحفظه، وما يعيد المحاولة بلا نهاية.
3. ستريمر يصفّر العدّاد وسط البث ← التوب والهدف يرجعون صفر فوراً، والسجل ما ينمسح.
4. مبلغ نصّي أو فيه فواصل من Streamlabs (`"25.00"`، `"1,000"`) ← ينحسب صح بالسنتات.
5. رابط شاشة بدون أداة دونيشن ← ما يوصله `donations` (الرد نفسه بدون تغيير).

---

### Task 1: مخزن الدونيشن

**Files:**
- Create: `backend/streamlabs/donations-store.js`
- Test: `backend/streamlabs/donations-store.test.js`

**Interfaces:**
- Produces: `createStore(db, { now? })` →
  - `saveLink(userId, token)`, `getLink(userId) -> { userId, token, status, lastError, linkedAt, lastEventAt, counterFrom, autoReset } | null`, `allLinks() -> [link]`, `removeLink(userId)`, `setStatus(userId, status, lastError?)`, `reset(userId)`, `setAutoReset(userId, bool)`.
  - `addDonation(userId, { slId, name, amount, currency, message, isTest }) -> donation | null` (null = مكرر أو غير صالح). `donation = { id, slId, name, amountCents, currency, message, isTest, receivedAt }`.
  - `summary(userId, fromTs, topN) -> { donors: [{ name, amount, count }], total, lastDonation: { name, amount, currency, message, at } | null }` (amount بالدولار).
  - `list(userId, limit) -> [donation]` الأحدث أول.
  - `effectiveFrom(link, sessionStartedAt|null) -> number`.
  - `toCents(v) -> number|null` (مكشوفة للاختبار).
- [ ] **Step 1: Write the failing tests** (`better-sqlite3(':memory:')`):
  - `toCents`: `25` → 2500، `'25.00'` → 2500، `'1,000.5'` → 100050، `'0.99'` → 99، `-5`/`'abc'`/`0` → null.
  - `addDonation` نفس `slId` مرتين لنفس اليوزر ← الثاني null ومجموع واحد؛ نفس `slId` ليوزر ثاني ← ينحفظ.
  - `summary`: 3 دونيشن لـ«فهد» (10، 5.5) و«نوره» (20) + تجربة (100) + يورو (50) ← donors `[{نوره,20,1},{فهد,15.5,2}]`، total 35.5، lastDonation = آخر وحدة دولار غير تجربة.
  - `reset` ← summary من الحين = فاضي، و`list` لسا فيها الكل.
  - `effectiveFrom`: autoReset=false ← counterFrom؛ true وجلسة أحدث ← بداية الجلسة؛ true وجلسة أقدم ← counterFrom.
  - `saveLink` ← counterFrom = الحين، status `connecting`؛ `removeLink` يشيل الرمز والدونيشن باقي.
- [ ] **Step 2: Run** `cd backend && node --test streamlabs/donations-store.test.js` — FAIL (no module).
- [ ] **Step 3: Implement** — جداول `streamlabs_links` و`donations` (`UNIQUE(user_id, sl_id)`، فهرس `(user_id, received_at)`) بالضبط مثل الوثيقة؛ `INSERT OR IGNORE`.
- [ ] **Step 4: Run** — PASS.
- [ ] **Step 5: Commit** `feat(streamlabs): donations store with dedupe, cents and counter window`

### Task 2: الاتصال بـStreamlabs

**Files:**
- Create: `backend/streamlabs/streamlabs-manager.js`
- Modify: `backend/package.json` (`"socket.io-client": "2.5.0"`)، `backend/server.js` (تشغيل `startStreamlabs()` بعد الاستماع)
- Test: `backend/streamlabs/streamlabs-manager.test.js`

**Interfaces:**
- Consumes: Task 1 store.
- Produces: `createManager({ store, io, now?, onDonation? })` →
  - `connect(userId)`, `disconnect(userId)`, `connectAll()`, `status(userId)`.
  - `link(userId, token) -> Promise<{ success, error?: 'invalid_token'|'timeout' }>` — يتصل برمز جديد ويستنى `connect` (نجاح ← يحفظ الرمز) أو `connect_error`/`error` بـ"Unauthorized"/مهلة `LINK_TIMEOUT_MS = 10000` (فشل ← ما يحفظ).
  - `handleEvent(userId, payload)` — `payload.type === 'donation'` ← لكل `message[]`: `addDonation` بـ`slId = String(m._id || m.id)`، `isTest = Boolean(m.isTest || m.is_test || payload.for === 'test')`، وكل جديد ← `pushRecent(userId, donation)` + `onDonation`.
  - `recent(userId, since) -> { dseq, donations: [{ seq, type:'donation', user, amount, currency, message, isTest, at }] }` (حلقة 50 بالذاكرة لكل يوزر، seq يزيد).
  - `get()` singleton + `startStreamlabs()`.
  - الاتصال: `io('https://sockets.streamlabs.com?token=' + token, { transports: ['websocket'], reconnection: true, reconnectionDelay: 2000, reconnectionDelayMax: 60000 })`؛ رفض الرمز (`Unauthorized`) ← `setStatus('invalid_token')` ويقفل بدون إعادة.
- [ ] **Step 1: Write the failing tests** بـ`io` وهمي (EventEmitter): `link` بنجاح ← الرمز محفوظ و`status` = connected؛ `link` برفض ← `invalid_token` وما فيه رابط محفوظ؛ `link` بدون رد ← `timeout` بعد المهلة (مهلة قصيرة بالاختبار)؛ حدث donation بنفس `_id` مرتين ← `recent` فيه واحد ومخزن فيه واحد؛ حدث فيه 2 بـ`message[]` ← اثنين؛ حدث `follow` ← تجاهل؛ `disconnect` ← socket.close انستدعى؛ رفض بعد اتصال ← status `invalid_token` وما فيه إعادة.
- [ ] **Step 2: Run** `node --test streamlabs/streamlabs-manager.test.js` — FAIL.
- [ ] **Step 3: Implement** + `npm install socket.io-client@2.5.0 --save-exact` بـ`backend/`.
- [ ] **Step 4: Run** — PASS، و`node server.js` يقوم بدون أخطاء.
- [ ] **Step 5: Commit** `feat(streamlabs): socket connection manager with link validation and recent feed`

### Task 3: المسارات وبيانات الشاشة

**Files:**
- Modify: `backend/http/auth-router.js`، `backend/stats/screen-tests.js` (`TYPES` + `'donation'`)، `backend/stats/screen-audio-design.js` (+ `usesDonations(design)`)
- Test: `backend/stats/screen-audio-design.test.js` (إضافة)، `backend/streamlabs/donations-stats.test.js`

**Interfaces:**
- Consumes: Task 1/2.
- Produces:
  - `usesDonations(design) -> boolean`: عنصر غير مخفي `alert` بأحداثه `donation`، أو `top` بأقسامه `donors`، أو `goal` بـ`metric: 'donations'`، أو `lastdonation`.
  - `backend/streamlabs/donations-stats.js`: `mergeDonations(stats|null, summary, wantDonors:number) -> stats` (يضيف `sections.donors`، `totals.donations`، `totals.lastDonation`؛ ينشئ كائن لو stats null).
  - `sendSessionStats(res, username, rawSections, userId)`: يقبل `donors:<n>` بالأقسام، ولو userId موجود يدمج ملخص الدونيشن من `effectiveFrom`.
  - `/api/public/screen/events?...&d=<dseq>` ← `dseq`، `donations` لو `usesDonations`.
  - مسارات الحساب: `GET /api/streamlabs`، `POST /api/streamlabs/link {token}`، `POST /api/streamlabs/unlink`، `POST /api/streamlabs/reset`، `POST /api/streamlabs/settings {autoReset}`، `GET /api/streamlabs/donations?limit=` (كلها `screensGate`، والرمز ما يرجع).
- [ ] **Step 1: Write the failing tests**: `usesDonations` للحالات الأربع + مخفي ← false؛ `mergeDonations(null, summary, 3)` ← `sections.donors` 3 بالكثير و`totals.donations`؛ `mergeDonations(stats, …, 0)` ← ما يضيف donors بس يضيف totals.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** + المسارات.
- [ ] **Step 4: Run** كل `node --test` بالسيرفر — PASS. وتجربة يدوية `curl` لشاشة بدون أداة دونيشن ← الرد بدون `donations`.
- [ ] **Step 5: Commit** `feat(streamlabs): routes, donations in screen events and stats`

### Task 4: المحرّك (`js/agp-stream-overlay.js`)

**Interfaces:**
- Consumes: Task 3 (`dseq`/`donations`، `sections.donors`، `totals.donations`/`lastDonation`، تجربة `donation`).
- Produces:
  - `ALERT_EVENTS_ALL.donation = { label: 'الدونيشن', title: 'دعم جديد', icon: 'dollar', msg: '{name} دعم بـ{amount}' }` + `{amount}` و`{message}` (فاضي لو `showMessage` مو مفعّل) بنص الأليرت.
  - `alertMatches`: `donation` ← `minAmount ≤ amount ≤ maxAmount` (0 = بدون أعلى).
  - `SECTIONS.donors = { label: 'الدونيشن', title: 'أعلى الداعمين بالدونيشن', icon: 'dollar' }` بقيمة `$`؛ أيقونة دولار ذهبية بالتوب (`THRONE_ICONS.donors`).
  - `METRICS.donations = { name: 'الدونيشن', unit: 'دولار', icon: 'dollar' }` بالأهداف (عرض `$`).
  - نوع أداة جديد `lastdonation` (`newItem`: `{ showMessage: false, size: 3, color: '#ffd54a', title: 'آخر دعم' }`) يعرض الاسم والمبلغ.
  - دالة `fmtMoney(dollars) -> '$1,250' | '$12.50'`.
  - دونيشن جديد بالرابط ← أليرت + `fetchStats()` فوراً (التوب والهدف يتحدّثون بدون انتظار 15 ثانية).
- [ ] **Step 1: Implement**.
- [ ] **Step 2: Verify** بالمتصفح (`live.html` بمسارات وهمية): دونيشن $25 ← أليرت مدى 10–49 يشتغل وأليرت 50+ لا؛ `{amount}` = `$25`؛ رسالة الداعم ما تطلع إلا مع `showMessage`؛ أول طلب ← ما يطلع أليرت للقديم؛ توب بـ`donors` يعرض `$`؛ هدف دونيشن يتعبّى؛ «آخر دعم» يتحدّث مع الدونيشن.
- [ ] **Step 3: Commit** `feat(screens): donation alerts, donors top, donations goal and last donation tool`

### Task 5: Veyro

**Files:** `veyro/studio.js`، `veyro/index.html` (CSS لو احتاج)، `veyro/stats-card.js`
- [ ] **Step 1: Implement**:
  - بطاقة «Streamlabs» بقسم «الرابط والإعدادات» + كرت بالرئيسية تحت «اتصل بالبث»: الحالة، الخطوات (Streamlabs ← Settings ← API Settings ← API Tokens ← انسخ «Your Socket API Token»)، خانة لصق + «ربط»، «فصل»، «تصفير عدّاد الدونيشن»، مفتاح «تصفير تلقائي مع كل بث»، وسجل آخر 20 دونيشن (الاسم، المبلغ والعملة، الوقت، «تجربة»/«عملة مختلفة»).
  - خصائص الأليرت: «الدونيشن» بالأحداث، ولما يكون مختار: «من» و«إلى» بالدولار + «رسالة الداعم» (مفتاح). زر «جرّب» بنوع `donation`.
  - صف «التوب»: خيار «الدونيشن» (`donors`) بالاختيار السريع و«يعرض».
  - الأهداف: أداة «هدف الدونيشن» (`metric: 'donations'`, target 100) + أداة «آخر دعم».
  - صورة الإحصائيات: قسم `donations` يطلب `donors:N` من السيرفر ويشيل `soon`.
- [ ] **Step 2: Verify** بالمتصفح (مسارات وهمية): ربط برمز صح/غلط، فصل، تصفير، السجل، إضافة الأدوات وحفظها، «جرّب»، الجوال، والعنوان يمين والتحكم يسار.
- [ ] **Step 3: Commit** `feat(veyro): Streamlabs link card, donation alerts, top, goal and last donation`

### Task 6: التوثيق والفحص

- [ ] كل اختبارات السيرفر PASS؛ فحص Veyro القديم (الدخول، الأليرتات، التوب، الصوت) ما انكسر.
- [ ] `docs/CHANGELOG.md` (1.8.0) و`docs/BACKEND_ARCHITECTURE.md` (قسم Streamlabs).
- [ ] Commit `docs: Streamlabs donations`
