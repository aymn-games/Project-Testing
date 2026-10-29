# حفلة عيد الميلاد — الحفلة المجدولة وشاشة البث: خطة التنفيذ

> **للمنفّذين:** مهارة لازمة: superpowers:executing-plans (التنفيذ المباشر، زي الدفعات السابقة). الخطوات بصيغة مربعات (`- [ ]`).

**الهدف:** المذيع يحدد مواعيد الحفلة ومدد المشاهد (ويعدّلها)، والسيرفر يمشّي الحفلة على الساعة. تنتظر صاحبة الحفلة قبل البداية، وتنتهي وقت النهاية من أي مرحلة. الحفلة تنحفظ في SQLite وترجع بعد إعادة التشغيل، وصفحة المذيع تصير شاشة بث للتيك توك، والتحكم في لوحة تنفتح بزر.

**البنية:**
- **السيرفر:** `party-rooms.js` يملك الجدول الزمني والمراحل الجديدة، وكل الانتقالات من `tick()` على `now()`. `party-server.js` يحفظ ويحمّل عبر جدول `party_rooms`، ويطقطق الغرف المجدولة حتى لو ما فيها اتصالات.
- **شاشة البث:** `index.html` بعد الإنشاء يعرض `play.html?code=…&view=1&vk=…&host=1` في iframe بكامل الشاشة. هذا المنطق نفسه منطق شاشة العرض الموجود، فما ننسخه. وفوق الـ iframe طبقة صفحة المذيع: الباركود، وزر ⚙️، ولوحة التحكم. برنامج البث يلتقط النافذة كلها.

**التقنيات:** Node.js (`node:test`)، وbetter-sqlite3، وVanilla JS + Three.js، وPlaywright للتحقق.

**التصميم:** `docs/superpowers/specs/2026-10-29-birthday-party-schedule-design.md` (اقرأه مع الخطة).

## قيود عامة

- **صيغة الجدول:**
  ```
  schedule = {
    startAt,                       // ms UTC
    durationMin = 60,              // 15..240
    openBeforeMin = 15,            // 0..120
    danceMin = 7, writeMin = 3, cakeDanceMin = 5,   // 1..60
    cutTimeoutSec = 60,
    tzOffsetMin                    // دقائق شرق UTC، مثلاً 180 للسعودية
  }
  ```
  - المشتقات: `openAt = startAt - openBeforeMin*60000` و`endAt = startAt + durationMin*60000`.
  - البداية ما تكون بالماضي وقت الإنشاء، وما تكون بعد أكثر من 30 يوم.
- **المراحل:** `closed → lobby → entrance(40ث) → reveal(12ث) → dance(danceMin) → gather(12ث) → wishWrite(writeMin) → wishes(بدون وقت) → cakeWalk(10ث) → cake(cutTimeoutSec ثم قص تلقائي) → celebrate(cakeDanceMin) → photo(16ث) → free(لين endAt) → ended`.
  - من أي مرحلة: `now >= endAt` ← `ended`.
- **`lobby → entrance`:** تلقائي بس لما `now >= startAt` **و** صاحبة الحفلة `online`. أو «بدء الآن» من المذيع (`start`، أو `skip` من `lobby`).
- **الكتابة والعرض:**
  - الكتابة (`addWish`) مسموحة في `wishWrite` بس.
  - `wishes` بدون رسائل ظاهرة تنتقل لـ `cakeWalk` على طول.
- **`ended`:** الغرفة تبقى 2 ساعة بعد `endAt` (ومحفوظة)، ثم تنقفل وتنشال من القاعدة. لو النقاط ما انأكدت (`pointsAcked`)، تبقى محفوظة لين يأكدها المذيع.
- **الرسائل الجديدة:**
  - **المذيع:**
    - `host {girlName, key, schedule}` (إنشاء).
    - `schedule {schedule}` (تعديل) ← `phase` جديدة للكل.
    - `prev {seen}`.
  - **صاحبة الحفلة:** `prev {seen}`.
  - **السيرفر:**
    - `phase` تحمل `sched: {openAt, startAt, endAt, tzOffsetMin}` و`waitGirl: bool`.
    - `join` و`peek` وقت `closed` ترجّع `{t: 'closed', openAt, tzOffsetMin, girlName}`.
    - `join` لصاحبة الحفلة (بـ `girlKey`) مقبول وقت `closed`.
    - `peek` بـ `vk` صحيح مقبول وقت `closed`.
