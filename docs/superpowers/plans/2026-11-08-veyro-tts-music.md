# Veyro: القارئ الصوتي ومشغّل الأغاني — خطة التنفيذ

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** أداتين جداد بشاشات Veyro — قارئ صوتي لرسائل الشات ومشغّل أغاني يوتيوب بأمر `!تشغيل` — يشتغلون من رابط الشاشة بـOBS / TikTok LIVE Studio.

**Architecture:** السيرفر يحفظ آخر رسائل الشات بالذاكرة لكل بث ويرسلها لرابط الشاشة مع الأحداث الحالية (`/api/public/screen/events`)، ويوفّر بحث يوتيوب وتحويل نص لصوت (Google TTS) بنقاط عامة محمية برمز الشاشة. محرّك الشاشات (`js/agp-stream-overlay.js`) يقرأ الشات ويشغّل الصوت بطابور، والمحرر (`veyro/studio.js`) يضيف قسم «الصوت». مراقب سيرفر يفتح اتصال البث لما شاشة فيها أداة صوت مفتوحة والستريمر يبث.

**Tech Stack:** Node.js (بدون مكتبات جديدة، `fetch` المدمج)، `node:test`، Vanilla JS بالواجهة، YouTube Data API v3 + YouTube IFrame Player API، Google Cloud Text-to-Speech REST.

**Spec:** `docs/superpowers/specs/2026-11-08-veyro-tts-music-design.md`

## Global Constraints

- لا أسرار بالكود: `YOUTUBE_API_KEY`، `GOOGLE_TTS_API_KEY` بـ`backend/config.js` من البيئة؛ فارغ = الميزة معطّلة بأمان (`error: 'disabled'`).
- `SCREEN_AUDIO_CONNECT` مفعّل افتراضياً؛ القيمة `0` تقفله.
- مفتاح يوتيوب الخاص بالستريمر ما يرجع للواجهة أبداً، ولا ينحفظ داخل تصميم الشاشة.
- الشات بالذاكرة بس: حد 50 رسالة لكل بث، النص ≤ 200 حرف. لا SQLite ولا `live-session-store`.
- الافتراضيات: أمر التشغيل `!تشغيل`، التخطي `!تخطي` (صاحب البث بس)، أقصى مدة أغنية 6 دقايق، طابور 10، طلب واحد لكل مشاهد بالطابور، طلب بحث واحد كل 3 ثواني لكل شاشة، نص القارئ ≤ 200 حرف، صيغة القراءة «<الاسم> يقول: <الرسالة>»، صوت TTS `ar-XA` Standard.
- المعاينة بالمحرر صامتة دايماً: لا صوت ولا طلبات `/tts` أو `/music/search`.
- صفوف الإعدادات `.ob-row`: العنوان يمين والتحكم يسار (CLAUDE.md).
- محرر `overlay/` القديم ما ينضاف له شي.
- اختبارات السيرفر: `node --test` من مجلد `backend/` (نفس `stats/*.test.js`).

## Review Focus

1. الستريمر يكتب `!تشغيل` بدون اسم أغنية ← يتجاهل بهدوء (لا بحث ولا خطأ بالشاشة).
2. البحث يرجّع نتايج كلها تمنع التضمين أو أطول من الحد ← يتخطى للي بعدها، ولو ما فيه ← يتجاهل الطلب.
3. مفتاح الستريمر غلط أو خلص حده ← يرجع لمفتاح المنصة بدون ما يوقف المشغّل.
4. رابط الشاشة مفتوح بتبويبين/مشهدين بـOBS ← كل نسخة تشغّل لحالها (مقبول، موثّق)؛ لكن الشات القديم قبل فتح الرابط ما ينقرى (أول طلب يبدأ من `cseq` الحالي).
5. السيرفر يعيد التشغيل وسط البث ← `cseq` يرجع أقل ← الرابط يعيد ضبط العداد بدون ما يقرأ رسائل قديمة.

---

### Task 1: حلقة الشات بالذاكرة

**Files:**
- Modify: `backend/stats/live-session-stats.js` (`recordComment`، تصدير جديد)
- Test: `backend/stats/live-session-chat.test.js`

**Interfaces:**
- Produces: `getRecentChat(username: string, since: number) -> { sid: number, cseq: number, chat: Array<{seq, user, uid, text, owner, at}> } | null`

