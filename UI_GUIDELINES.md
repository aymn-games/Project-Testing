# خارطة الطريق (Roadmap) — AymanGamesPlatform

> هذه الخارطة توضح المراحل التي مرّ بها المشروع والمراحل القادمة
> المخطط لها بشكل عام. الترتيب هنا **مفاهيمي/تخطيطي**، وقابل للتعديل
> حسب الأولويات الفعلية، وليس التزاماً زمنياً صارماً.

## المرحلة 0 — الموقع التعريفي (مكتملة)

- صفحة HTML واحدة (`index.html`) تعرض بطاقات الألعاب (روليت القبائل،
  مين الامبوستر، مافيا).
- عناصر تسويقية: بانر الاستريمر المتبدّل، عداد الزوار الحاليين.
- نوافذ منبثقة للسياسات والوصف التفصيلي لكل لعبة.
- لا يوجد أي منطق منصة موحّد بعد؛ كل شيء داخل `index.html` مباشرة.

## المرحلة 1 — البنية التحتية الأساسية للمنصة (الحالية) ✅

هذه هي المرحلة التي أُنشئت فيها ملفات `js/agp-*.js`:

- **`agp-core.js`**: الـ Namespace الرئيسي (`AGP`)، الإعدادات العامة
  (`AGP.config`)، ناقل الأحداث الداخلي (`AGP.events`)، ونقاط ربط
  مستقبلية معطّلة (`AGP.hooks`).
- **`agp-services.js`**: هياكل خدمات فارغة (Rooms, Players, Network,
  Storage, TikTok, YouTube, Twitch) بدون أي تنفيذ فعلي بعد.
- **`agp-registry.js`**: سجل داخلي للألعاب مع اكتشاف تلقائي لبطاقات
  `.game-card` الموجودة في الصفحة.
- **`agp-bootstrap.js`**: نقطة تشغيل المنصة بعد جاهزية الصفحة، تربط كل
  ما سبق ببعضه وتبث حدث `platform:ready`.
- **`agp-events.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: توسعة ناقل
  الأحداث الأساسي بدعم `once()`، وتوثيق عقد الاستخدام العام واصطلاح
  تسمية الأحداث (`namespace:action`) الذي تعتمد عليه كل الوحدات القادمة.
- **`agp-session.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: هيكل مدير جلسة
  البث (`AGP.session`) بحالات واضحة، دون منطق لاعبين أو لعبة فعلي بعد.
- **`agp-player-manager.js`** *(أُضيف لاحقاً ضمن هذه المرحلة باسم
  `agp-player.js`، ثم أُعيدت تسميته لاحقاً)*: هيكل مدير
  اللاعبين (`AGP.player`)، يعمل فوق مرجع قائمة اللاعبين في
  `AGP.session` ويتواصل عبر `AGP.events` (Namespace: `player:*`).
- **`agp-lobby.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: هيكل مدير غرفة
  الانتظار (`AGP.lobby`)، بوابة فتح/إغلاق التسجيل وقبول/رفض انضمام
  اللاعبين، فوق `AGP.session` و`AGP.player` مباشرة (Namespace: `lobby:*`).
  أول جزء من المنصة قابل للتفاعل الفعلي عبر الـ Console.
- **`agp-game-api.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: العقد الموحّد
  لتسجيل الألعاب (`AGP.gameAPI`) بدوال دورة حياة اختيارية (`onLoad`,
  `onLobbyOpen`, `onRoundStart`, `onPlayerJoin` ...)، مع تمرير بسيط
  لأحداث المنصة الحالية إلى اللعبة النشطة (Namespace: `game:*`)، دون أي
  محرك لعبة حقيقي بعد.
- **`agp-game-engine.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: نسخة أولية
  (Minimal) من محرك اللعبة (`AGP.gameEngine`) — تحميل/تشغيل/إيقاف/تدمير
  لعبة واحدة محمَّلة من `AGP.gameAPI`، مع استدعاء `onLoad`/`onRoundStart`/
  `onRoundEnd`/`onDestroy` يدوياً (Namespace: `game:*` مشترك مع Game API).
- **`agp-game-manager.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*: واجهة
  موحّدة (Facade) فوق `AGP.gameAPI` + `AGP.gameEngine`
  (`registerGame/unregisterGame/loadGame/unloadGame/getCurrentGame/
  getRegisteredGames`)، بدون أي منطق منقول أو مكرَّر. نقطة الدخول
  الموصى بها لأي كود جديد.
- **`games/roulette/agp-roulette.js`** *(أُضيف لاحقاً ضمن هذه المرحلة)*:
  أول Plugin فعلي يربط لعبة روليت القبائل (المستضافة خارجياً) بالمنصة
  عبر Game API/Game Engine، كمرجع لأي لعبة قادمة.
