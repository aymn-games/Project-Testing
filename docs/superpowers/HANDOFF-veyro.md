# تسليم: Veyro (أوفرلي البث) — للمحادثة الجاية

> **لكلود كود:** هذا الملف يلخّص كل اللي صار في محادثة طويلة سابقة، عشان تكمل بدون ما تعيد شي.
> - اقرأه كامل قبل أي شغل، ثم اقرأ `CLAUDE.md` بالجذر و`docs/CLAUDE.md`.
> - تفاصيل كل تغيير في `docs/CHANGELOG.md` من الإصدار 1.6.1 لين 1.8.1. ابحث فيه بالرقم.
> - تكلّم مع صاحب المشروع بالعربي (لهجة سعودية بسيطة)، بجمل قصيرة وواضحة.
> - **تفضيله:** «لا تنفذ شي ما طلبته، ركّز على الطلب، وارجع لي في أي شي مصيري قبل التنفيذ». الدمج في `main` بس لما يقول «ادمج».

---

## 1) وش هو Veyro

منصة أوفرلي لصناع المحتوى على تيك توك، داخل `aymngames.online/veyro/`.
- **التصاميم:** الستريمر يصمم شاشات (أليرتات، توب، أهداف، نصوص، أصوات، دونيشن…).
- **الرابط:** كل شاشة لها رابط (`veyro/live.html?k=<رمز>`) يحطه في OBS أو TikTok LIVE Studio.
- **من يقدر يفتحه:** لسا في مرحلة تجربة، مفتوح للأدمن وحسابات «تجربة Veyro» بس (`PREVIEW_ADMIN_ONLY` في `veyro/studio.js`).

**الملفات الأساسية:**

| الجزء | الملف |
|---|---|
| المحرر (الواجهة والمنطق) | `veyro/index.html` + `veyro/studio.js` |
| المحرّك المشترك (رسم كل الأدوات + رابط الشاشة) | `js/agp-stream-overlay.js` |
| صورة الإحصائيات | `veyro/stats-card.js` |
| شاشات البث (السيرفر) | `backend/stats/stream-screens-service.js`، `backend/http/auth-router.js` |
| الإحصائيات والشات بالذاكرة | `backend/stats/live-session-stats.js` |
| أدوات الصوت | `backend/stats/screen-audio-service.js`، `screen-audio-watcher.js`، `screen-audio-design.js` |
| Streamlabs والدونيشن | `backend/streamlabs/` (`donations-store.js`، `streamlabs-manager.js`، `streamlabs-oauth.js`، `donations-stats.js`) |

**التصاميم والخطط:** `docs/superpowers/specs/` و`docs/superpowers/plans/`، الملفات اللي تبدأ بـ`2026-11-08-veyro-*`.

---

## 2) اللي انبنى واندمج (طلبات الدمج #335 لين #340)

### المحرر والدخول (1.6.1، 1.7.1)
- **الشكل:** الصفحة تتمدد مع الشاشة، والخيارات أكبر.
- **الدخول:** من داخل Veyro بحساب ألعاب أيمن (إيميل/يوزر + كلمة مرور، أو جوجل). تيك توك يمر على `login.html` ويرجع.
- **لوحة الإعدادات:** ما ترجع لأولها مع أي تعديل (`panelScroll`، `keepScroll`).
- **«اتصل بالبث» في الرئيسية:** الستريمر يكتب يوزر تيك توك الموثّق، والسيرفر يتصل ويبقى متصل لين ينتهي البث. المسارات: `/api/screens/connect|disconnect|connection`، والتنفيذ في `screen-audio-watcher.connectManual`.

### أدوات الصوت (1.7.0) — قسم «الصوت»
- **القارئ الصوتي (`tts`):** Google Cloud TTS، طابور، فلاتر، كلمات ممنوعة.
- **مشغّل الأغاني (`music`):** `!تشغيل <اسم>` يبحث في يوتيوب ويشغّل بمشغّل IFrame مخفي. `!تخطي` لصاحب البث بس.
- **حد البحث:** مفتاح المنصة 25 بحث باليوم لكل ستريمر، أو الستريمر يحط مفتاحه الخاص (`/api/screens/audio-key`).
- **مراقب اتصال:** يفتح البث لشاشات الصوت المفتوحة (`SCREEN_AUDIO_CONNECT`، مفعّل افتراضياً).

### التوب (1.7.2 لين 1.7.4)
- **أداة وحدة لكل تصميم:** جناح الملاك، الحصان المجنح، الكريستالي، القائمة.
- **صف «التوب» داخل الأداة:** الداعمين / المكبّسين / الاثنين / الدونيشن / الكل، ومعه مدة التبديل وحركته.
- **إطار «الأجنحة الكريستالية»:** `assets/overlay-frames/crystal.webp`. الأجنحة ثابتة، والحركة لمعة ضوء (`.agp-so-fshine`) وتوهّج وشرار وريش لافندر.
- **العملة والقلب:** عملة تيك توك `assets/overlay-frames/tiktok-coin.webp`، وقلب لامع ثلاثي الأبعاد.
- **رقم المركز:** ماسة على الإطار (`.agp-so-trank`).
- **تخصيص الألوان:** `frameColor`، `palette: custom` + `rankColors`، `nameColor`، `numColor`، `pillColor`.