- [ ] **Step 1: Write the failing test** — `live-session-chat.test.js`: بعد `attach('streamer1', 'room1', 'c1')` و3× `recordComment('streamer1','c1',{id:'tiktok:viewer', name:'فهد', text:'هلا'})`:
  - `getRecentChat('streamer1', 0).chat.length === 3` و`cseq === 3`، و`getRecentChat('streamer1', 2).chat.length === 1`.
  - تعليق من `{id:'tiktok:streamer1'}` ينحفظ بـ`owner === true`.
  - نص 500 حرف ينحفظ بطول 200. تعليق نصه فاضي ما ينحفظ.
  - بعد 60 تعليق: `chat.length === 50` وأول `seq === 11`.
  - `since` أكبر من `cseq` يرجّع الكل (السيرفر رجع).
  - يوزر بدون جلسة يرجّع `null`.
- [ ] **Step 2: Run** `cd backend && node --test stats/live-session-chat.test.js` — Expected: FAIL (`getRecentChat is not a function`).
- [ ] **Step 3: Implement** — بـ`recordComment` بعد العدّ: `pushChat(s, data)` (نفس شكل `pushEvent` بحقول `s.chat`/`s.chatSeq`، الحد `RECENT_CHAT_MAX = 50`، `owner` = `normalize(data.id) === s.username`). `getRecentChat` بنفس منطق `getRecentEvents`.
- [ ] **Step 4: Run** نفس الأمر + `node --test stats/` — Expected: PASS، والاختبارات القديمة PASS.
- [ ] **Step 5: Commit** `feat(screens): keep recent chat per live session for audio tools`

### Task 2: خدمة الصوت (بحث يوتيوب + TTS + مفتاح الستريمر)

**Files:**
- Create: `backend/stats/screen-audio-service.js`
- Modify: `backend/config.js` (`youtubeApiKey`, `googleTtsApiKey`, `screenAudioConnect: process.env.SCREEN_AUDIO_CONNECT !== '0'`)
- Test: `backend/stats/screen-audio-service.test.js`

**Interfaces:**
- Produces: `createService(db, { fetch, platformYoutubeKey, ttsKey, now? })` يرجّع:
  - `searchMusic(screenKey: string, userId: number, q: string) -> Promise<{ success, results?: [{id, title, channel, durationSec}], error?: 'disabled'|'quota'|'rate_limited'|'empty_query'|'failed' }>`
  - `tts(screenKey: string, text: string, voice: 'f'|'m', rate: number) -> Promise<{ success, audio?: Buffer, error? }>`
  - `setUserYoutubeKey(userId, key|null) -> { success, error?: 'invalid_key' }` و`hasUserYoutubeKey(userId) -> boolean`
  - جدول `screen_audio_keys(user_id INTEGER PRIMARY KEY, youtube_key TEXT, updated_at INTEGER)` ينشأ داخل `createService`.
  - `get()` singleton بنفس أسلوب `stream-screens-service.js` (`createService(require('../db/database'), {fetch: global.fetch, ...config})`).

- [ ] **Step 1: Write the failing tests** (قاعدة بيانات بالذاكرة `better-sqlite3(':memory:')` و`fetch` وهمي يسجّل الطلبات):
  - `searchMusic` بـ`q` فاضي أو مسافات ← `empty_query` بدون أي `fetch`.
  - بدون مفتاح منصة ولا مفتاح ستريمر ← `disabled`.
  - نتيجة ناجحة: طلب `search.list` (يحوي `videoEmbeddable=true` و`type=video`) ثم `videos.list` للمدة (`contentDetails.duration` `PT4M13S` ← `253`)، والنتيجة مرتّبة مثل البحث.
  - نفس النص (بعد تطبيع: trim + lowercase + مسافات) مرة ثانية ← من الكاش بدون `fetch`.
  - طلبين لنفس الشاشة خلال أقل من 3 ثواني (نص مختلف) ← الثاني `rate_limited`.
  - الستريمر عنده مفتاح ← الطلب يستخدمه؛ لو رجّع 403 `quotaExceeded` أو 400 `keyInvalid` ← يعيد بمفتاح المنصة وينجح.
  - مفتاح المنصة 403 `quotaExceeded` ← `quota`.
  - `setUserYoutubeKey(1, 'bad key!')` ← `invalid_key` (المسموح `/^[\w-]{20,60}$/`)؛ `null` يمسحه؛ `hasUserYoutubeKey` يعكس الحالة.
  - `tts` بنص فاضي ← `empty_text`؛ بدون `ttsKey` ← `disabled`؛ نجاح: جسم الطلب فيه `languageCode: 'ar-XA'` واسم صوت Standard (`ar-XA-Standard-A` للأنثى، `ar-XA-Standard-B` للذكر) و`speakingRate` محصور 0.5–2، والرد `audioContent` base64 يرجع `Buffer`؛ نفس النص مرة ثانية من الكاش.
