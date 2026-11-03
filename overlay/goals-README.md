# أدوات الهدف للبث (Goal Widgets)

صفحة وحدة **`overlay/goals.html`** تنحط في OBS (أو TikTok LIVE Studio / Streamlabs Desktop /
vMix) كـ **Browser Source**. الخلفية شفافة، والشكل تختاره من الرابط بـ `style`:

| `style` | الشكل | الأهداف | البيانات |
|---|---|---|---|
| `bar` (الافتراضي) | كرت زجاجي فيه شريط تقدّم | هدف واحد | من الرابط، أو StreamElements، أو Streamlabs، أو الويب هوك |
| `heart` | قلب شفاف يتعبّى بالماء | هدف واحد | نفس `bar` |
| `potions` | 3 قوارير سحرية: دائرية، وأسطوانية بغيوم، وقلب بفيونكة | حتى 3 | من الرابط |
| `devil` | قلوب زجاج بجناحين وقرنين وذيل | حتى 3 | من الرابط |

| الملف | وظيفته |
|---|---|
| `goals.html` | الصفحة نفسها: كل الأشكال والكود في ملف واحد |
| `goals-server.js` | **اختياري**: سيرفر صغير (Node.js بدون أي حزم) يستقبل الويب هوك/API ويدفعه لـ `bar`/`heart` |

> الأداة مستقلة عن محرر «شاشات البث» (`overlay/index.html`) وعن نواة المنصة. ما تحتاج
> حساب بالموقع، وتشتغل على أي استضافة.

---

## 1) تجربة سريعة (دقيقة وحدة)

افتح `goals.html` في المتصفح مع واحد من هالروابط:

```
goals.html?type=follower&goal=100&demo=1
goals.html?style=heart&type=follower&goal=100&demo=1
goals.html?style=potions&current1=55&target1=100&current2=30&target2=50&current3=80&target3=100
goals.html?style=devil&current1=80&target1=100&current2=5&target2=10
```

`demo=1` (لـ `bar` و`heart`) يضيف أرقام عشوائية كل ثانيتين ونص عشان تشوف الحركة. شيله بالبث الحقيقي.

---

## 2) إعدادات `bar` و`heart` (كلها من الرابط)

مثال: `goals.html?type=tip&goal=500&title=هدف الدعم&theme=neon&provider=streamelements&token=...`

| المتغير | الافتراضي | الشرح |
|---|---|---|
| `type` | `follower` | نوع الهدف: `follower` متابعين · `subscriber` اشتراكات · `tip` دعم مادي · `cheer` بتس · `custom` أي حدث |
| `goal` | `100` | الرقم المستهدف |
| `start` | `0` | القيمة اللي تبدأ منها (مثلاً عندك 640 متابع الحين) |
| `title` | حسب النوع | عنوان الهدف |
| `prefix` | `$` للدعم | رمز قبل الرقم (`$` أو `SAR ` أو فاضي) |
| `unit` | حسب النوع | كلمة بعد الرقم (`متابع`، `subs`…) |
| `provider` | `none` | مصدر البيانات: `streamelements` · `streamlabs` · `server` · `none` |
| `token` | — | توكن المزوّد (شرحه تحت) |
| `server` | نفس الموقع | رابط `goals-server.js` لو كان على دومين ثاني، مثل `https://goal.example.com` |
| `key` | `default` | اسم الهدف، عشان تشغّل أكثر من هدف بنفس الوقت |
| `style` | `bar` | شكل الأداة: `bar` شريط · `heart` قلب يتعبّى بالماء (3-أ) · `potions` قوارير (3-ب) · `devil` قلوب بأجنحة (3-ج) |
| `water` | وردي/أحمر | لون الماء بالقلب بدون `#`، مثل `water=3fa9f5`. وللتدرّج: `water1=` (فوق) و`water2=` (تحت) |
| `heartStroke` / `heartEmpty` | — | لون حدود القلب / لون داخل القلب الفاضي |
| `theme` | زجاجي | `neon` · `light` · `minimal` |
| `dir` | `rtl` | `ltr` للإنجليزي |
| `accent` `fill1` `fill2` `text` `track` `bg` | — | ألوان سريعة بدون `#`، مثل `fill1=ff3d7f&fill2=ffb347` |
| `width` / `scale` | `520` / `1` | عرض الكرت بالبكسل / تكبير الأداة كلها |
| `done` | `اكتمل الهدف 🎉` | النص اللي يطلع لما يكتمل الهدف |
| `leftLabel` / `lastLabel` | `المتبقي:` / `آخر دعم:` | نصوص السطر السفلي |
| `foot` | `1` | `0` يخفي السطر السفلي |
| `persist` | `1` | يحفظ الرقم بالمتصفح عشان ما يضيع لو OBS أعاد تحميل الصفحة |
| `reset` | — | `reset=1` يصفّر الرقم المحفوظ. افتحه مرة وحدة بعدين شيله |
| `test` | `0` | `1` يحسب أحداث التجربة (Emulate) من لوحة StreamElements |
| `eio` | `3` | إصدار بروتوكول الـ socket. جرّب `4` لو الاتصال ما يشتغل |
| `debug` | `0` | `1` يطلع نقطة حالة الاتصال (🟢 متصل · 🟠 يتصل · 🔴 خطأ) والتفاصيل بالـ Console |
| `demo` | `0` | `1` أرقام تجريبية |