- **هذه المرحلة تنظيمية بالكامل**: توثيق المشروع عبر مجلد `docs/`
  (هذا المجلد نفسه) دون أي تعديل على الكود أو التصميم الحالي.

## المراحل القادمة (مخطط لها، غير منفَّذة بعد)

### المرحلة 2 — طبقة الغرف والجلسات الفعلية (قيد التأسيس)
- ✅ **`agp-session.js`**: هيكل مدير جلسة البث (`AGP.session`) بحالات
  واضحة (`Idle → Registration Open → Registration Closed → Round
  Running → Round Finished → Session Ended`)، بدون منطق لاعبين أو لعبة
  فعلي بعد.
- ✅ **`agp-player-manager.js`**: المسؤول الوحيد عن إدارة اللاعبين
  (`AGP.player`) — إضافة/حذف/
  بحث/تحقق/تصفير قائمة اللاعبين، مرتبط بمرجع قائمة اللاعبين في
  `AGP.session` فقط، ويتواصل عبر أحداث `player:*` بدل استدعاء مباشر.
- ✅ **`agp-lobby.js`**: هيكل مدير غرفة الانتظار (`AGP.lobby`) — فتح/
  إغلاق التسجيل (بتفويض كامل لـ `AGP.session`)، وبوابة انضمام واحدة
  (`requestJoin`) تُفوِّض لـ `AGP.player` دون قائمة لاعبين موازية،
  وتتواصل عبر أحداث `lobby:*`. أول جزء عملي من المنصة يمكن تجربته
  مباشرة من الـ Console.
- ✅ **`agp-game-api.js`**: العقد الموحّد لتسجيل الألعاب (`AGP.gameAPI`)
  — `register/unregister/getGame/getAllGames/setCurrentGame/
  getCurrentGame`، مع تعويض تلقائي لدوال دورة الحياة الاختيارية وتمرير
  بسيط لأحداث `lobby:*`/`player:*`/`session:round*` إلى اللعبة النشطة
  فقط (Namespace: `game:*`)، دون أي محرك لعبة حقيقي بعد.
- ✅ **`agp-game-engine.js`**: نسخة أولية (Minimal) من محرك اللعبة
  (`AGP.gameEngine`) — `loadGame/start/stop/destroy` للعبة واحدة
  محمَّلة، مع استدعاء يدوي صريح لـ `onLoad`/`onRoundStart`/`onRoundEnd`/
  `onDestroy`. أول محرك فعلي جاهز لربط أول لعبة حقيقية لاحقاً.
- ✅ **`games/roulette/agp-roulette.js`**: أول لعبة فعلية (روليت
  القبائل) تعمل كـ Plugin داخل المنصة، مسجَّلة عبر `AGP.gameAPI` ومربوطة
  بـ `AGP.gameEngine`، **ومتصلة فعلياً بالاتجاهين** الآن عبر جسر
  `window.postMessage`: Platform → Game (`loadGame/start/stop/destroy`
  تصل فعلياً لـ `onLoad/onRoundStart/onRoundEnd/onDestroy`)، و Game →
  Platform (أحداث فعلية من اللعبة تصل لـ `AGP.events`:
  `game:roundStarted`, `game:roundEnded`, `game:reset`,
  `game:wheelSpun`, `game:winnerSelected`).
- ✅ **`agp-round-manager.js`**: المسؤول الوحيد عن حالة الجولة
  (`AGP.roundManager`) — **تُحدَّث دورياً**، حالياً 5 حالات عامة
  تماماً (`Idle/RegistrationOpen/Ready/InProgress/RoundEnded`، بعد
  تعميم كامل في [0.19.0] أزال حالتين كانتا خاصتين فعلياً بآلية عجلة
  الروليت)، تنتقل فقط عبر أحداث AGP Events عامة موجودة أصلاً
  (`lobby:*`/`game:roundStarted`/`game:roundEnded`/`game:reset`)، ومربوطة
  الآن أيضاً مع `AGP.roomsManager` (لا `AGP.session` مباشرة) عند فتح/
  إغلاق الجلسة تحديداً.
- ✅ **`agp-game-manager.js`**: واجهة موحّدة (Facade) فوق `AGP.gameAPI` +
  `AGP.gameEngine`، بدون أي منطق منقول.
- ✅ **مزامنة Game Engine التلقائية** (داخل `agp-game-engine.js`،
  [0.14.0]): `game:roundEnded` -> `stop()` و`game:reset` -> `destroy()`
  تلقائياً، تُغلِق الفجوة الموثَّقة منذ [0.10.0]. عامة لأي لعبة.
