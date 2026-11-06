# شخصيات الأنمي المشتركة (VRM)

شخصيات أنمي ثلاثية الأبعاد (بنت وولد)، صممها صاحب المنصة بـ **VRoid Studio**. أي لعبة ثري دي تقدر
تستخدمها. أول لعبة استخدمتها: «حجرة ورقة مقص».

| الشي | المكان |
|---|---|
| الموديلات | `assets/characters/girl.vrm` و`assets/characters/boy.vrm` |
| كود التشغيل (ES module) | `js/agp-vrm-characters.js` |
| الحركات (نفسها حق حفلة الميلاد) | `games/birthday-party/rig3d.js` (`getClip`) + `games/birthday-party/anims/` |
| سكربت تخفيف موديل جديد | `tools/vrm-slim.py` |
| مثال كامل شغّال | `games/rock-paper-scissors/rps-scene.js` (ابحث عن `makeVrmRig`) |
| صور الاختيار بالبروفايل | `assets/characters/girl.png` و`boy.png` |
| اختيار اللاعب (السيرفر) | جدول `user_characters` + `backend/collectibles/collectibles-service.js` |

**الموديل:** VRM 1.0، فيه 13–15 ألف مثلث وخامتين، وحجمه تقريباً 2.9 ميقا بعد التخفيف.
**التعابير:** happy, angry, sad, relaxed, surprised, blink، وحروف الفم aa/ih/ou/ee/oh.

## الاستخدام بأي لعبة

### 1. خريطة الاستيراد (importmap)
تنحط بصفحة اللعبة قبل أي module:

```html
<script type="importmap">{ "imports": {
  "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/",
  "@pixiv/three-vrm": "https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.3.3/lib/three-vrm.module.min.js"
} }</script>
```

### 2. التحميل وإنشاء الشخصيات

```js
import { loadModels, makeVrmRig } from '../../js/agp-vrm-characters.js';
import { loadClips } from '../birthday-party/rig3d.js';

loadClips('../birthday-party/anims/');   // الوقوف والمشي والسامبا المسجّلة (اختياري، وإلا نسخ مكتوبة بالكود)

let MODELS = null;
(function tryLoad() {                     // لو فشل (نت المذيع) نعيد المحاولة
  loadModels().then(m => { if (!m) return setTimeout(tryLoad, 5000); MODELS = m; /* أنشئ الشخصيات */ });
}());

const rig = makeVrmRig(isBoy ? MODELS.boy : MODELS.girl, { n: playerNumber });
scene.add(rig.root);
rig.play(0);                              // 0 وقوف · 1 مشي · 2 سامبا · 3 تلويح · 4 تصفيق · 5 لفّة · 6 قفز
                                          // 7 قلب · 8 تمايل · 9 ديسكو · 10 هيب هوب

// كل إطار:
rig.update(dt);
// ... أي تعديل يدوي على rig.bones (Mixamo: Hips, Spine, Head, RightArm, RightForeArm, RightHand ...)
rig.sync();                               // لازم بعد التعديلات، ينقل الوضعية للهيكل الفعلي

rig.play('win');                          // رقصة الفوز الخاصة بالشخصية (البنت «رقصة النجمة» والولد «رقصة البطل»)
rig.mood('laugh');                        // smile · laugh · scared · sad · focus (والرمشة تلقائية)
rig.gesture('Right', 'rock');             // rock · paper · scissors · relax
rig.dispose();                            // لما يطلع اللاعب
```

- **التحميل:** `loadModels()` يحمّل الموديلين مرة وحدة بالصفحة، وكل `makeVrmRig` نسخة خفيفة منه بنفس الجيومتري والصور. الطول الافتراضي: البنت 1.62م والولد 1.7م.
- **توجيه العظام:** العظام بوضع T، ودوران الراحة صفر، والوجه لـ+Z، واليسار +X. نفس هيكل `rig3d.js`، فأي حركة أو `aimBone` مكتوبة له تشتغل على VRM.
- **أي لاعب ياخذ أي موديل:** اللعبة تقرر، مثلاً `g` عشوائي للاعب. كل البنات بنفس الموديل وكل الأولاد بنفس الموديل.
- **يد خاصة:** لو اللعبة تبي يد خاصة فيها (مثل يد المواجهة الكبيرة بحجرة ورقة مقص، `games/rock-paper-scissors/rps-hand.js`)، تخفي يد الموديل بـ`rig.hideHand(side, true)` وتركّب يدها على `rig.bones.RightHand`. ولون البشرة بـ`rig.skin`.