> لو غيّرت `start` بالرابط، الأداة تبدأ من الرقم الجديد وتتجاهل الرقم المحفوظ القديم.

---

## 3) تخصيص الشكل (CSS Variables)

كل الشكل في متغيرات CSS بأول `goals.html` (أول `<style>`):

```css
:root {
    --goal-width: 520px;
    --goal-radius: 20px;
    --goal-bg: linear-gradient(135deg, rgba(20,16,38,.78), rgba(32,22,58,.62));
    --goal-border: rgba(255,255,255,.14);
    --goal-text: #ffffff;
    --goal-muted: rgba(255,255,255,.68);
    --goal-accent: #8b5cf6;
    --goal-fill-start: #8b5cf6;
    --goal-fill-end: #ec4899;
    --goal-track: rgba(255,255,255,.12);
    --goal-bar-height: 26px;
    --goal-done-start: #22c55e;   /* لون الشريط لما يكتمل الهدف */
    --goal-done-end: #a3e635;
    /* والمزيد في الملف… */
}
```

عندك ثلاث طرق للتعديل، من الأسهل:

1. **من الرابط:** `?fill1=ff3d7f&fill2=ffb347&theme=neon`
2. **من OBS بدون لمس الملفات:** خصائص المصدر ← خانة **Custom CSS**. امسح الموجود فيها
   والصق تعديلاتك:
   ```css
   :root { --goal-fill-start: #00c6ff; --goal-fill-end: #0072ff; --goal-width: 600px; }
   ```
3. **من الملف:** عدّل المتغيرات بأول `goals.html` مباشرة، والتعديل يطبق على كل مكان تستخدم فيه الأداة.

الخلفية دايماً شفافة، فالأداة تركب فوق البث مباشرة.

### 3-أ) شكل القلب 💖

أضف `style=heart` للرابط، والقلب يتعبّى بماء متموّج حسب نسبة الهدف. فيه فقاعات
تطلع داخل الماء، ونبضة مع كل دعم، والقلب ينبض باستمرار لما يكتمل الهدف.

```
goals.html?style=heart&type=follower&goal=1000&water=3fa9f5
goals.html?style=heart&type=tip&goal=500&water1=7cff6b&water2=12a150
```

ومتغيراته في `goals.html` (أو خانة Custom CSS في OBS):

```css
:root {
    --goal-water-start: #ff6b8b;   /* لون الماء فوق */
    --goal-water-end: #d6164a;     /* لون الماء تحت */
    --goal-heart-size: 230px;      /* حجم القلب */
    --goal-heart-stroke: rgba(255,255,255,.85);  /* حدود القلب */
    --goal-heart-empty: rgba(255,255,255,.08);   /* داخل القلب الفاضي */
    --goal-wave-speed: 2.6s;       /* سرعة الموج (أصغر = أسرع) */
}
```

القلب يظهر بدون أي كرت أو خلفية وراه، فيركب على البث مباشرة، والنصوص فيها ظل عشان تنقرأ فوق أي خلفية. التوهّج حول القلب ياخذ لون الماء تلقائياً. أبعاد OBS المناسبة للقلب:
**Width = 320** و **Height = 360**.

### 3-ب) القوارير السحرية (`style=potions`)

