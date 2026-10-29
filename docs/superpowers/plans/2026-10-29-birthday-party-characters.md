# حفلة عيد الميلاد — شخصيات بهيكل عظمي وحركة حقيقية: خطة التنفيذ

> **للمنفّذين:** مهارة لازمة: superpowers:executing-plans (التنفيذ المباشر). الخطوات بصيغة مربعات (`- [ ]`).

**الهدف:**
- شخصيات بهيكل عظمي (أسماء Mixamo)، وجلد ناعم.
- حركات مسجّلة (سامبا، وقوف، مشي) وحركات بالكود.
- شعر وفستان بفيزياء.
- كل الحركات للكل، مع أيقونات وزر قفز وتفاعلات وقبعات.
- صاحبة الحفلة مميزة.
- والشخصيات الحالية تبقى كخيار رجوع.

**البنية:**
- **السيرفر:** يوسّع الشكل لـ 8 حقول والحركات لـ 11، ويضيف `react` و`rain`، وإعداد الغرفة `chars` (`rig` أو `classic`).
- **الجوال:** وحدة جديدة `crowd-rig.js` **بنفس واجهة** `createCrowd` اللي في `crowd3d.js`، ومبنية على `rig3d.js` (شخصية وحدة).
- **الاختيار:** `play.html` يختار الوحدة حسب `room.chars`، ويبدّل وقت الحفلة لو تغيّر.
- **الحركات المسجّلة:** تنستخرج مرة وحدة من ملفات GLB لـ JSON صغير.

**التقنيات:** Three.js r160 (SkinnedMesh، AnimationMixer)، وNode `node:test`، وPlaywright وffmpeg للتحقق.

**التصميم:** `docs/superpowers/specs/2026-10-29-birthday-party-characters-design.md`

## قيود عامة

- **أرقام الحركات (`a`):**
  - 0 وقوف · 1 مشي · 2 سامبا · 3 تلويح · 4 تصفيق · 5 لفّة · 6 قفز · 7 قلب · 8 تمايل · 9 رقصة 2 · 10 رقصة 3 · 11 تحية الأميرة (لصاحبة الحفلة بس).
  - `MAX_ANIM = 11`.
  - الضيف (أي نوع) أقصى شي 10.
  - برا الحدود، أو 11 من غير صاحبة الحفلة ← 0.
- **الشكل:** `look = [st, o, s, h, hs, acc, fx, hat]`.
  - الحدود `LOOK_MAX = [1, 11, 4, 7, 5, 5, 3, 4]`.
  - `hs`: 0 قصير · 1 طويل · 2 كعكة · 3 ذيلين · 4 كيرلي قصير · 5 كيرلي طويل.
  - `hat`: 0 بدون · 1 مخروط بنقاط · 2 مخطط · 3 ذهبي لامع · 4 وردي بشراشيب.
  - السريع يغيّر `o` و`hat` بس.
  - صفيف بـ 7 حقول (محفوظ قديم) = `hat -1`.
- **التفاعلات:**
  - الضيوف: `react {e}` و`e ∈ ['heart','smile','laugh','party']`.
  - صاحبة الحفلة زيادة: `'crown','love','sparkle'`.
  - الحد: 2/ث وبحد أقصى 4 دفعة وحدة لكل لاعب، والزيادة تنتجاهل.
  - التوزيع: `reacts {d: [n, eIndex, …]}` مع دورة الإرسال (125ms)، للكل كل دورة (الجوال يقرر يرسم البعيد أو لا).
  - تفاعلات صاحبة الحفلة ما توصل الضيوف ولا المشاهد غير الموثوق وقت `closed`/`lobby`/`entrance`.
- **مطر القلوب:** `rain` من صاحبة الحفلة بس، مرة كل 20ث، والسيرفر يرسل للكل `rain {at}`. على الجوال قلوب تنزل 4ث، ويتجاهلها لو `now - at > 4000`.
- **الإعداد:** `room.chars ∈ {'rig','classic'}`، والافتراضي `'rig'`.
  - `host {…, chars}` وقت الإنشاء، و`chars {v}` من المذيع أي وقت.
  - رسالة `room` تحمل `chars`.
  - ينحفظ مع الغرفة (`serialize`).
- **الأداء:**
  - ≤ 6 أوامر رسم لكل ضيف، وصاحبة الحفلة مستثناة.
  - الفيزياء والحركة كل إطار لأقرب `NEAR = 16`.
  - الباقي: الحركة كل 2 إطار لين 40م، وكل 4 أبعد، وبدون فيزياء.
