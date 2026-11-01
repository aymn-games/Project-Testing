# حفلة عيد الميلاد — الدفعة 1 (الأساس) خطة التنفيذ

> **للمنفّذين:** مهارة لازمة: superpowers:subagent-driven-development (المنصوح بها) أو superpowers:executing-plans لتنفيذ الخطة مهمة بمهمة. الخطوات بصيغة مربعات (`- [ ]`) للمتابعة.

**الهدف:** غرف حفلة على السيرفر، ودخول بالباركود (ضيف سريع، أو مسجّل، أو صاحبة الحفلة)، وكل الجوالات تشوف كل الشخصيات تمشي مع بعض في القاعة ثلاثية الأبعاد، وتتحمل 100 لاعب.

**البنية:**
- قسم جديد في السيرفر `backend/party/`، مبني على نفس أسلوب `backend/station/`:
  - منطق الغرف في ملف نقي بدون اتصالات، عشان ينختبر بسهولة.
  - خادم WebSocket على `/ws/party`، محمي من الأخطاء وطافي افتراضياً.
- الواجهة في `games/birthday-party/`، وفيها 3 صفحات:
  - `index.html`: صفحة المذيع.
  - `join.html`: صفحة دخول الجوال.
  - `play.html`: المشهد ثلاثي الأبعاد للكل.

**التقنيات:** Node 22 بدون مكتبات جديدة، والاختبارات بـ `node:test` المدمج. Three.js 0.160.0 من الـ CDN. الباركود بـ `qrcode-generator@1.4.4` (نفس اللي تستخدمه «محطة سهيل»).

**وثيقة التصميم:** `docs/superpowers/specs/2026-10-28-birthday-party-design.md`

## قيود عامة

- Three.js مثبّت على `0.160.0` من `https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js`.
- الواجهة بدون Framework ولا أداة بناء ولا مكتبات جديدة، ما عدا `qrcode-generator@1.4.4` الموجودة في المشروع.
- كل النصوص عربية، والاتجاه `dir="rtl"`، والخطوط `IBM Plex Sans Arabic` و`Zain` و`Aref Ruqaa`.
- حد اللاعبين **100 ضيف** لكل حفلة (المذيع وصاحبة الحفلة ما ينحسبون منهم). **حفلتين كحد أقصى** بنفس الوقت.
- الحفلات **طافية افتراضياً**: `config.partyEnabled = process.env.PARTY_ENABLED === '1'`.
- أي خطأ في كود الحفلة يتسجل بـ `logger.error` وما يطيّح السيرفر.
- معدل إرسال الحركة **8 تحديثات/ث**. الهدف أقل من 300 كيلوبايت/ث للحفلة كلها مع 100 لاعب.
- ما فيه أسرار في الكود. عنوان السيرفر بالإنتاج `wss://project-testing-akds.onrender.com/ws/party`، ومحلياً `ws://localhost:8787/ws/party`.
- الأسماء تنظَّف: تنحذف أحرف التحكم و`<>`، وتنقص لـ 16 حرف، والاسم الفاضي مرفوض.
- قاعة اللعب: `HX = 32` و`HZ = 48`. اللاعب محصور داخل `|x| ≤ 31` و`|z| ≤ 47`.

## نقاط تحتاج انتباه في المراجعة

1. **جوال نام أو انقطع ثم رجع:** يرجع لنفس شخصيته بـ `resume`، وما تتكرر الشخصية. (المهمة 1 والمهمة 2)
2. **شخصين مسحوا باركود صاحبة الحفلة:** الثاني يُرفض بـ `girl-taken`، إلا إذا كان نفس الجهاز يرجع بـ `resume`. (المهمة 1)
3. **رسائل حركة مزوّرة** (قفزة بعيدة، أو أرقام مو أرقام، أو 100 رسالة بالثانية): السيرفر يقصّها ويتجاهل الزايد. (المهمة 1 والمهمة 2)
4. **أسماء فيها HTML أو طويلة أو فاضية أو فيها إيموجي:** تنظَّف أو تنرفض بدون ما تخرب العرض. (المهمة 1)
5. **السيرفر أعاد التشغيل** (تحديث تلقائي من Render بعد الدمج): كل الجوالات تعرض «جاري إعادة الاتصال»، وتحاول تتصل من جديد، وإذا اختفت الغرفة تطلع رسالة واضحة. (المهمة 3)
   **تنبيه للمالك:** لا تدمج أي شي في `main` وقت الحفلة الحقيقية.