- [ ] **Step 2: Run** `cd backend && node --test stats/screen-audio-service.test.js` — Expected: FAIL (الملف غير موجود).
- [ ] **Step 3: Implement** — كاش البحث `Map` حد 500 مدخل TTL يوم، كاش TTS حد 200 مدخل TTL ساعة (الأقدم ينشال). نقطة TTS: `https://texttospeech.googleapis.com/v1/text:synthesize?key=`، `audioEncoding: 'MP3'`. النص يتقص 200 حرف قبل الطلب.
- [ ] **Step 4: Run** نفس الأمر — Expected: PASS.
- [ ] **Step 5: Commit** `feat(screens): YouTube search and Google TTS service for screen audio tools`

### Task 3: المسارات بالسيرفر

**Files:**
- Modify: `backend/http/auth-router.js` (`handlePublicScreenEvents` + مسارات جديدة)
- Modify: `backend/stats/screen-tests.js` (`TYPES`، `seenKeys`)
- Test: `backend/stats/screen-tests.test.js` (إضافة)، `backend/stats/screen-audio-design.test.js`

**Interfaces:**
- Consumes: `getRecentChat` (Task 1)، `screenAudio.get()` (Task 2).
- Produces:
  - دالة `hasAudioTools(design) -> { tts: boolean, music: boolean }` بملف جديد صغير `backend/stats/screen-audio-design.js` (عنصر `type` = `'tts'`/`'music'`، غير `hidden`، و`enabled !== false`).
  - `GET /api/public/screen/events?...&c=<cseq>` يرجّع زيادة `cseq` و`chat` **بس** لو `hasAudioTools` فيه شي، وإلا الشكل الحالي بدون تغيير.
  - `GET /api/public/screen/music/search?k=&q=` ← JSON من `searchMusic`.
  - `GET /api/public/screen/tts?k=&t=&v=&r=` ← `audio/mpeg` (أو JSON خطأ 400/429/503). يرفض لو الشاشة ما فيها أداة `tts`.
  - `GET /api/screens/audio-key` (حساب) ← `{ success, hasKey }`؛ `POST /api/screens/audio-key { youtubeKey|null }` ← `{ success, hasKey }` (نفس `screensGate`).
  - `screenTests.TYPES` تزيد: `'tts'`, `'music'`, `'music-skip'`, `'music-stop'`. `screenTests.seenKeys(maxAgeMs) -> string[]`.
- [ ] **Step 1: Write the failing tests** — `screen-audio-design.test.js`: تصميم بدون أدوات ← `{tts:false, music:false}`؛ أداة `music` مخفية ← false؛ `tts` مفعّلة ← true. وبـ`screen-tests.test.js`: `push(k,'i1','music-skip').type === 'music-skip'`، و`seenKeys(60000)` يحوي مفتاح بعد `touch(k)` وما يحويه بعد مهلة (بـ`now` وهمي أو `maxAgeMs = -1`).
- [ ] **Step 2: Run** `cd backend && node --test stats/` — Expected: FAIL.
- [ ] **Step 3: Implement** الملف والتعديلات والمسارات أعلاه (المسارات العامة بدون حساب ومحمية بـ`screenFromKey`).
- [ ] **Step 4: Run** `node --test stats/` — PASS. وتجربة يدوية: `node server.js` محلياً + `curl` لـ`/api/public/screen/events?k=<رمز>` ← بدون أدوات صوت ما فيه `chat`.
- [ ] **Step 5: Commit** `feat(screens): chat feed, music search and TTS endpoints for screen links`

### Task 4: مراقب اتصال شاشات الصوت

**Files:**
- Create: `backend/stats/screen-audio-watcher.js`
- Modify: `backend/server.js` (تشغيله جنب `startWatcher`)
- Test: `backend/stats/screen-audio-watcher.test.js`