- ✅ **`js/agp-game-bridge.js`** ([0.14.0]): جسر `postMessage` عام
  مُستخرَج من منطق الروليت، أساس جاهز لربط أي لعبة خارجية مستقبلية
  (بما فيها ألعاب تيك توك) دون تكرار الكود. `games/roulette/
  agp-roulette.js` أُعيدت كتابته ليستخدمه (دون تغيير سلوكه أو بروتوكوله
  مع اللعبة).
- ✅ **طبقات عامة إضافية اكتملت لاحقاً ضمن هذه المرحلة** (بدون واجهة أو
  اتصال فعلي، جاهزة لأي لعبة/منصة بث مستقبلية):
  `agp-timer-manager.js` (عدّادات تنازلية عامة)،
  `agp-storage-manager.js` (تخزين محلي عام namespaced)،
  `agp-stream-connector.js` (مدير عام فوق TikTok/YouTube/Twitch
  Stubs)، `agp-player-source.js` (نقطة دخول موحّدة لإضافة لاعبين من
  أي مصدر)، `agp-keyword-manager.js` (كلمة انضمام واحدة تُغذّي
  Player Source)، `agp-queue-manager.js` (طابور مرشَّحين قبل القبول)،
  `agp-score-manager.js` (سجل نقاط عام لكل لاعب)،
  `agp-rooms-manager.js` (غرفة نشطة واحدة، ببنية داخلية Map قابلة
  للترقية لـ Multi-room دون إعادة كتابة بقية الـ Managers).
- ✅ **`RoomsService`** (في `agp-services.js`): لم تعد Stub فارغة؛
  `createRoom`/`getRoomState` تُفوِّضان فعلياً لـ `AGP.roomsManager`.
  `joinRoom`/`leaveRoom` يبقيان بلا تنفيذ عمداً (يمثّلان اتصالاً شبكياً
  حقيقياً غير موجود بعد).
- ✅ **إغلاق فجوات معمارية موثَّقة سابقاً**: استدعاء `onRoundEnd()`
  المزدوج المحتمل (`agp-game-engine.js` مقابل `agp-game-api.js`) أُغلِق
  عبر حارس تكرار مشترك (`AGP._roundEndGuard`)؛ Round Manager أصبح يمر
  عبر `AGP.roomsManager` بدل `AGP.session` مباشرة.
- ⏳ القادم فعلياً بعد اكتمال البنية الأساسية (Core): ربط الألعاب
  المتبقية (مين الامبوستر، مافيا) بنفس نمط الروليت (Game Bridge +
  Round Manager + طبقة اكتساب اللاعبين الجديدة)، ثم الانتقال للمرحلة 3
  (مزامنة لحظية حقيقية) والمرحلة 4 (تفعيل فعلي لمنصات البث)، وفق
  القواعد في `PLATFORM_RULES.md`.
- لا يزال بدون اتصال شبكي حقيقي؛ الحالة تُدار محلياً في المتصفح كخطوة
  أولى قبل الانتقال للمزامنة الحقيقية.

### المرحلة 3 — المزامنة اللحظية (Realtime Sync)
- تفعيل `AGP.config.features.realtimeSync` وربط `NetworkService`
  باتصال حقيقي (WebSocket ومستقبلاً Cloudflare Workers / Durable
  Objects حسب ما أُشير إليه في `agp-core.js`).
- مزامنة حالة الغرفة بين كل اللاعبين المنضمين لحظياً.

### المرحلة 4 — التكامل مع البث المباشر
- تفعيل تدريجي لخدمات `TikTokService` ثم `YouTubeService` و
  `TwitchService`: استقبال التعليقات والهدايا وتحويلها لأحداث داخل
  `AGP.events` يمكن لأي لعبة الاستماع إليها (مثل تصويت الجمهور عبر
  الهدايا أو التعليقات).

### المرحلة 5 — لوحة تحكم الهوست
- واجهة إدارية مستقلة (منفصلة بصرياً عن واجهة المشاهد العادي، وفق
  `UI_GUIDELINES.md`) تتيح للهوست إدارة الغرفة، اللاعبين، والإعدادات
  الحية أثناء البث.

### المرحلة 6 — توسيع مكتبة الألعاب
- إضافة ألعاب جماعية جديدة تعتمد على نفس البنية (`.game-card` +
  `AGP.registry`) دون الحاجة لإعادة هيكلة الملفات الحالية، وفق الخطوات
  الموضحة في `CLAUDE.md`.

---

> كل مرحلة قادمة تُفعَّل عبر `feature flags` في `AGP.config.features`
> أولاً بقيمة `false`، ثم تُفعَّل تدريجياً بعد اكتمال تنفيذها واختبارها،
> بما يضمن عدم التأثير على الألعاب والميزات الحالية أثناء التطوير.