- **قواعد CLAUDE.md:**
  - كل صف إعدادات RTL: العنوان يمين والتحكم يسار (`display:flex; justify-content:space-between`).
  - النقاط من صفحة المذيع (`AGPAuth.reportMatchPoints`) زي ما هي.
- **الإصدار:** CHANGELOG `[0.74.0]`.
- **الاختبارات:** `cd /home/user/Project-Testing && timeout 110 node --test 'backend/party/*.test.js' games/birthday-party/party-net.test.mjs`. **كل commit بعد `fail 0`.**

## نقاط تحتاج انتباه في المراجعة

1. **إعادة تشغيل وسط مرحلة لها وقت:** بعد الرجوع، السيرفر يقفز للمرحلة الصحيحة حسب الساعة.
   - مثال: الرقص خلص وقت ما كان السيرفر طافي ← `gather`، أو `wishWrite`، أو أبعد إذا لازم.
   - المراحل بدون وقت ما تتقفز، إلا `endAt`.
   - **الاختبار:** `restore catches up through elapsed timed phases and stops at wishes` (المهمة 2).
2. **المذيع يقصّر مدة مرحلة شغالة لوقت فات:** تنتقل على طول، ومرة وحدة بس.
   - **الاختبار:** `shortening the running phase below its elapsed time advances once` (المهمة 1).
3. **صاحبة الحفلة تنقطع وترجع حول `startAt`:** ما يبدأ إلا وهي `online`. وانقطاعها بعد `entrance` ما يوقف شي.
   - **الاختبار:** `waits for the girl at startAt, starts when she comes online, not again after she drops` (المهمة 1).
4. **`endAt` وقت مرحلة بدون وقت أو وقت الصورة:** الحفلة تنتهي. والنقاط ما تنرسل إلا إذا الصورة خلصت قبلها.
   - **الاختبار:** `endAt ends the party from wishes; points only after photoDone` (المهمة 1).
5. **ما أحد كتب تهنئة:** العرض ما يعلّق، ويروح للكيكة على طول.
   - **الاختبار:** `wishes with no visible wishes moves straight to cakeWalk` (المهمة 1).

---

### المهمة 1: الجدول والمراحل في `party-rooms.js`

**الملفات:** `backend/party/party-rooms.js`، `backend/party/party-rooms.test.js`.

**الواجهات:**
- **تنتج:**
  - `createRoom({girlName, schedule}) → {ok, code, token, girlKey, viewKey}`
    - تتحقق عبر `cleanSchedule`.
    - الخطأ: `'schedule'`.
    - تبدأ بـ `closed` (أو `lobby` لو `openAt <= now`).
  - `cleanSchedule(s, nowMs, {creating}) → schedule | null`: مُصدَّرة للاختبار.
  - `setSchedule(code, s) → {ok, changed}`
    - يحسب `phaseUntil` للمرحلة الشغالة من `phaseAt` + المدة الجديدة.
    - `startAt` و`openBeforeMin` يتغيّرون بس في `closed` و`lobby`.
  - `tick(code) → {ok, changed}`: ينفّذ `closed→lobby`، و`lobby→entrance` بشرط صاحبة الحفلة، والمراحل الموقّتة، والقص التلقائي، و`endAt→ended`.
  - `prevWish(code, byId, seen) → {ok, cur}`: يرجع للرسالة الظاهرة اللي قبل `wishCur`. الخطأ `'first'` لو ما فيه.
  - `phaseOf(code)`: يضيف `sched: {openAt, startAt, endAt, tzOffsetMin}` و`waitGirl`.
  - `join`:
    - وقت `closed`: الضيوف ← `fail('closed')`، وصاحبة الحفلة مقبولة.
    - وقت `ended`: ← `fail('ended')`.
- **تنشال:** `danceSec` و`wishesSec` من الغرفة ومن `createRoom`.

