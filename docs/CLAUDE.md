# CLAUDE.md — دليل العمل على المشروع (للمطوّرين ونماذج الذكاء الاصطناعي)

> **المرجع الأساسي هو `CLAUDE.md` في جذر المستودع** (قواعد شاشات الإعدادات
> ونظام النقاط الإلزامي لكل لعبة). هذا الملف مكمّل له: يشرح فلسفة المشروع
> وطريقة كتابة الكود. إن تعارض شيء هنا مع ملف الجذر أو مع الكود الفعلي،
> فالأولوية لملف الجذر ثم للكود، ويُوضَّح التعارض لصاحب المشروع.

## 1) ما هو المشروع اليوم

**ألعاب أيمن (aymngames.online)** — منصة ألعاب جماعية للبث المباشر، تعمل
فعلياً في الإنتاج:

| الجزء | المكان | ملاحظات |
|---|---|---|
| الواجهة | صفحات `*.html` في الجذر، `store/`، `dashboard-core/` | Vanilla JS، بدون Framework أو أداة بناء |
| نواة المنصة | `js/agp-*.js` | كل شيء تحت `window.AymanGamesPlatform` (`AGP`)، التواصل عبر `AGP.events` |
| الألعاب | `games/<id>/`، `discord-games/` | أغلبها يبني شاشته عبر `js/agp-game-shell.js` المشترك |
| السيرفر | `backend/` (Node.js + SQLite، مستضاف على Render) | حسابات، تيك توك، نقاط، متجر، دعم، تحديات — راجع `BACKEND_ARCHITECTURE.md` |

**الربط مع تيك توك مطبَّق بالكامل**:
- أحداث البث (تعليقات/هدايا/متابعة/لايكات): `backend/platforms/tiktok/tiktok-connector.js`
  ← WebSocket ← `adapters/agp-tiktok-adapter.js` (الملف الوحيد بالواجهة الذي يتصل بالـ WebSocket).
- تسجيل الدخول/توثيق الحساب: TikTok Login Kit (OAuth) في `backend/auth/tiktok-oauth-service.js`،
  والواجهة تتعامل مع الـ API عبر `auth/auth-client.js` (`window.AGPAuth`).

تفاصيل البنية في `ARCHITECTURE.md`، والتاريخ الكامل لكل تغيير في `CHANGELOG.md`.

القاعدة الذهبية: **"إضافة فوق البنية القائمة، لا استبدال لها."**

## 2) ما يحتاج حذراً خاصاً

- **الملفات المشتركة** (`js/agp-game-shell.js`، `js/agp-core.js`، `auth/auth-client.js`،
  `adapters/agp-tiktok-adapter.js`): أي تعديل يؤثر على كل الألعاب دفعة واحدة؛
  يُختبر على أكثر من لعبة قبل اعتماده.
- **لا تغيير في ترتيب تحميل ملفات النواة** — كل ملف يعتمد على ما قبله.
  الترتيب المعتمد (كما في `dashboard-core/index.html` وصفحات الألعاب):
  `agp-core.js` → `agp-events.js` → `agp-timer-manager.js` →
  `agp-storage-manager.js` → `agp-services.js` → `agp-stream-connector.js` →
  `adapters/agp-tiktok-adapter.js` → `agp-registry.js` → `agp-session.js` →
  `agp-rooms-manager.js` → `agp-player-manager.js` → `agp-player-source.js` →
  `agp-keyword-manager.js` → `agp-queue-manager.js` → `agp-score-manager.js` →
  `agp-lobby.js` → `agp-game-api.js` → `agp-game-engine.js` →
  `agp-game-manager.js` → `agp-game-bridge.js` → `agp-round-manager.js` →
  `agp-bootstrap.js`، ثم ملفات الواجهة المساعدة (`auth-client.js`،
  `agp-game-shell.js` ...) ثم ملف اللعبة نفسها.
- **لا حذف أو إعادة كتابة ملفات كاملة** إلا عند ضرورة حقيقية؛ التعديل الجزئي
  هو الافتراضي.