**Interfaces:**
- Consumes: `screenTests.seenKeys`، `streamScreens.get().findByKey/ownerTikTok`، `hasAudioTools`، `tiktokLiveCheck.isLive`، `connectorRouter.createConnectorForPlatform('tiktok', {source:'screen-audio'})`، `liveSessionStats` (نفس استدعاءات `stream-stats-watcher.js`).
- Produces: `createWatcher(deps) -> { tick(): Promise<void>, active(): string[] }` و`startScreenAudioWatcher()` (يقرأ `config.screenAudioConnect`، `CHECK_MS = 30 * 1000`، مهلة إغلاق `IDLE_MS = 2 * 60 * 1000` من آخر `seenKeys`).
- [ ] **Step 1: Write the failing tests** بتبعيات وهمية: شاشة مفتوحة فيها `music` + الستريمر يبث ← `active()` يحوي يوزره بعد `tick()` واتصال واحد انفتح؛ `tick()` ثاني ← ما ينفتح اتصال ثاني؛ شاشة بدون أدوات صوت ← لا اتصال؛ الستريمر مو يبث ← لا اتصال؛ الشاشة ما انشافت أكثر من `IDLE_MS` ← `disconnect()` انستدعى؛ حالة `ended` ← يطلع من `active()`؛ يوزر عليه مراقب الإحصائيات (`liveSessionStats` `_watching`) ← ما يفتح اتصال ثاني.
- [ ] **Step 2: Run** `node --test stats/screen-audio-watcher.test.js` — FAIL.
- [ ] **Step 3: Implement** بنفس هيكل `stream-stats-watcher.js` (`statsOnly: true`، `WATCH_PREFIX`-مثل بادئة `'saudio:'`)، فحص البث بفاصل `CHECK_GAP_MS` بين اليوزرات.
- [ ] **Step 4: Run** — PASS، و`node --test stats/` كامل PASS.
- [ ] **Step 5: Commit** `feat(screens): open the live connection for screens with audio tools (SCREEN_AUDIO_CONNECT)`

### Task 5: أداة القارئ الصوتي بالمحرّك

**Files:**
- Modify: `js/agp-stream-overlay.js` (نوع `tts`: `newItem` افتراضيات، `buildTts`، سحب الشات، طابور الصوت، `sampleEvent` للتجربة)

**Interfaces:**
- Consumes: `cseq`/`chat` من `/api/public/screen/events` (Task 3)، `/api/public/screen/tts` (Task 3)، تجارب `screenTests` نوع `'tts'`.
- Produces (للمحرر، Task 7): افتراضيات العنصر `{ type:'tts', enabled:true, voice:'f', rate:1, volume:0.9, readName:true, minLen:2, maxLen:200, skipCommands:true, skipLinks:true, banned:[], bubble:true, size:3 }`؛ دالة مكشوفة `O.ttsFilter(item, msg) -> string|null` (النص اللي ينقرى أو null).
- [ ] **Step 1: Implement** — `fetchEvents` يرسل `&c=` ويعالج `cseq` مثل `seq` (أول رد/رقم أقل = ضبط بدون قراءة). كل رسالة جديدة ← `ttsFilter` ← طابور (حد 15، الأقدم ينرمى) ← `<audio src="/tts?...">` واحد ورى واحد بمستوى `volume`. الفقاعة تعرض الاسم والرسالة وقت القراءة. `preview` = عرض مثال ثابت بدون صوت ولا طلبات. أول تشغيل يرفضه المتصفح ← زر «تفعيل الصوت» صغير.
- [ ] **Step 2: Verify** بالمتصفح (Playwright، `live.html?k=` مع مسارات وهمية): رسالتين ← طلبين `/tts` بالترتيب «فهد يقول: هلا»؛ رسالة `!تشغيل ...` ورابط `https://x.com` ← ما تنطلب؛ نفس الصفحة بوضع المحرر ← صفر طلبات `/tts`.
- [ ] **Step 3: Commit** `feat(screens): chat TTS reader tool in the overlay engine`

### Task 6: أداة مشغّل الأغاني بالمحرّك

**Files:**
- Modify: `js/agp-stream-overlay.js` (نوع `music`)