- [ ] **الخطوة 1: الاختبارات اللي تفشل** (`clockMgr` موجودة):
  - `cleanSchedule: defaults, bounds, start in the past or > 30 days rejected`:
    - `danceMin: 0` ← 1، و`danceMin: 99` ← 60، و`durationMin: 5` ← 15.
    - `startAt` قبل `now` ← `null` عند الإنشاء.
  - `room starts closed; guests refused with closed, girl allowed; lobby opens at openAt`.
  - `waits for the girl at startAt, starts when she comes online, not again after she drops`:
    - عند `startAt` وصاحبة الحفلة غايبة ← `phase === 'lobby'` و`waitGirl === true`.
    - ترجع ← `entrance`.
    - تنقطع وقت `dance` ← المراحل تكمل.
  - `host start skips waiting for the girl`.
  - `timed phases follow the schedule`: `dance` مدتها `danceMin*60000`، و`wishWrite` مدتها `writeMin*60000`، و`celebrate` مدتها `cakeDanceMin*60000`.
  - `addWish only during wishWrite; wishes phase has no until`.
  - `wishes with no visible wishes moves straight to cakeWalk`.
  - `prevWish goes back one visible wish and refuses before the first; seen guards like next`.
  - `cake auto-cuts after cutTimeoutSec`: `cakeCut === true`، و`phase === 'celebrate'`.
  - `free lasts until endAt; endAt ends the party from wishes; points only after photoDone`:
    - في `wishes` ونوصل `endAt` ← `ended`.
    - `photoDone` يبقى `false`.
  - `shortening the running phase below its elapsed time advances once`.
  - `moving startAt later while waiting for the girl re-arms the countdown; ignored after entrance`.
  - `join refused with ended after the party ends`.
- [ ] **الخطوة 2:** شغّل الاختبارات. النتيجة المتوقعة: FAIL للجديدة.
- [ ] **الخطوة 3: التنفيذ:**
  - `PHASES` الجديدة.
  - `durationOf(room, ph)` بدل الحساب الحالي داخل `setPhase`. `cake` مدتها `cutTimeoutSec`، و`free` لين `endAt`.
  - `advance` لـ `cake` يحط `cakeCut`، وبعد `wishWrite` لـ `wishes`:
    - يحط `wishCur = -1`.
    - لو ما فيه رسالة ظاهرة، `advance` مرة ثانية.
  - `tick`، وبالترتيب:
    1. `endAt`
    2. `closed`
    3. `lobby`
    4. `phaseUntil`
  - تحديث `zoneOf` و`place`:
    - `closed` مثل `lobby`.
    - `wishWrite` و`wishes` مثل `dance` (حركة حرة في `nostage`، وصاحبة الحفلة `hall`).
    - `ended` بدون حركة (`move` ← `fail('phase')`).
  - تحديث `AUTO` و`WALK_KIND` (بدون تغيير لـ `gather`، و`wishWrite` مو مشي تلقائي).
  - تحديث التوثيق في رأس الملف.
- [ ] **الخطوة 4:** شغّل الاختبارات. النتيجة: `fail 0` (الاختبارات القديمة اللي تستخدم `danceSec`/`wishesSec` تتحدّث للجدول).
- [ ] **الخطوة 5: Commit.** `feat(party): clock-driven schedule, wait for the girl, timed wish writing, auto-cut, end time`

### المهمة 2: الحفظ والرجوع

**الملفات:** `backend/party/party-rooms.js`، `backend/db/database.js`، `backend/party/party-store.js` (جديد)، `backend/party/party-server.js`، والاختبارات `party-rooms.test.js` و`party-store.test.js` (جديد).

**الواجهات:**
- **تنتج:**
  - `serialize(code) → object`: كل حالة الغرفة إلا المواقع والـ `dirty`/`ver`/`walk`. اللاعب يحفظ `user` كـ `{id, username, tiktok_username, tiktok_verified}`.
  - `restore(obj) → {ok, code}`:
    - كل اللاعبين `online: false` و`offlineSince: now`، ويتحطون بمكان مرحلتهم (`place`).
    - بعدها catch-up: يكرر `tick` لين ما فيه تغيير، بحد 20 مرة.
  - `party-store.js`: `createStore(db) → { save(code, obj), remove(code), loadAll() → [obj] }`. جدول `party_rooms(code TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at INTEGER NOT NULL)`.
  - **السيرفر:**
    - `markSave(code)` (فوري لما تتغيّر المرحلة، وغير كذا مجمّع ≤ 1 كل 2ث).
    - التحميل عند `attach` أول مرة (أو عند تشغيل الوحدة).
    - الحذف بعد `endAt + 2h` إذا `pointsAcked` أو ما فيه نقاط.