---

### المهمة 1: مدير الغرف (منطق نقي) + اختباراته

**الملفات:**
- إنشاء: `backend/party/party-rooms.js`
- اختبار: `backend/party/party-rooms.test.js`

**الواجهات:**
- ينتج: `createRoomManager(opts) → mgr`
  - `opts = { maxRooms = 2, maxGuests = 100, now = Date.now, validateSession = token => user|null }`
  - `user` من `auth-service.validateSession`، وفيه `{ id, username, tiktok_username, tiktok_verified }`.
- دوال `mgr`، وكل وحدة ترجع `{ ok: true, ... }` أو `{ ok: false, err }`:
  - `createRoom({ girlName }) → { ok, code, token, girlKey }`. `code` من 4 أرقام، و`token` و`girlKey` hex عشوائي.
  - `hostResume(code, token) → { ok }`.
  - `join(code, { name, auth, girlKey }) → { ok, id, key, n, role: 'guest'|'girl', kind: 'quick'|'member' }`. `n` رقم صغير مختصر للاعب داخل الغرفة، يبدأ من 1.
    - الضيف المسجّل: `auth` صالح، و`kind: 'member'`، والاسم الافتراضي `user.username`.
    - صاحبة الحفلة: `girlKey` صحيح، و`role: 'girl'`، وتاخذ `kind: 'member'` دائماً (كل شي مفتوح لها حسب التصميم).
  - `resume(code, id, key) → { ok, id, n, role, kind }`.
  - `leave(code, id)` يعلّم اللاعب غير متصل، وما يحذفه (عشان يقدر يرجع).
  - `move(code, id, [x, z, ry, a], t) → { ok }`:
    - يقصّ داخل الحدود.
    - يرفض أي حركة أسرع من `14 م/ث × الزمن منذ آخر حركة + 0.5م`، ويبقى اللاعب مكانه.
    - يتجاهل الرسائل اللي يفصلها أقل من 60 مللي ثانية عن اللي قبلها.
    - `a` رقم حركة صحيح من 0 إلى 15.
  - `roster(code) → { code, girlName, players: [[n, name, role, kind, online]] }`
  - `takeDelta(code) → [[n, x, z, ry, a], ...]`: بس اللي تغيّروا من آخر استدعاء. الأرقام تنقرّب لمنزلتين عشريتين، و`ry` لـ 0.01.
  - `fullState(code)`: نفس صيغة `takeDelta` بس لكل اللاعبين، وتُستخدم للي دخل جديد.
  - `closeRoom(code)`.
  - `rooms()`: قائمة الأكواد.
- معرّف اللاعب بالنقاط (للدفعات الجاية): `pointsId(player) = 'tiktok:' + tiktok_username` إذا كان `tiktok_verified`، وإلا `null`.

- [ ] **الخطوة 1: كتابة الاختبارات اللي تفشل** في `party-rooms.test.js` باستخدام `node:test` و`assert/strict`:
  - `createRoom gives 4-digit code and secrets`: `/^\d{4}$/` على `code`، و`token` و`girlKey` طولهم ≥ 16.
  - `third room is refused`: إنشاء غرفتين ثم الثالثة ← `err === 'busy'`.
  - `quick guest joins with cleaned name`: `name: '  <b>سارة</b>\u0007 الطويلة جداً جداً جداً '` ← `kind 'quick'`، و`role 'guest'`، والاسم بدون `<>` ولا أحرف تحكم، وطوله ≤ 16.
  - `empty name refused`: `name: '   '` ← `err 'name'`.
  - `member joins with valid session`: `validateSession` وهمي يرجّع user ← `kind 'member'`.
  - `bad session falls back to error`: `auth` غير صالح ← `err 'auth'`.
  - `girl joins with key, second girl refused`: الأولى `role 'girl'`، والثانية بنفس المفتاح `err 'girl-taken'`، و`girlKey` خطأ ← `err 'girl-key'`.
  - `101st guest refused`: 100 ضيف ينجحون، والـ101 ← `err 'full'`. صاحبة الحفلة تقدر تدخل بعدهم.
  - `resume keeps same id and n, wrong key refused`.
  - `move clamps to hall bounds`: `[99, -99, 0, 0]` بعد ثانية ← الموضع `[31, -47]`.
  - `move rejects teleport`: نقل 30م خلال 0.5ث ← الموضع ما يتغير.
  - `move ignores flood`: رسالتين يفصلهم 10 مللي ثانية ← الثانية تُتجاهل.
  - `move rejects non-numbers`: `['a', null, 0, 0]` ← `ok: false`.
  - `takeDelta returns only changed players once`: لاعبين، واحد يتحرك ← الاستدعاء الأول فيه عنصر واحد، والثاني `[]`.
  - `unknown room`: كل الدوال مع `code` غير موجود ← `err 'nocode'`.