### الدونيشن عبر Streamlabs (1.8.0، 1.8.1)
- **المصدر:** الدعم يجي من «كريترز» (دكان تب) لـStreamlabs، ومنه لـVeyro.
- **الربط بلصق الرمز:** الستريمر يلصق «Socket API Token»، والسيرفر يتأكد منه ويبقى متصل طول الوقت (`socket.io-client@2.5.0`).
- **زر «اربط Streamlabs» (OAuth):** `/api/streamlabs/oauth/start|callback`، صلاحية `socket.token`. يظهر بس لما `STREAMLABS_CLIENT_ID/SECRET` موجودين.
- **التخزين:** جدول `donations`، المبالغ بالسنتات، و`UNIQUE(user_id, sl_id)`. المجاميع بالدولار بس وبدون التجارب.
- **العدّاد:** يبدأ من الربط، وفيه «تصفير» يدوي و«تصفير تلقائي مع كل بث».
- **قسم «الدونيشن» في القائمة (للأليرتات بس):**
  - بطاقة Streamlabs.
  - أليرت دونيشن من المكتبة.
  - شرط المبلغ: من وإلى، أو مبلغ محدد (`amountMode: 'exact'`).
  - مكان الاسم والصورة، والمدة، ورسالة الداعم (مقفلة افتراضياً).
- **قسم «التوب»:** توب الدونيشن، قائمة الدونيشن، آخر داعم (`lastdonation`)، هدف الدونيشن (`metric: 'donations'`).

---

## 3) متغيّرات البيئة في Render

| المتغيّر | الحالة |
|---|---|
| `STREAMLABS_CLIENT_ID` / `STREAMLABS_CLIENT_SECRET` | ✅ انضافت |
| `YOUTUBE_API_KEY` / `GOOGLE_TTS_API_KEY` | ❌ ما انضافت. القارئ والمشغّل معطّلين لين تنضاف (Google Cloud: YouTube Data API v3 + Cloud Text-to-Speech) |
| `SCREEN_AUDIO_CONNECT` | مفعّل افتراضياً (`0` يقفله) |
| `STREAMLABS_REDIRECT_URI` | اختياري، الافتراضي `https://project-testing-akds.onrender.com/api/streamlabs/oauth/callback` |

---

## 4) تطبيق Streamlabs

- **التسجيل:** تطبيق «Veyro» مسجّل في Streamlabs ← Settings ← Oauth Clients.
- **الحالة:** **Testing**. يشتغل بس للحسابات اللي في القائمة المسموحة (Whitelist).
  - القائمة فيها حساب Twitch لصاحب المشروع، لأن تيك توك مو من خيارات القائمة.
  - لازم يكون حساب Twitch هذا مربوط بحسابه في Streamlabs.
- **رابط الرجوع:** `https://project-testing-akds.onrender.com/api/streamlabs/oauth/callback`
- **فتحه لكل الستريمرز:** يحتاج طلب «App Review» في Streamlabs. لين يوافقون، لصق الرمز شغّال للجميع.
- ⚠️ **مسارات Streamlabs API v2.0 ما تأكدنا منها:** `/authorize`، `/token`، `/socket/token`. توثيقهم ما كان ينفتح من بيئة التطوير. لو فشل الربط الحقيقي، ابدأ من `backend/streamlabs/streamlabs-oauth.js`.

---

## 5) اللي باقي (بالترتيب)

1. **تجربة زر «اربط Streamlabs» مع صاحب المشروع على حسابه:**
   - تأكد إن نشر #340 «Live»، وإن Twitch مربوط في Streamlabs.
   - في Veyro: قسم «الدونيشن» ← «اربط Streamlabs» ← يوافق ← يرجع برسالة النتيجة (`?sl=ok|cancelled|expired|failed…`).
   - بعدها يرسل «Test Donation» ويتأكد من السجل والأليرت.
   - لو فشل، شوف سجلات Render: `Streamlabs OAuth: <error>`.
2. **طلب App Review من Streamlabs:** صاحب المشروع يقدّمه لما يكون جاهز.
3. **مفاتيح Google:** إضافة `YOUTUBE_API_KEY` و`GOOGLE_TTS_API_KEY` لتفعيل القارئ والمشغّل.
4. **تجربة ببث حقيقي:** كل شي فوق انجرّب بس في المتصفح مع سيرفر وهمي. الباقي: «اتصل بالبث»، والدونيشن الحقيقي، والصوت، والتوب ببيانات بث.
5. **ملاحظات صغيرة ما انصلحت:**
   - بعد «تصفير العدّاد» الرابط يتحدّث خلال 15 ثانية.
   - `streamlabs-manager.pushTest` غير مستخدمة.
   - الطلب الثاني لنفس المشاهد ممكن ينقبل لو جا خلال ثانية من الأول.
   - الدونيشن بعملة غير الدولار يطلع مع أي أليرت دونيشن بغض النظر عن المدى.
   - صورة الإحصائيات (الستوري) لسا بالعملة القديمة `coin.webp`.

---

## 6) طريقة الشغل اللي مشينا عليها

- **الفرع:** كل جلسة تشتغل على فرع مستقل (`claude/...`)، وتدمج بطلب دمج بس لما يقول صاحب المشروع «ادمج». ابدأ من آخر `main`.
- **الاختبارات:**
  - السيرفر: `cd backend && node --test $(find . -name "*.test.js" -not -path "./node_modules/*")`. آخر تشغيل: 182 ناجحة.
  - فيه اختبار متقطّع قديم: `party-rooms` «move clamps to hall bounds».
  - الواجهة: Playwright على `python3 -m http.server 8811` مع اعتراض طلبات `project-testing-akds.onrender.com`.
- **التوثيق:** كل تغيير مهم ينكتب في `docs/CHANGELOG.md` بإصدار جديد.
- **الأسرار:** ما تنكتب في الكود ولا في المحادثة. تنحط في Render بس.