- **تستهلك:** `phaseOf().sched` من المهمة 1.

- [ ] **الخطوة 1: الاختبارات اللي تفشل:**
  - `serialize/restore round-trips players, looks, wishes, keys, kicked bans and schedule`: نفس `resume(id, key)` يشتغل بعد `restore` بمدير جديد.
  - `restore catches up through elapsed timed phases and stops at wishes`:
    - الحفظ وقت `dance`.
    - الرجوع بعد `danceMin + 12ث + writeMin + 1ث` ← `wishes`.
  - `restore after endAt lands on ended`.
  - (store، بقاعدة `:memory:`) `save then loadAll returns the object; remove deletes it`.
- [ ] **الخطوة 2:** FAIL.
- [ ] **الخطوة 3: التنفيذ:**
  - `serialize` و`restore` في المدير.
  - `party-store.js` بـ better-sqlite3 (الجدول يتسوى بـ `CREATE TABLE IF NOT EXISTS` في `database.js`، بنفس أسلوب الجداول الموجودة).
  - **في السيرفر:**
    - `tickAll` يطقطق كل غرفة فيها جدول حتى بدون اتصالات.
    - `EMPTY_ROOM_MS` ما ينطبق قبل `endAt + 2h`.
    - الحفظ عند: `host` إنشاء، و`schedule`، و`join`، و`kick`، و`look`، و`wish`، و`hideWish`، و`next`/`prev`، و`cut`، وتغيّر المرحلة، و`pointsDone`.
    - التحميل عند تشغيل السيرفر، مع لوق `Party: restored N rooms`.
  - أي خطأ في القاعدة يتسجل وما يطيّح الحفلة (try/catch).
- [ ] **الخطوة 4:** `fail 0`.
- [ ] **الخطوة 5: Commit.** `feat(party): persist parties in SQLite and resume them by the clock after a restart`

### المهمة 3: بروتوكول السيرفر

**الملفات:** `backend/party/party-server.js`، `backend/party/party-server.test.js`.

**الواجهات:**
- **تنتج** الرسائل اللي في «قيود عامة»، وتوثيقها في رأس الملف.
- **الأخطاء:**
  - `schedule` لغير المذيع ← `host-only`.
  - جدول غلط ← `err schedule`.
  - `join` وقت `closed` ← `{t: 'closed', …}` بدل `err`، والاتصال يبقى مفتوح كمشاهد عشان يوصله `phase` لما تفتح.

- [ ] **الخطوة 1: الاختبارات اللي تفشل:**
  - `host create requires a valid schedule; hosted + phase carry sched`.
  - `guest join while closed gets closed {openAt}; gets phase lobby when it opens`.
  - `girl can join while closed; untrusted peek still hides her`.
  - `schedule edit by host broadcasts the new phase/until; by a guest is refused`.
  - `prev from the girl moves back one wish and broadcasts wishes`.
- [ ] **الخطوة 2:** FAIL.
- [ ] **الخطوة 3: التنفيذ.** المعالجات تستدعي المهمة 1 وتحفظ (المهمة 2). `prev` و`schedule` يدخلون في الرسائل الثقيلة (`heavy`).
- [ ] **الخطوة 4:** `fail 0`.
- [ ] **الخطوة 5: Commit.** `feat(party): schedule/prev messages, closed doors reply`

### المهمة 4: الجوال وشاشة العرض (`join.html`، `play.html`، `hall3d.js`)

**الملفات:** `games/birthday-party/join.html`، `games/birthday-party/play.html`، `games/birthday-party/hall3d.js`.