- **الحجم:** ملفات `anims/*.json` كلها ≤ 400KB: عظام الجسم بس (بدون أصابع وعيون)، و15 إطار/ث، والأرقام مقرّبة لـ 4 خانات.
- **الرخصة:** ملف `games/birthday-party/anims/SOURCE.md` يوضح إن الحركات من أمثلة Three.js r160 (أصلها Mixamo)، وإن صاحب المشروع وافق.
- **قواعد CLAUDE.md:** صفوف الإعدادات RTL، والنقاط زي ما هي.
- **الإصدار:** CHANGELOG `[0.75.0]`.
- **الاختبارات:** `cd /home/user/Project-Testing && timeout 600 node --test 'backend/party/*.test.js' games/birthday-party/*.test.mjs`. **كل commit بعد `fail 0`.**

## نقاط تحتاج انتباه في المراجعة

1. **شكل محفوظ بـ 7 حقول** (جوال قديم `party-look`، أو غرفة محفوظة قبل التحديث): يشتغل والقبعة بدون.
   - **الاختبار:** `7-field look is accepted and hat becomes -1` (المهمة 1).
2. **فرق وضع الراحة بين الحركات المسجّلة وهيكلنا:** لو ما انصلح، الذراعين تلتف.
   - **الاختبار:** `retargeted samba keeps hands above hips and inside 1.2m of the body` (المهمة 3، فحص رقمي بالمتصفح).
3. **المذيع يبدّل الشخصيات وسط الحفلة:** ما يتكرر شي، وما تتسرّب ذاكرة، والمواقع تبقى.
   - **الاختبار:** `switching chars rig→classic→rig keeps the same characters and positions` (المهمة 5، Playwright).
4. **سيل تفاعلات من ضيوف كثير:** الـ pool محدود، وما فيه تعليق.
   - **الاختبار:** `react flood is rate-limited per player` (المهمة 1)، و`200 reactions in one second never exceed the pool` (المهمة 4).
5. **تفاعلات صاحبة الحفلة قبل الافتتاح:** ما تكشف مكانها.
   - **الاختبار:** `girl reactions are hidden from guests before reveal` (المهمة 1).

---

### المهمة 1: السيرفر — الشكل والحركات والتفاعلات والمطر والإعداد

**الملفات:** `backend/party/party-rooms.js`، `backend/party/party-server.js`، والاختبارات `party-rooms.test.js` و`party-server.test.js`.

**الواجهات:**
- **تنتج:**
  - `react(code, id, e) → {ok}`، والأخطاء: `'bad'` و`'flood'` و`'role'`.
  - `takeReacts(code) → [{n, e, girl}]`: يفرّغ الدور.
  - `rain(code, id) → {ok, at}`، والخطأ `'cooldown'`.
  - `setChars(code, v)`.
  - `roster().chars`.
  - `REACTS` (القائمة) مُصدَّرة.
  - رسائل السيرفر: `react` و`rain` و`chars` (الأخيرة للمذيع)، و`reacts` و`rain`.

- [ ] **الخطوة 1: الاختبارات اللي تفشل:**
  - `look has 8 fields: quick keeps outfit color and hat only; hs 4/5 allowed`.
  - `7-field look is accepted and hat becomes -1`.
  - `every guest kind gets anims up to 10; 11 only for the girl`.
  - `react: allowed set by role, rate-limited per player (2/s, burst 4)` (= «react flood is rate-limited per player»).
  - `girl reactions are hidden from guests before reveal`: `takeReacts` يعطي `girl:true`، والسيرفر ما يرسلها للضيوف وقت `lobby`.
  - `rain: girl only, 20s cooldown`.
  - `chars setting defaults to rig, host can switch, roster carries it, serialize keeps it`.
  - (سيرفر) `react reaches other players within 300ms`.
  - (سيرفر) `chars message from host broadcasts room with new chars; guest refused`.
- [ ] **الخطوة 2:** FAIL.
- [ ] **الخطوة 3: التنفيذ:**
  - الثوابت حسب «قيود عامة».
  - `QUICK_ANIM` ينشال.
  - `cleanLook` يقبل 7 أو 8 حقول.
  - دور التفاعلات لكل غرفة، وينفرّغ في `tickAll` مع الدلتا. القريب يحسبه نفس `deltaFor`: النقطة مكان صاحب التفاعل، و`NEAR_R`.
  - `heavy` يشمل `chars` و`rain`. `react` خفيفة، بس لها حدها الخاص.
- [ ] **الخطوة 4:** `fail 0`.
- [ ] **الخطوة 5: Commit.** `feat(party): 8-field looks with hats and curly hair, all moves for all guests, reactions, heart rain, chars setting`

### المهمة 2: استخراج الحركات المسجّلة

**الملفات:**
- `tools/extract-anims.mjs` (جديد): يقرأ GLB بدون Three، من JSON والـ buffer.
- `games/birthday-party/anims/{samba,idle,walk}.json` و`SOURCE.md`.
- `games/birthday-party/anims.test.mjs`.