- [ ] **الخطوة 2: تشغيل الاختبارات والتأكد إنها تفشل.** الأمر: `node --test backend/party/`. المتوقع: FAIL (الملف غير موجود).
- [ ] **الخطوة 3: كتابة `party-rooms.js`** بأسلوب CommonJS و`'use strict'` وتعليقات عربية مثل `station-server.js`. مكان البداية لكل لاعب يكون نقطة عشوائية في منطقة المدخل: `x ∈ [-8, 8]` و`z ∈ [38, 44]`.
- [ ] **الخطوة 4: تشغيل الاختبارات.** `node --test backend/party/`. المتوقع: كلها PASS.
- [ ] **الخطوة 5: Commit.** `feat(party): room manager with roles, limits and movement validation`

### المهمة 2: خادم WebSocket للحفلة + الربط + مفتاح الإيقاف

**الملفات:**
- إنشاء: `backend/party/party-server.js`
- تعديل: `backend/websocket/ws-server.js` (إضافة مسار `/ws/party` بجانب `/ws/station`)
- تعديل: `backend/config.js` (`partyEnabled`)
- اختبار: `backend/party/party-server.test.js`

**الواجهات:**
- يستهلك: `createRoomManager` من المهمة 1، و`frame` و`handshake` من `backend/websocket/`، و`auth-service.validateSession`.
- ينتج: `handleUpgrade(req, socket)` و`_mgr` (للاختبار) و`_setEnabled(bool)` (للاختبار).
- البروتوكول (JSON، وكل رسالة فيها `t`):
  - من العميل:
    - `host {girlName}` أو `host {code, token}` ← يرد `hosted {code, token, girlKey}`
    - `join {code, name, auth?, girlKey?}` ← يرد `welcome {id, key, n, role, kind}` ثم `all {d}`
    - `resume {code, id, key}` ← نفس رد `join`
    - `peek {code}` ← يرد `room {...}`
    - `mv {p: [x, z, ry, a]}`
    - `ping {k}` ← يرد `pong {k, now}`
  - من الخادم:
    - `room {room}` لما تتغير قائمة اللاعبين، وتنرسل للكل.
    - `s {now, d}` دلتا الحركة **كل 125 مللي ثانية** (8/ث)، وما تنرسل إذا `d` فاضي.
    - `all {d}`: الحالة كاملة.
    - `err {err}`: الأخطاء هي أخطاء المهمة 1، وفوقها `'disabled'` و`'bad'`.
    - `closed`.
- الدلتا تتحول لـ JSON **مرة وحدة** وتنرسل لكل اتصالات الغرفة.
- المذيع يقدر يكون شاشة عرض بس (بدون لاعب). الشاشة تشترك بـ `peek` وتستقبل `s` و`all`.
- الغرفة تنقفل إذا ما فيها أي اتصال لمدة 30 دقيقة.