**الواجهات:**
- **تستهلك:** `phase.sched`، و`phase.waitGirl`، والمراحل الجديدة، ورسالة `closed`، و`prev`.
- **تنتج:**
  - `play.html?view=1&vk=…&host=1`: وضع شاشة البث. مثل `view=1` بس:
    - الكاميرا ما تقترب من غرفة صاحبة الحفلة قبل الافتتاح.
    - الطبقات النصية كبيرة ومناسبة للبث.
  - `hall.celebrate(sec, {strobe: true})`: ألعاب نارية متكررة طول المدة، وأنوار تومض.

- [ ] **الخطوة 1: `join.html`:**
  - رسالة `closed` ← شاشة «الحفلة تفتح الساعة 11:45 م» مع عدّاد. الوقت بالـ `tzOffsetMin` ومعه «بتوقيت السعودية» لو 180، وغيره «UTC+X».
  - لما توصل `phase lobby` يرجع للنموذج لحاله.
  - رسالة `ended` ← «انتهت الحفلة».
  - رسالة `full` ← «الحفلة مكتملة، تابعها من البث 💖».
- [ ] **الخطوة 2: `play.html` (اللاعب):**
  - **`lobby`:**
    - عدّاد «الحفل يبدأ بعد» من `sched.startAt`.
    - `waitGirl` ← «بانتظار صاحبة الحفلة 💖» (ولصاحبة الحفلة: «الكل ينتظرك 💖»).
    - تنبيه «اضغط عشان تشغّل الصوت 🔊» لين أول لمسة.
  - **`wishWrite`:**
    - زر «اكتب تهنئتك» مع عدّاد الكتابة.
    - الشاشة الكبيرة «اكتبوا تهانيكم 💌».
  - **`wishes`:**
    - بطاقة الرسالة.
    - أزرار الحركات للكل.
    - صاحبة الحفلة: «التالي» و«رجوع» (`prev`)، و«رجوع» مخفي على أول رسالة.
  - **`celebrate`:** `hall.celebrate(remaining, {strobe: true})` وموسيقى `cake` بتكرار، وأزرار الحركات.
  - **`photo`:** إشعار «وقت الصورة الجماعية 📸» أول ما تبدأ (الباقي زي ما هو).
  - **`free`:** لافتة «شكراً لحضوركم 💖 استمتعوا بالحفل» 6ث أول المرحلة، وعدّاد «باقي على نهاية الحفل».
  - **`ended`:** شاشة «انتهت الحفلة · شكراً لحضوركم 💖» فوق المشهد، وتوقف الحركة والأزرار، ونافذة الصورة تبقى تقدر تنحفظ.
  - **الموسيقى:** `wishWrite` و`wishes` ← `dance`، و`ended` ← توقف.
- [ ] **الخطوة 3: `hall3d.js`:** خيار `strobe` في `celebrate`: ألعاب نارية كل شوي طول المدة، وإضاءة تشتغل وتطفي. ويحترم `prefers-reduced-motion` (وميض أبطأ).
- [ ] **الخطوة 4: وضع `host=1` في `play.html`:**
  - نفس طبقات شاشة العرض بخط أكبر.
  - `setShot` ما يوجّه لغرفة صاحبة الحفلة وقت `closed` و`lobby`.
- [ ] **الخطوة 5: التحقق بـ Playwright** (صفحة WebGL وحدة بكل مرة):
  - جدول يبدأ بعد دقيقتين بمدد 1 دقيقة، وتنقّل بالساعة الحقيقية أو بـ `skip`.
  - لقطات: `closed` في `join.html`، و`waitGirl`، و`wishWrite`، و`wishes` مع زر «رجوع» لصاحبة الحفلة، و`celebrate`، والشكر، و`ended`.
  - ما فيه أخطاء Console غير ملفات الموسيقى.
- [ ] **الخطوة 6: Commit.** `feat(party): closed doors, waiting for the girl, timed wishes, long cake party, thanks and end screens`

### المهمة 5: صفحة المذيع = إعدادات الجدول + شاشة البث (`index.html`)

**الملفات:** `games/birthday-party/index.html`.

**الواجهات:**
- **تستهلك:**
  - `host {girlName, key, schedule}`، و`schedule {schedule}`، و`prev`، و`phase.sched`/`waitGirl`.
  - `play.html?code&view=1&vk&host=1` (المهمة 4).