**الواجهات:**
- **صيغة الملف:**
  ```
  {
    name, duration, fps: 15,
    rest: {bone: [qx, qy, qz, qw]},                       // وضع الراحة في الملف الأصلي
    tracks: {bone: {q: [...flat quats per frame]}, Hips: {p: [...flat xyz], q: [...]}}
  }
  ```
  - أسماء العظام بدون بادئة `mixamorig:`.
  - العظام: `Hips, Spine, Spine1, Spine2, Neck, Head, {Left,Right}{Shoulder,Arm,ForeArm,Hand,UpLeg,Leg,Foot,ToeBase}`.
  - `Hips.p` بالمتر، ومحسوب على طول الهيكل (`hipsHeight`) عشان يتطبّق على أي طول.
- **المصدر:** `Michelle.glb` (`SambaDance`) و`Xbot.glb` (`idle` و`walk`)، من `raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/`.

- [ ] **الخطوة 1: اختبار يفشل** `anims.test.mjs`:
  - كل ملف موجود و≤ 200KB، ومجموعها ≤ 400KB.
  - فيه كل العظام الـ 22، و`fps === 15`.
  - `samba.duration` بين 17 و19.
  - كل quat طوله ≈ 1 (±1e-3).
- [ ] **الخطوة 2:** FAIL (الملفات مو موجودة).
- [ ] **الخطوة 3:** السكربت (تنزيل GLB لمجلد مؤقت وقت التشغيل، مو بالمستودع)، ثم تشغيله، و`SOURCE.md`.
- [ ] **الخطوة 4:** `fail 0`.
- [ ] **الخطوة 5: Commit.** `feat(party): compact mocap clips (samba, idle, walk) extracted from three.js examples`

### المهمة 3: `rig3d.js` — الشخصية الوحدة

**الملفات:**
- `games/birthday-party/rig3d.js` (جديد).
- `games/birthday-party/gown3d.js`: يتعدّل عشان ينربط بعظمة.

**الواجهات:**
- **تنتج:** `export function makeRig({look, role, n}) → rig`، و`rig` فيه:
  - `root: Object3D`
  - `setLook(look)`: يعيد التلوين والتسريحة والقبعة بدون ما يبني الهيكل من جديد.
  - `play(a: number)`: crossfade 0.25ث للحركة رقم `a`، و1 مشي.
  - `setSpeed(mps)`: سرعة المشي تتبع.
  - `update(dt, detail: boolean)`: `detail=false` بدون فيزياء.
  - `bones: {Hips, Head, …}`
  - `dispose()`
- **وتنتج:** `export function loadClips(baseUrl) → Promise<{samba, idle, walk}>` (AnimationClip مصحّح لوضع راحة هيكلنا)، و`export const ANIMS` (أسماء الحركات بالعربي، والأيقونات، والترتيب).
- **وتنتج (gown3d):** `createGown(scene)` تصير تقبل `attachTo(bone)` بدل الموقع اليدوي. `update(girl, dt)` تبقى للكلاسيكي.

- [ ] **الخطوة 1:** الهيكل بوضع T والجلد الواحد. الطول 1.6م، وصاحبة الحفلة ×1.06.
- [ ] **الخطوة 2:** الوجه (يرمش)، والشعر 6 تسريحات (الطويل والذيلين والكيرلي الطويل بسلاسل نوابض، والكيرلي القصير يرتد)، والفستان أو البنطلون، والإكسسوارات، و4 قبعات.
- [ ] **الخطوة 3:** `loadClips`، والتصحيح لوضع الراحة: `q_ours = q_rest_ours · q_rest_src⁻¹ · q_anim`.
- [ ] **الخطوة 4:** الحركات بالكود كـ `AnimationClip` مكتوبة بإطارات: 3 و4 و5 و6 و7 و8 و9 و10 و11.
- [ ] **الخطوة 5:** صاحبة الحفلة:
  - التاج الكبير اللامع بجواهر ولمعات وشرار.
  - الفستان الفخم على عظمة `Hips`، والطبقات تتأرجح.
- [ ] **الخطوة 6: التحقق** (صفحة اختبار بالمتصفح مثل التجربة، وفيديوهات بـ ffmpeg):
  - فحص رقمي `retargeted samba keeps hands above hips and inside 1.2m of the body`: كل 0.5ث من السامبا، اليدين داخل 1.2م من `Hips`، وما تنزل تحت الأرض.
  - فيديو لكل حركة، وصورة للتسريحات والقبعات.
  - ما فيه أخطاء Console.
- [ ] **الخطوة 7: Commit.** `feat(party): skeleton character with mocap and coded moves, physics hair and dress, hats, crown`