- [ ] **الخطوة 1: كتابة الاختبارات اللي تفشل.** الاختبارات تشغّل `http.createServer` على منفذ عشوائي، وتربطه بـ `attachWebSocketServer` من `ws-server.js`، وتتصل بـ `WebSocket` المدمج في Node 22:
  - `disabled by default refuses host`: `_setEnabled(false)`، ثم `host` ← `err 'disabled'`.
  - `host → join → both receive room roster with the guest`.
  - `movement reaches other client within 300ms`: ضيفين، الأول يرسل `mv`، والثاني يستقبل `s` فيه `n` حق الأول.
  - `garbage message does not crash server`: إرسال `'{bad json'` ثم `{t: 'join'}` بدون حقول ثم `{t: 'mv', p: 'x'}`، وبعدها `ping` ← يوصل `pong`.
  - `reconnect with resume restores same n`.
- [ ] **الخطوة 2: تشغيل الاختبارات والتأكد إنها تفشل.** `node --test backend/party/`
- [ ] **الخطوة 3: كتابة `party-server.js`.** نفس أسلوب `station-server.js` (`handleUpgrade`، وتفكيك الإطارات، و`MAX_MSG = 4 * 1024`، و`try/catch` حول `onMessage` وحول كل دورة تحديث). مؤقت `setInterval(…, 125).unref()` يشتغل بس إذا فيه غرف. تعديل `ws-server.js`: سطر `if (pathname === '/ws/party')` بنفس شكل المسارات الموجودة، والتحقق من `config.partyEnabled` يكون داخل `party-server`.
- [ ] **الخطوة 4: تشغيل الاختبارات.** `node --test backend/party/`. المتوقع: كلها PASS. وبعدها `cd backend && timeout 5 node server.js` ← يشتغل بدون أخطاء.
- [ ] **الخطوة 5: Commit.** `feat(party): websocket server on /ws/party behind PARTY_ENABLED`

### المهمة 3: اتصال الواجهة + صفحة المذيع (غرفة وباركودين وقائمة اللاعبين)

**الملفات:**
- إنشاء: `games/birthday-party/party-net.js` (ES module)
- إنشاء: `games/birthday-party/play.html` (نقل محتوى `index.html` الحالي له. صفحة المشهد للكل)
- تعديل: `games/birthday-party/index.html` (تصير صفحة المذيع)

**الواجهات:**
- ينتج: `connect({ onMessage, onOpen, onStatus }) → { send(obj), close() }`. نسخة ES من `games/intruder/station-net.js`:
  - إعادة الاتصال بـ backoff.
  - `ping` كل 15 ثانية.
  - `?ws=` يغيّر عنوان السيرفر.
  - `localhost` يتصل بـ `ws://<host>:8787/ws/party`.
- ينتج: `serverNow()`، وهو وقت السيرفر محسوب من `pong`/`s` بنفس منطق `noteServerNow`.
- ينتج مفاتيح التخزين المحلي:
  - `'party-host'` ← `{code, token}`
  - `'party-me'` ← `{code, id, key}`
- صفحة المذيع:
  - حقل «اسم صاحبة الحفلة» (صف واحد: العنوان يمين والحقل يسار، حسب قواعد CLAUDE.md) وزر «إنشاء الحفلة».
  - بعدها تعرض كود الغرفة وباركودين:
    - الضيوف: `join.html?code=XXXX`
    - صاحبة الحفلة: `join.html?code=XXXX&g=<girlKey>`
  - قائمة اللاعبين، والمتصل عليه نقطة خضراء.
  - زرين: «شاشة عرض» يفتح `play.html?code=XXXX&view=1`، و«دخول كمشارك» يفتح `join.html?code=XXXX&host=1`.
  - الرجوع بعد التحديث يصير بـ `'party-host'`.
- `play.html` بدون `code` يبقى يعرض القاعة التجريبية مثل الحين، عشان ما ينكسر شي.

- [ ] **الخطوة 1: كتابة `party-net.js`** وتأكيد إنه يتحمّل بدون أخطاء:
  - أمر التحقق: `node --input-type=module -e "import('./games/birthday-party/party-net.js').then(m => console.log(typeof m.connect))"` (من جذر المستودع، مع `globalThis.location` وهمي داخل `-e`).
  - المتوقع: `function`.