**Interfaces:**
- Consumes: الشات (Task 5)، `/api/public/screen/music/search` (Task 3)، تجارب `'music'`/`'music-skip'`/`'music-stop'`.
- Produces: افتراضيات `{ type:'music', enabled:true, playCmd:'!تشغيل', skipCmd:'!تخطي', volume:0.6, maxDurSec:360, maxQueue:10, design:'card', size:3 }` (`design`: `'icon'` | `'card'`)؛ دالة مكشوفة `O.parseMusicCommand(item, msg) -> { kind:'play', q } | { kind:'skip' } | null`.
- [ ] **Step 1: Implement** — `parseMusicCommand`: الرسالة تبدأ بـ`playCmd` + نص غير فاضي ← play؛ `skipCmd` من رسالة `owner` ← skip؛ غيره null. play ← لو المشاهد عنده طلب بالطابور أو الطابور مليان ← تجاهل؛ وإلا بحث ← أول نتيجة `durationSec ≤ maxDurSec` ← طابور. التشغيل بـYouTube IFrame Player API (`https://www.youtube.com/iframe_api`) بعنصر مخفي 1×1، `onError` ← التالي، `ENDED` ← التالي. البطاقة: أيقونة + العنوان + «طلب: <الاسم>» + شريط تقدّم؛ `design:'icon'` أيقونة بس. `preview` = مثال ثابت بدون صوت ولا بحث.
- [ ] **Step 2: Verify** بالمتصفح بمسارات وهمية: `!تشغيل محمد عبده` ← طلب بحث واحد بـ`q=محمد عبده` ← البطاقة تعرض العنوان؛ نفس المشاهد يطلب ثاني ← ما ينطلب؛ `!تشغيل` بدون نص ← لا طلب؛ `!تخطي` من مشاهد ← ما يتخطى، ومن `owner` ← يتخطى؛ نتيجة 9 دقايق ← تنتخطى. وضع المحرر ← صفر طلبات بحث.
- [ ] **Step 3: Commit** `feat(screens): YouTube song player tool driven by chat commands`

### Task 7: قسم «الصوت» بمحرر Veyro

**Files:**
- Modify: `veyro/studio.js` (`SECTIONS`، `TOOLS.audio`، `propsPane`، `ttsProps`، `musicProps`، اسم العنصر بالطبقات)
- Modify: `veyro/index.html` (لو احتاج CSS صغير)

**Interfaces:**
- Consumes: افتراضيات Task 5/6، `POST /api/screens/test-alert` بأنواع Task 3، `GET/POST /api/screens/audio-key`.
- [ ] **Step 1: Implement** — قسم `{ key:'audio', label:'الصوت', icon:'<سماعة>', title:'الصوت', desc:'قارئ لرسائل الشات ومشغّل أغاني بأوامر المشاهدين.' }` بعد «الوعاء». بطاقتين: «القارئ الصوتي» و«مشغّل الأغاني». خصائص القارئ (صفوف `row`): تفعيل · الصوت (نسائي/رجالي) · السرعة · مستوى الصوت · يقرأ الاسم · أقل/أقصى طول · تجاهل الأوامر · تجاهل الروابط · كلمات ممنوعة (نص مفصول بفواصل) · الفقاعة · «جرّب». خصائص المشغّل: تفعيل · أمر التشغيل · أمر التخطي · مستوى الصوت · أقصى مدة (دقايق) · حد الطابور · الشكل · مفتاح يوتيوب الخاص (خانة + حفظ/مسح، تعرض «محفوظ ✓» من `hasKey` بس) · أزرار «جرّب أغنية» و«تخطي» و«إيقاف» · تنبيه `ob-warn`: «تيك توك ممكن يكتم صوت البث أو ينذرك بسبب حقوق الأغاني.»
- [ ] **Step 2: Verify** بالمتصفح (Playwright مع مسارات وهمية مثل فحص Veyro السابق): القسم يظهر، إضافة الأداتين، تغيير الإعدادات ينحفظ (`/api/screens/save` فيه العنصر)، «جرّب» يرسل `test-alert` بالنوع الصحيح، المعاينة صامتة، العنوان يمين والتحكم يسار، الجوال سليم.
- [ ] **Step 3: Commit** `feat(veyro): audio section with TTS reader and song player settings`

### Task 8: التوثيق والفحص الكامل

**Files:**
- Modify: `docs/CHANGELOG.md` (إصدار 1.7.0)، `docs/BACKEND_ARCHITECTURE.md` (المسارات والمتغيّرات الثلاثة)
- [ ] **Step 1:** `cd backend && node --test` كامل — PASS (مع عدد الاختبارات بالتقرير).
- [ ] **Step 2:** فحص Veyro القديم (الدخول، الرئيسية، المحرر، أليرت) بالمتصفح ما انكسر، و`overlay/live.html` لشاشة بدون أدوات صوت ما يطلب `c=`/`chat`.
- [ ] **Step 3:** CHANGELOG + BACKEND_ARCHITECTURE: المتغيّرات `YOUTUBE_API_KEY`، `GOOGLE_TTS_API_KEY`، `SCREEN_AUDIO_CONNECT` وطريقة الحصول على المفاتيح (Google Cloud: تفعيل YouTube Data API v3 وCloud Text-to-Speech API).
- [ ] **Step 4: Commit** `docs: screen audio tools (TTS reader, song player)`