### المهمة 4: `crowd-rig.js` — الجمهور بنفس واجهة `createCrowd`

**الملفات:** `games/birthday-party/crowd-rig.js` (جديد).

**الواجهات:**
- **تستهلك:** `makeRig` و`loadClips` و`ANIMS` (المهمة 3).
- **تنتج:**
  - `export function createCrowd(scene, {floorAt, clipsBase})` بنفس الدوال والأسماء اللي في `crowd3d.js`: `sync`، `apply`، `update`، `setLocal`، `setLocalLook`، `setAutoPaths`، `posOf`، `prewarm`، `dispose`، `debug`، `count`.
  - وزيادة: `react(n, e)`، و`rain(at)`، و`setGirlFx(on)` (السبوت لايت والأثر).
- **من `crowd3d.js`:** منطق التنقّل بين العيّنات والمشي التلقائي والأسماء ينقل لملف مشترك `crowd-common.js`، عشان الوحدتين تستخدمه بدون نسخ.

- [ ] **الخطوة 1:** `crowd-common.js` + `crowd3d.js` يستخدمه. **بدون تغيير بالسلوك**، والتحقق بإعادة تشغيل لقطات guest/girl القديمة.
- [ ] **الخطوة 2:** `crowd-rig.js`:
  - pool من الـ rigs.
  - الحركة من `a`، والمشي تلقائي من السرعة.
  - مستويات القرب.
  - pool التفاعلات: 64 Sprite لكل نوع، تطلع فوق الراس وتطير 1.6ث.
  - مطر القلوب.
  - السبوت لايت والأثر اللامع لصاحبة الحفلة.
  - `prewarm`.
- [ ] **الخطوة 3: التحقق:**
  - `200 reactions in one second never exceed the pool`: فحص رقمي، العدد الحي ≤ 64 لكل نوع.
  - حفلة 40 شخصية (بوتات) والإطار مستقر بالمتصفح.
  - فيديو ولقطات.
- [ ] **الخطوة 4: Commit.** `feat(party): rigged crowd with LOD, reactions, heart rain and the girl's spotlight`

### المهمة 5: الجوال وصفحة المذيع

**الملفات:** `games/birthday-party/play.html`، `games/birthday-party/index.html`.

**الواجهات:**
- **تستهلك:** رسائل المهمة 1 (`room.chars`، `reacts`، `rain`)، و`crowd-rig.js`، و`ANIMS`.

- [ ] **الخطوة 1: `play.html`:**
  - يختار الوحدة حسب `room.chars`، ويبدّل وقت الحفلة: `dispose` ثم `create`، ثم `sync` و`apply` من آخر حالة.
  - شريط **أيقونات دائرية** للحركات: كل الضيوف 2-10، وصاحبة الحفلة 2-11. يتمرر، والضغط المطوّل يطلّع اسم الحركة.
  - **زر قفز** ⤴️ بجنب العصا.
  - **شريط تفاعلات** ❤️ 😊 😂 🎉، ولصاحبة الحفلة 👑 💖 ✨ وزر «مطر القلوب 💕» مع عدّاد الانتظار.
  - الأيقونات تطلع في الصالة بعد.
  - ركن «✨ شكلي»:
    - صف «قبعة الحفلة» (مفتوح للسريع).
    - صف «التسريحة» فيه الكيرلي القصير والطويل.
    - صاحبة الحفلة ما يطلع لها صف القبعة.
- [ ] **الخطوة 2: `index.html`:** صف «الشخصيات: الجديدة / الكلاسيكية» (RTL) في الإنشاء واللوحة، يرسل `chars`.
- [ ] **الخطوة 3: التحقق بـ Playwright:**
  - `switching chars rig→classic→rig keeps the same characters and positions`.
  - الأيقونات وزر القفز والتفاعلات توصل لجوال ثاني.
  - مطر القلوب.
  - القبعة للسريع.
  - لقطات لكل مرحلة (مثل صفحة «شاشة الضيف»)، وما فيه أخطاء Console.
- [ ] **الخطوة 4: Commit.** `feat(party): move icons, jump, reactions and heart rain on the phone; chars switch for the host`

### المهمة 6: CHANGELOG + مراجعة + PR

- [ ] **الخطوة 1:** CHANGELOG `[0.75.0]`.
- [ ] **الخطوة 2:** تحديث صفحة «شاشة الضيف» (artifact) باللقطات الجديدة، وفيديو قصير للحركات.
- [ ] **الخطوة 3:** مراجعة مستقلة (opus، الفرع كامل)، وإصلاح الحرج والمهم بالاختبارات.
- [ ] **الخطوة 4:** PR، وما ينْدمج إلا بموافقة صاحب المشروع («ادمج»)، ومو وقت الحفلة.