- [ ] **الخطوة 1: نموذج الإنشاء:**
  - **الصفوف:** اسم صاحبة الحفلة، والتاريخ (`input type=date`)، وساعة البداية (`type=time`، افتراضي 00:00)، والمدة الكاملة، وفتح الدخول قبل، ومدة الرقص، ومدة الكتابة، ومدة رقص الكيكة، ومهلة القص بالثواني. والافتراضيات من «قيود عامة».
  - **الشكل:** كل صف RTL (العنوان يمين، والعدّاد +/− يسار).
  - **الخط الزمني:** يتحدّث مع كل تغيير بأوقات الساعة. مثال: `11:45 فتح الدخول · 12:00 الافتتاح · 12:01 رقص · …`.
  - **ملاحظة الطول:** لو مجموع الموقّت + ~2 دقيقة ثابتة أكبر من المدة.
  - **التوقيت:** سطر «بتوقيت جهازك: UTC+3».
  - **الإرسال:** `startAt` بالـ ms من التاريخ والساعة المحليين، و`tzOffsetMin = -new Date().getTimezoneOffset()`.
  - **إزالة:** صفوف مدة الرقص والتهاني القديمة.
- [ ] **الخطوة 2: شاشة البث بعد الإنشاء:**
  - **iframe بكامل الشاشة:** `play.html?code=…&view=1&vk=…&host=1`.
  - **باركود الضيوف فوقه بالزاوية:** وقت `closed` و`lobby`، مع رقم الحفلة و«امسح وادخل الحفلة 🎉». ويختفي بعدها إلا إذا شغّله المذيع من اللوحة.
  - **زر ⚙️:**
    - يختفي بعد 3ث بدون حركة ماوس.
    - الاختصار `C` يفتح ويسكّر.
  - **اللوحة:** كل المحتوى الحالي للصفحة، يعني المرحلة والعدّاد، وتخطي، والحضور، والرسائل، والباركودات، والنقاط، والاتصال، ومعه:
    - «بدء الآن» (يطلع وقت `waitGirl`)
    - «تعديل الأوقات»: نفس نموذج الخطوة 1 مع الخط الزمني الجديد، ويرسل `schedule`.
    - «رجوع» بجنب «التالي»
    - «اعرض الباركود على الشاشة»
  - **تأكيد الطرد:** داخل اللوحة («تأكيد الطرد؟» بزرين) بدل `confirm()`.
  - **الصوت:** الـ iframe يطلب «اضغط لتشغيل الصوت 🔊» (من المهمة 4).
- [ ] **الخطوة 3: التحقق بـ Playwright:**
  - الإنشاء بالجدول، ثم الخط الزمني.
  - الـ iframe يحمل.
  - الباركود يطلع في `closed`.
  - ⚙️ يختفي بعد 3ث.
  - `C` تفتح اللوحة.
  - الطرد بالتأكيد الداخلي.
  - «تعديل الأوقات» يغيّر عدّاد المرحلة.
  - «بدء الآن» يبدأ بدون صاحبة الحفلة.
  - بعد التحديث يرجع لنفس الشاشة.
- [ ] **الخطوة 4: Commit.** `feat(party): schedule settings with timeline, host page becomes the stream screen`

### المهمة 6: CHANGELOG + تجربة كاملة + مراجعة + PR

- [ ] **الخطوة 1:** CHANGELOG `[0.74.0]`، مع ملاحظة «لا دمج ولا نشر بين فتح الدخول ونهاية الحفلة».
- [ ] **الخطوة 2: تجربة كاملة بالسيرفر المحلي:**
  - جدول قصير (بداية بعد دقيقتين، والمدة الكاملة 15 دقيقة، والمدد 1 دقيقة)، و12 بوت.
  - صاحبة الحفلة تدخل متأخرة.
  - **إعادة تشغيل السيرفر وسط `dance`:** السيرفر يرجع لنفس الحفلة، والجوال يكمل.
  - توصل `ended` وقت النهاية.
- [ ] **الخطوة 3:** مراجعة مستقلة (opus، حزمة `review-package` من merge-base)، ثم إصلاح الحرج والمهم بالاختبارات.
- [ ] **الخطوة 4:** PR، وما ينْدمج إلا بموافقة صاحب المشروع («ادمج»)، ومو وقت الحفلة.
