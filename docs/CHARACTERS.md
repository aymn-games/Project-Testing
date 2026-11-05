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

rig.mood('laugh');                        // smile · laugh · scared · sad · focus (والرمشة تلقائية)
rig.gesture('Right', 'rock');             // rock · paper · scissors · relax
rig.dispose();                            // لما يطلع اللاعب
```

- **التحميل:** `loadModels()` يحمّل الموديلين مرة وحدة بالصفحة، وكل `makeVrmRig` نسخة خفيفة منه بنفس الجيومتري والصور. الطول الافتراضي: البنت 1.62م والولد 1.7م.
- **توجيه العظام:** العظام بوضع T، ودوران الراحة صفر، والوجه لـ+Z، واليسار +X. نفس هيكل `rig3d.js`، فأي حركة أو `aimBone` مكتوبة له تشتغل على VRM.
- **أي لاعب ياخذ أي موديل:** اللعبة تقرر، مثلاً `g` عشوائي للاعب. كل البنات بنفس الموديل وكل الأولاد بنفس الموديل.
- **يد خاصة:** لو اللعبة تبي يد خاصة فيها (مثل يد المواجهة الكبيرة بحجرة ورقة مقص، `games/rock-paper-scissors/rps-hand.js`)، تخفي يد الموديل بـ`rig.hideHand(side, true)` وتركّب يدها على `rig.bones.RightHand`. ولون البشرة بـ`rig.skin`.

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