- [ ] **الخطوة 2: نقل المشهد لـ `play.html`، وكتابة صفحة المذيع في `index.html`.**
- [ ] **الخطوة 3: التحقق بـ Playwright** على السيرفر المحلي (`PARTY_ENABLED=1 node backend/server.js` و`python3 -m http.server`):
  - إنشاء غرفة ← يظهر كود من 4 أرقام وصورتين باركود (`img[src^="data:image"]` عددها 2).
  - تحديث الصفحة ← نفس الكود.
  - إيقاف السيرفر ← تظهر «جاري إعادة الاتصال».
  - تشغيله من جديد ← تظهر رسالة «انتهت الحفلة، أنشئ واحدة جديدة» (لأن الغرفة راحت).
- [ ] **الخطوة 4: Commit.** `feat(party): host page with room code and QR codes`

### المهمة 4: صفحة دخول الجوال (ضيف سريع أو مسجّل، وصاحبة الحفلة)

**الملفات:**
- إنشاء: `games/birthday-party/join.html`

**الواجهات:**
- يستهلك: `connect` من المهمة 3، و`window.AGPAuth` من `auth/auth-client.js` (الـ token يُقرأ بنفس الطريقة اللي يقرأ فيها `getToken()` داخل `auth-client.js`).
- السلوك:
  - **بدون `g`:** خيارين:
    - «دخول بحسابي»: يظهر إذا فيه جلسة. وإذا ما فيه جلسة، يحوّل لـ `../../login.html?next=<الرابط الحالي>`.
    - «دخول باسمي فقط»: حقل اسم.
  - **مع `g`:** يطلب الاسم بس، ويرسل `join` ومعه `girlKey`.
  - بعد `welcome`: يحفظ `'party-me'`، ويحوّل لـ `play.html?code=XXXX`.
  - إذا فيه `'party-me'` لنفس الغرفة: يرسل `resume` على طول، ويحوّل.
  - الأخطاء تطلع رسائل عربية واضحة:
    - `full`: «الحفلة مكتملة (100 ضيف)»
    - `girl-taken`: «صاحبة الحفلة داخلة من جهاز ثاني»
    - `nocode`: «الحفلة غير موجودة أو انتهت»
    - `disabled`: «الحفلات متوقفة حالياً»

- [ ] **الخطوة 1: كتابة `join.html`.** المقاس للجوال 390px أولاً، والألوان من هوية القاعة.
- [ ] **الخطوة 2: التحقق بـ Playwright:**
  - دخول ضيف سريع ← يتحوّل لـ `play.html`، ويظهر في قائمة المذيع.
  - دخول صاحبة الحفلة من رابط `g` ← دورها `girl` في القائمة.
  - صاحبة حفلة ثانية ← تطلع رسالة «صاحبة الحفلة داخلة من جهاز ثاني».
  - تحديث `join.html` بعد الدخول ← يرجع لنفس `n`.
  - التصوير على عرض 390px.
- [ ] **الخطوة 3: Commit.** `feat(party): phone join page (quick, member, birthday girl)`

### المهمة 5: الشخصيات والحركة المشتركة في المشهد

**الملفات:**
- إنشاء: `games/birthday-party/crowd3d.js`
- تعديل: `games/birthday-party/hall3d.js`:
  - تصدير `scene` و`T` و`collide(pos)` (نفس منطق `resolve`/`floorAt` الحالي، كدالة عامة).
  - إضافة وضع كاميرا `'follow'`.
- تعديل: `games/birthday-party/play.html`.

**الواجهات:**
- `mountHall` يرجع فوق اللي يرجعه الحين:
  - `scene`
  - `setFollow(target: {x, z, ry} | null)`: كاميرا من الخلف وفوق بشوي. المسافة 6م، والارتفاع 3.2م، والتنعيم `1 - exp(-dt*6)`.
  - `stepLocal(inp, dt) → {x, z, ry, moving}`: يحرك اللاعب المحلي بنفس التصادم الحالي (`floorAt` و`OBST` والحدود).