ثلاث قوارير جنب بعض، وكل وحدة هدف لحاله. السائل يرتفع بسلاسة لنسبته، ويتموّج، وفيه
فقاعات. والقارورة اللي يكتمل هدفها تنبض.

```
goals.html?style=potions&current1=55&target1=100&current2=12&target2=30&current3=40&target3=100
```

| المعامل (الرقم 1 أو 2 أو 3) | الافتراضي | الشرح |
|---|---|---|
| `current1` / `target1` | `0` / `100` | القيمة الحالية والهدف |
| `label1` | Cheer / Sub / Donation Goal | الاسم تحت القارورة |
| `shape1` | `round` / `vial` / `heart` | الشكل: دائرية مائلة بفراولة وورد · أسطوانية بغيوم · قلب بفيونكة |
| `color1` | وردي / أزرق / بنفسجي | لون السائل بدون `#` |
| `glow1` | — | لون توهج النيون حول الزجاج |
| `display1` | `count` / `percent` / `fraction` | `count` يعرض `55` · `percent` يعرض `55%` · `fraction` يعرض `$55 • $100` · `both` يعرض الكل. و`display=` بدون رقم يطبق على كل القوارير |
| `prefix1` | `$` للثالثة | الرمز قبل الرقم |
| `count` | `3` | عدد القوارير المعروضة |
| `size` / `gap` | `220` / `34` | عرض القارورة والمسافة بينها بالبكسل |

### 3-ج) القلوب بالأجنحة (`style=devil`)

قلب زجاجي بجناحين خفاش يرفرفون، وقرنين، وذيل يتمايل. يتعبّى بسائل فيه لمعات وقلوب صغيرة،
ولما يكتمل الهدف ينبض وتطلع قلوب طايرة فوقه.

```
goals.html?style=devil&current1=80&target1=100&current2=5&target2=10
```

| المعامل (الرقم 1 أو 2 أو 3) | الافتراضي | الشرح |
|---|---|---|
| `current1` / `target1` | `0` / `100` (الثاني `10`) | القيمة الحالية والهدف |
| `label1` | Donation / Follow / Sub Goal | الاسم تحت القلب |
| `color1` / `glow1` / `wing1` | بنفسجي / أحمر / وردي | لون السائل / التوهج / الجناحين والقرنين والذيل |
| `prefix1` | `$` للأول | الرمز قبل الرقم |
| `display1` | `fraction` | `fraction` يعرض `$80 · $100` · `count` يعرض `80` · `percent` يعرض `80%` |
| `count` | `2` | عدد القلوب المعروضة |
| `only` | — | `only=2` يعرض القلب الثاني بس |
| `size` / `gap` | `240` / `80` | عرض القلب والمسافة بالبكسل |

**كل قارورة أو قلب في مصدر مستقل:**
- **القلوب:** `goals.html?style=devil&only=2&current2=5&target2=10`
- **القوارير:** `count=1` مع `shape1` وألوانها، مثل:
  `goals.html?style=potions&count=1&shape1=vial&label1=Sub Goal&color1=4d7bff&glow1=4fd8ff&display1=percent&current1=55`

> `potions` و`devil` يتحدثون من الرابط. لما يتغيّر الرقم، عدّل الرابط في OBS والسائل
> يتحرك للنسبة الجديدة.

---

## 4) ربط البيانات (`bar` و`heart`)

### أ) StreamElements (اتصال مباشر)