## اختيار اللاعب لشخصيته (من البروفايل)
- **وين يختار:** صاحب الحساب يختار من **البروفايل ← المقتنيات ← «شخصيتي بالألعاب»**: بنت، أو ولد، أو عشوائي. مجانية لكل حساب، وصورها `assets/characters/girl.png` و`boy.png`.
- **وين تنحفظ:** جدول `user_characters` (صف لكل مستخدم، وما فيه صف = عشوائي). الخدمة بـ`collectibles-service.js`: `getCharacter` و`setCharacter` و`getCharacterForVerifiedTikTok`. الرابط `POST /api/character/set {kind}`، ومن الواجهة `AGPAuth.setCharacter(kind)`.
- **كيف توصل للعبة:** مع كل تعليق من البث يوصل الحقل **`character`**، ويوصل بـ`stream:commentReceived`، وبـ`playerData` للألعاب اللي تستخدم `keywordManager`/`queueManager`. قيمه:
  - `'girl'` أو `'boy'`: صاحب حساب موثّق بنفس يوزر تيك توك، واختار شخصيته.
  - `'any'`: صاحب حساب موثّق، بس ما اختار، فاللعبة تعطيه وحدة من الثنتين عشوائي.
  - `null`: ما عنده حساب موثّق.
- **قاعدة صاحب المنصة:** شخصيات الأنمي لأصحاب الحسابات. اللي بدون حساب (`null`) ياخذ الشخصية القديمة حق اللعبة لو عندها وحدة، مثل سفينة النجاة. واللعبة اللي ما عندها شخصيات قديمة، مثل حجرة ورقة مقص، تعطيه شخصية أنمي عشوائية.
- **بأي لعبة:** استخدم اختيار اللاعب، وإلا عشوائي:

```js
var g = p.character === 'boy' ? 1 : p.character === 'girl' ? 0 : (Math.random() < .5 ? 0 : 1);
makeVrmRig(g ? MODELS.boy : MODELS.girl, { n });
```

أمثلة:
- `genderOf(p)` بـ`games/rock-paper-scissors/game.html`: كل اللاعبين شخصيات أنمي.
- **سفينة النجاة:** `reg.vrm(name)` بـ`games/survival-ship/sh-platform.js` يرجع `'girl'` أو `'boy'` أو `null`، و`'any'` تصير وحدة ثابتة من id الحساب. وفي `games/survival-ship/ship3d.js`، `attachVrm` تخفي جسم الشخصية القديمة وتحط الموديل مكانه. السفينة تستخدم three من unpkg، فـimportmap حقها يحوّل `three` ورابط jsdelivr لنفس نسخة unpkg، عشان يبقى three واحد بالصفحة.

## رقصات الفوز
- **`rig.play('win')`:** كل شخصية لها رقصة فوز أصلية خاصة فيها، مكتوبة بالكود في `js/agp-vrm-characters.js` (`DANCE_DEF`) بأدوات `POSE_KIT` من `rig3d.js`، وتتكرر بدون قفزة:
  - **البنت «رقصة النجمة» (4.4ث):** تتمايل ويدينها فوق تلوّح، وبعدها يدينها على خصرها مع هزّة، وتختم بلفّة كاملة ويدينها مفرودة.
  - **الولد «رقصة البطل» (4.5ث):** يدفع يدينه لفوق مع نطّات، وبعدها خطوات شفل، وبعدها وضعية «داب»، ويختم بيد على صدره ويأشّر للكاميرا.
- **وين تشتغل:** حجرة ورقة مقص (البطل على المنصة)، وسفينة النجاة (الفائز بالمباراة، ويبقى ثابت والكاميرا تدور حوله).
- **رقصة جديدة:** أضف مفتاح لـ`DANCE_DEF` بنفس شكل `seqPose([[مدة، (u, P) => {...}], ...])`.

## الأداء
- كل شخصية أمرين رسم بس. 32 لاعب = تقريباً 150 أمر رسم بالمشهد كله (الشخصيات المبنية بالكود كانت 221).
- فيزياء الشعر والتنورة طافية. لو تبيها، شغّلها للقريبين بس.
- مع عدد كبير على جهاز ضعيف: حدّث البعيدين كل إطارين أو ثلاثة، ونزّل الدقة (`setPixelRatio(1)`). شوف «الوضع الخفيف» بـ`rps-scene.js`.
- اللعبة تشتغل على جهاز المذيع بس (المتصفح أو OBS)، والمشاهدين يشوفون البث فيديو.

## إضافة موديل جديد (لبس أو تسريحة ثانية)
1. صمّمه بـVRoid Studio، وصدّره بصيغة **VRM 1.0**.
2. خفّفه: `python3 tools/vrm-slim.py input.vrm assets/characters/<name>.vrm`. يصغّر الصور لـ1024، ويشيل صورة المعاينة والتعابير غير المستخدمة، والشكل ما يتغيّر.
3. أضفه بـ`loadModels` (`js/agp-vrm-characters.js`) مع ارتفاعه بـ`HEIGHT` ولون بشرته بـ`SKIN`.

## الحقوق
الموديلات ملك صاحب المنصة (المؤلف aymngame). بيانات الملف (meta) فيها «التعديل ممنوع» و«إعادة التوزيع
ممنوعة»، وهذا يخص الغير. التخفيف بـ`vrm-slim.py` صار بموافقته.