- `createCrowd(scene, T) → { sync(roster), apply(delta, serverNow), update(dt, camPos), setLocal(n), dispose() }`:
  - **الشكل:** شخصية كرتونية من أشكال بسيطة: جسم كبسولة، ورأس كرة، وشعر، وفستان أو قميص، ويدين ورجلين. اللون مشتق من `n` بدالة hash ثابتة.
  - **صاحبة الحفلة:** تاج ذهبي وهالة ضوء.
  - **الرسم:** كل جزء `InstancedMesh` واحد للكل. السعة 104: 100 ضيف ومذيع وصاحبة الحفلة وهامش.
  - **الحركة:** مشي بأرجحة اليدين والرجلين وقت `moving`، وتنفس خفيف وقت الوقوف. `a` = 0 وقوف، و1 مشي.
  - **التنعيم:** كل لاعب يتحرك بين آخر موضعين مستلمين بتأخير 150 مللي ثانية (interpolation buffer).
  - **الأسماء:** Sprite فوق أقرب 12 شخصية للكاميرا بس، وتتحدّث كل 0.5 ثانية.
- `play.html`:
  - يقرأ `'party-me'` ويرسل `resume`.
  - كل 125 مللي ثانية يرسل `mv` إذا تغيّر الموضع.
  - اللاعب المحلي يتحرك فوراً بدون ما ينتظر السيرفر.
  - مع `view=1`: يرسل `peek` بس، والكاميرا جولة سينمائية بدون لاعب.

- [ ] **الخطوة 1: كتابة `crowd3d.js`** وتعديل `hall3d.js` و`play.html` حسب الواجهات فوق.
- [ ] **الخطوة 2: التحقق بـ Playwright** بجوالين محاكيين وشاشة عرض:
  - كل واحد يتحرك بالكيبورد ← الثاني يشوفه يتحرك. تصوير الشاشتين.
  - الشاشة اللي بـ `view=1` تشوف الاثنين.
  - ما فيه أخطاء في الـ Console.
  - إغلاق جوال وفتحه ← نفس الشخصية بنفس المكان، وما تتكرر.
- [ ] **الخطوة 3: Commit.** `feat(party): shared 3D characters with interpolation and follow camera`

### المهمة 6: محاكي 100 لاعب + قياس الأداء والشبكة

**الملفات:**
- إنشاء: `backend/party/sim-bots.js`
- تعديل: `docs/CHANGELOG.md` (إصدار `[0.69.0]`)

**الواجهات:**
- الأمر: `node backend/party/sim-bots.js --code XXXX --n 100 --url ws://localhost:8787/ws/party`
  - كل بوت يدخل كضيف سريع باسم «ضيف 1..100»، ويمشي عشوائياً داخل القاعة بسرعة 2-5 م/ث، ويرسل `mv` كل 125 مللي ثانية.
  - البوتات تتجنب المنطقة اللي فوق المنصة.
  - المحاكي يطبع كل 5 ثواني متوسط البايتات اللي يستقبلها البوت الواحد بالثانية.

- [ ] **الخطوة 1: كتابة `sim-bots.js`.**
- [ ] **الخطوة 2: القياس:** 100 بوت، وجوال Playwright واحد بعرض 390px يعرض `play.html`. المطلوب:
  - (أ) استقبال البوت الواحد أقل من **3 كيلوبايت/ث** (يعني الحفلة كلها أقل من 300 كيلوبايت/ث).
  - (ب) الصفحة تكمل بدون أخطاء، وتصوير يبين الحشد.
  - (ج) تسجيل الإطارات بالثانية داخل الصفحة. ملاحظة: الـ swiftshader بطيء، فالرقم للمقارنة بس.
  - إذا ما تحقق (أ): نختصر الدلتا (نحذف `ry` إذا تغيّرها أقل من 0.05، ونرسل للبعيدين بمعدل أقل) ونعيد القياس.
- [ ] **الخطوة 3: CHANGELOG + Commit + Push.** `feat(party): 100-bot simulator and load check`

---

## بعد الدفعة

دمج الفرع في `main` (يتحدث Render تلقائياً)، ثم ضبط متغير البيئة `PARTY_ENABLED=1` على Render وقت التجربة، ثم تجربة حقيقية من جوالات صاحب المشروع.

الدفعات الجاية لها خطط منفصلة: (2) الانتظار وتعديل الشكل، (3) العرض، (4) التهاني والكيكة والصورة.
