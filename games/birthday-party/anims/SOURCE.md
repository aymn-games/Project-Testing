# مصدر الحركات المسجّلة

- `samba.json` ← `SambaDance` من `Michelle.glb`
- `idle.json` و`walk.json` ← `idle` و`walk` من `Xbot.glb`

الملفات الأصلية من أمثلة Three.js r160
(`https://github.com/mrdoob/three.js/tree/r160/examples/models/gltf/`)،
وأصل الحركات من Mixamo (Adobe). صاحب المشروع وافق على استخدامها في الحفلة.

**طريقة التوليد:** `node tools/extract-anims.mjs`. السكربت ينزّل ملفات GLB
لمجلد مؤقت، ويحفظ عظام الجسم الـ 22 بس، بمعدل 15 إطار/ث، والأرقام مقرّبة
لـ 4 خانات.

**الصيغة:**
- `tracks[bone].q` = فرق الدوران العالمي عن وضع T لكل إطار
  (`D = G_anim · G_T⁻¹`).
- `tracks.Hips.p` = موقع الورك نسبة لطول الورك وقت الوقوف، والانزياح
  الأفقي على طول الحركة منشال.
- `rest` = دوران كل عظمة العالمي بوضع T في الملف الأصلي (للمرجع).