- **لا أسرار في الكود**: كل مفاتيح المنصات وبوابات الدفع تُقرأ من متغيرات
  البيئة في `backend/config.js`.
- **لا تغييرات بصرية بدون طلب**: أي تعديل على شكل صفحة قائمة يكون بطلب
  صريح أو لحاجة وظيفية واضحة.

## 3) طريقة كتابة الكود

- **اتبع نمط الملفات الحالية**:
  - IIFE يستقبل `AGP`: `(function (AGP) { 'use strict'; ... }(window.AymanGamesPlatform));`
  - حارس بسيط في بداية الملف: `if (!AGP.log) { AGP.log = function () {}; }`
  - تعليقات توثيقية بالعربية (شرح الغرض، لا وصف حرفي للكود).
- **Vanilla JS** بدون Framework أو أداة بناء، ولا مكتبات خارجية في الواجهة
  إلا بموافقة صريحة.
- **كل شيء جديد في الواجهة يدخل عبر `AGP.*`**: خدمة → `AGP.services.X`،
  حدث → `AGP.events.emit`، إعداد → `AGP.config`. لا متغيرات عامة جديدة على
  `window` (الاستثناء القائم: `window.AGPAuth`).
- **اصطلاح الأحداث** `namespace:action` (مثل `player:joined`، `round:ended`،
  `stream:giftReceived`)؛ لا تستدعِ داخل وحدة أخرى مباشرة.
- **استخدم `AGP.log`** بدل `console.log`.
- **Feature flags**: ميزة غير مكتملة تبقى مطفأة (`false`) حتى تُختبر؛ الميزة
  المكتملة تُفعَّل بشكل طبيعي.

## 4) طريقة إضافة لعبة جديدة

1. مجلد `games/<id>/` فيه `index.html` + ملف ربط `agp-<id>.js` يسجّل اللعبة
   عبر `AGP.gameManager.registerGame(...)` بعد حدث `platform:ready`.
2. تحميل ملفات النواة بالترتيب أعلاه، ثم `auth/auth-client.js` و
   `js/agp-game-shell.js` قبل ملف اللعبة.
3. شاشة الإعدادات عبر `settingsFields` في `agp-game-shell.js` (قواعد الشكل
   والاتجاه في `CLAUDE.md` بالجذر تُطبَّق تلقائياً).
4. انضمام لاعبي البث يمر عبر `AGP.playerSource` / `AGP.keywordManager` /
   `AGP.queueManager` — لا `AGP.player.addPlayer` مباشرة.
5. دورة الجولة تُبلَّغ بالأحداث العامة (`game:roundStarted` / `game:roundEnded` /
   `game:reset`) — لا أحداث خاصة بلعبة معيّنة داخل النواة.
6. **إلزامي**: إرسال نتيجة المباراة لنظام النقاط عبر
   `AGPAuth.reportMatchPoints(...)` (التفاصيل في `CLAUDE.md` بالجذر).
7. بطاقة اللعبة في صفحة الألعاب (`.game-card[data-agp-game-id]`) لاكتشافها
   تلقائياً عبر `agp-registry.js`.
8. اللعبة المستضافة خارجياً تُربط عبر `AGP.gameBridge.connect(...)` — لا
   `postMessage` يدوي.

مراجع حيّة لهذا النمط: `games/fruit-roulette/` و`games/memory-challenge/`.

## 5) بعد أي تعديل

- تأكد أن الألعاب المتأثرة ما زالت تُفتح وتعمل، وأن لا أخطاء جديدة في الـ Console.
- أي دالة عامة موجودة تبقى بنفس التوقيع والسلوك، ما لم يكن التغيير مقصوداً.
- التغييرات المهمة تُوثَّق في `CHANGELOG.md` بإصدار جديد.
- العمل يتم على فرع مستقل لكل جلسة/مهمة، ويُدمج عبر Pull Request.

---

> بإيجاز: **اقرأ قبل أن تكتب، وسّع قبل أن تعيد الكتابة، واختبر قبل أن
> تعتبر أي تعديل مكتملاً.**