1. ادخل [streamelements.com](https://streamelements.com) ← **Account** (من صورتك فوق) ← **Channels**.
2. اضغط **Show secrets** وانسخ **JWT Token**.
3. الرابط:
   ```
   goals.html?provider=streamelements&token=<JWT>&type=tip&goal=500
   ```
- المتابعات والاشتراكات والدعم والبتس كلها تنحسب تلقائياً حسب `type`.
- عشان تختبر بزر **Emulate** في لوحة StreamElements، أضف `&test=1` مؤقتاً.

### ب) Streamlabs (اتصال مباشر)

1. ادخل [streamlabs.com](https://streamlabs.com/dashboard) ← **Settings** ← **API Settings** ← **API Tokens**.
2. انسخ **Your Socket API Token**.
3. الرابط:
   ```
   goals.html?provider=streamlabs&token=<SOCKET_TOKEN>&type=follower&goal=1000&start=640
   ```
- الأنواع: `donation` و`superchat` تنحسب للدعم (`tip`)، و`follow` للمتابعين، و`subscription` و`resub` للاشتراكات، و`bits` للبتس.
- تنبيهات «Test» من لوحة Streamlabs تنحسب كأنها حقيقية. صفّر بعد التجربة بـ `&reset=1`.

> ⚠️ **التوكن سرّي.** لا تعرض رابط المصدر على البث ولا ترسله لأحد. أي أحد معه
> الـ JWT يقدر يتحكم بحسابك في StreamElements.

### ج) ويب هوك / API عبر `goals-server.js`

StreamElements وStreamlabs يوصلون تنبيهاتهم الحية عبر socket، وهذا اللي يغطيه
(أ) و(ب). أما `goals-server.js` فهو للأدوات اللي ترسل **طلب HTTP**، مثل Streamer.bot وZapier
وأوامر بوت الشات وTipeeeStream وKo-fi وغيرها، أو لو تبي تتحكم بالرقم يدوياً.

**التشغيل:**

```bash
GOAL_SECRET=اكتب-كلمة-سر-طويلة node overlay/goals-server.js
# الأداة: http://localhost:3030/goals.html?provider=server&type=tip&goal=500
```

(بويندوز PowerShell: `$env:GOAL_SECRET="..."; node overlay/goals-server.js`)

**الطلبات** (`:key` نفس قيمة `key` بالرابط، والافتراضي `default`):

```bash
# إضافة مبلغ
curl -X POST http://localhost:3030/api/goal/default \
  -H "X-Goal-Secret: كلمة-السر" -H "Content-Type: application/json" \
  -d '{"action":"add","amount":10,"name":"سارة"}'

# تعيين الرقم / تصفير / ضبط الهدف والعنوان والنوع
-d '{"action":"set","value":250}'
-d '{"action":"reset"}'
-d '{"action":"config","goal":1000,"title":"هدف الدعم","type":"tip"}'

# حدث بصيغة StreamElements أو Streamlabs كما هو (يتفلتر حسب type المحفوظ)
-d '{"provider":"streamlabs","event":{"type":"donation","message":[{"amount":"5","name":"Ali"}]}}'
-d '{"provider":"streamelements","event":{"type":"tip","data":{"amount":5,"username":"Ali"}}}'
```

**طلبات GET سريعة** (لأوامر الشات وStreamer.bot):

```
http://localhost:3030/api/goal/default/add?amount=1&name=Ali&secret=كلمة-السر
http://localhost:3030/api/goal/default/set?value=120&secret=كلمة-السر
http://localhost:3030/api/goal/default/reset?secret=كلمة-السر
```

يرجع رد نصي قصير مثل `هدف الدعم: 120 / 500`، فتقدر تحطه بأمر شات:
- StreamElements: `${customapi.https://goal.example.com/api/goal/default/add?amount=1&secret=...}`
- Nightbot: `$(urlfetch https://goal.example.com/api/goal/default/add?amount=1&secret=...)`

(خلّ هالأوامر للمشرفين بس، لأن الرابط فيه كلمة السر.)

- كلمة السر تنقبل بثلاث طرق: هيدر `X-Goal-Secret`، أو `Authorization: Bearer ...`، أو `?secret=`.
- بدون `GOAL_SECRET`، التعديل مسموح من نفس الجهاز بس (`localhost`).
- الأرقام تنحفظ في `overlay/data/goals.json`، فما تضيع لو أعدت تشغيل السيرفر.
- `GET /api/goal/default` يرجع الحالة الحالية JSON.

---

## 5) الاستضافة

### محلياً بدون سيرفر (الأسهل لـ StreamElements / Streamlabs)

ما يحتاج أي شي: في OBS اختر **Local file** وحدد `goals.html`. المشكلة إن خانة الملف
المحلي ما تقبل `?type=...`، فعندك حلّين:
- افتح الملف بالمتصفح بالرابط اللي تبيه وانسخ العنوان كامل 
  (`file:///C:/.../goals.html?style=...`) والصقه في خانة **URL** بعد ما تشيل علامة Local file، أو
- استخدم السيرفر المحلي تحت.

### سيرفر محلي على جهازك

```bash
node overlay/goals-server.js         # يحتاج Node.js 18 أو أحدث
# أو، لو ما تحتاج ويب هوك وتبي تعرض الملفات بس:
cd overlay && python -m http.server 8080   # بعدها http://localhost:8080/goals.html?...
```

### رفعها على استضافة

- **بدون ويب هوك** (كل الأشكال، وStreamElements / Streamlabs): ملف واحد بس `goals.html`.
  هو موجود بمجلد `overlay/` بالموقع، فبعد دمج الفرع ونشر الموقع يصير رابطه
  `https://aymngames.online/overlay/goals.html?...` (نفس مكان `overlay/live.html`). أو ارفعه لأي استضافة ملفات ثابتة،
  مثل GitHub Pages أو Netlify أو Cloudflare Pages.
- **مع ويب هوك (`goals-server.js`)**: يحتاج استضافة تشغّل Node.js، مثل VPS أو Render أو Railway أو Fly.io:
  1. ارفع الملفين `goals.html` و`goals-server.js` بنفس المجلد.
  2. أمر التشغيل: `node goals-server.js`.
  3. متغيرات البيئة: `GOAL_SECRET` (إلزامي)، و`PORT` (أغلب الاستضافات تحدده تلقائياً).
  4. على Render أو أي استضافة ملفاتها مؤقتة، حدد `GOAL_DATA` على قرص دائم (Persistent Disk)
     عشان الأرقام ما تضيع.
  5. لو عندك Nginx قدام السيرفر، طفّ التخزين المؤقت لمسار البث:
     ```nginx
     location /api/goal/ {
         proxy_pass http://127.0.0.1:3030;
         proxy_http_version 1.1;
         proxy_set_header Connection '';
         proxy_buffering off;
         proxy_read_timeout 1h;
     }
     ```
  6. لو الأداة على دومين والسيرفر على دومين ثاني، أضف `&server=https://دومين-السيرفر`
     (CORS مفعّل).

---

## 6) إضافتها في OBS كـ Browser Source

1. في **Sources** اضغط **+** واختر **Browser**، وسمّه مثلاً «هدف البث».
2. **URL**: الصق الرابط كامل بإعداداتك. مثال:
   ```
   https://aymngames.online/overlay/goals.html?provider=streamelements&token=...&type=tip&goal=500&theme=neon
   ```
3. **المقاس** (لو كبّرت `width` أو `scale` أو `size`، زِد الأبعاد بنفس النسبة):

   | `style` | Width × Height |
   |---|---|
   | `bar` | 600 × 180 |
   | `heart` | 320 × 360 |
   | `potions` (3 قوارير) | 860 × 470 · قارورة وحدة: 300 × 450 |
   | `devil` (قلبين) | 820 × 440 · قلب واحد: 380 × 440 |

4. **Custom CSS**: امسح الموجود فيها، أو حط متغيرات الألوان (القسم 3).
5. خلّ **Shutdown source when not visible** بدون صح، عشان الأداة تبقى متصلة ولا تفوّت أي حدث.
6. اضغط **OK** واسحب الأداة لمكانها بالمشهد.
7. لو عدّلت الملفات: كلك يمين على المصدر ← **Properties** ← **Refresh cache of current page**.

**Streamlabs Desktop:** نفس الخطوات من **Add Source** ← **Browser Source**.

---

## 7) حل المشاكل

| المشكلة | الحل |
|---|---|
| الرقم ما يتحرك | أضف `&debug=1` وشوف النقطة. 🔴 يعني التوكن غلط أو الاتصال مقطوع. افتح الرابط بكروم وشوف Console (F12) |
| StreamElements أو Streamlabs ما يتصل أبد | جرّب `&eio=4`. وإذا ما زال، استخدم `goals-server.js` مع أداة وسيطة مثل Streamer.bot |
| زر Emulate في StreamElements ما يغيّر الرقم | هذا مقصود. أضف `&test=1` وقت التجربة بس |
| الرقم رجع صفر بعد إعادة تشغيل OBS | تأكد إن `persist` مو `0`، وإن الرابط ما فيه `reset=1` |
| الرقم المحفوظ غلط | افتح الرابط مرة وحدة مع `&reset=1` أو غيّر `start` |
| `401 unauthorized` من السيرفر | كلمة السر غلط أو ناقصة. وبدون `GOAL_SECRET` لازم الطلب يكون من نفس الجهاز |
| التحديث يتأخر خلف Nginx | أضف `proxy_buffering off` (القسم 5) |
