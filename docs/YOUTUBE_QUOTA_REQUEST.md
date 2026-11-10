# طلب رفع حد YouTube Data API (مشغّل الأغاني بـVeyro)

مرجع لتعبئة فورم Google الرسمي: **YouTube API Services – Audit and Quota Extension Form**
https://support.google.com/youtube/contact/yt_api_form

الحد المجاني 10,000 وحدة باليوم لكل مشروع. البحث بالاسم يكلّف حوالي 101 وحدة (`search.list` 100 + `videos.list` 1)، يعني حوالي 100 بحث باليوم للمنصة كلها. الطلب بالرابط يكلّف وحدة وحدة. الفورم بالإنجليزي، والإجابات تحت جاهزة للنسخ.

## قبل التقديم (لازم يكون كله صحيح)

- [x] **المشغّل ظاهر:** الفيديو يطلع بشاشة البث، وأقل حجم له 356×200 بكسل، وما ينفصل الصوت عن الصورة (`buildMusic`/`syncYtHost` بـ`js/agp-stream-overlay.js`).
- [x] **سياسة الخصوصية** (`privacy-policy.html`، القسم 9): تذكر YouTube API Services، وفيها رابط سياسة خصوصية Google، وتوضّح البيانات المحفوظة ومدتها (30 يوم).
- [x] **شروط الاستخدام** (`terms.html`، القسم 8): استخدام المشغّل يعني الموافقة على شروط YouTube، مع الرابط.
- [x] **مدة الكاش:** بيانات يوتيوب ما تنحفظ أكثر من 30 يوم (`music_search_cache`).
- [ ] **التعديلات منشورة:** لازم تكون أعلاه على الموقع الحقيقي (اندمجت ونُشرت) قبل ما ترسل الفورم.
- [ ] **فيديو عرض قصير:** دقيقة أو دقيقتين يوضّح المشغّل وهو يشتغل (مشاهد يكتب `!تشغيل` ← الأغنية تطلع بفيديوها بالبث). ارفعه بيوتيوب كـ«غير مدرج» (Unlisted) وحط الرابط بالفورم.

## الإجابات (انسخها للفورم)

**Organization / Developer name:** Ayman Games (aymngames.online)

**Website:** https://aymngames.online

**Privacy Policy URL:** https://aymngames.online/privacy-policy.html

**Terms of Service URL:** https://aymngames.online/terms.html

**Contact email:** البريد الرسمي المذكور بـ`terms.html` (القسم 19)

**Google Cloud project number / ID:** من Google Cloud Console (الصفحة الرئيسية للمشروع: Project number / Project ID)

**API client name:** Veyro — Song Player (stream overlay)

**Which APIs:** YouTube Data API v3 (`search.list`, `videos.list`) and the YouTube IFrame Player API.

**Describe your API client and how it uses YouTube API Services:**

> Veyro is part of Ayman Games (aymngames.online), a platform of interactive games and stream overlays for Arabic TikTok LIVE streamers. The streamer adds a browser-source overlay to OBS or TikTok LIVE Studio. One of its widgets is a "song player": viewers type a chat command (e.g. "!تشغيل <song name>") and the overlay plays the requested song for everyone watching the stream.
>
> Our server calls `search.list` (type=video, videoEmbeddable=true, maxResults=5) with the viewer's query, then `videos.list` (contentDetails) to read durations so the streamer can cap song length. When a viewer sends a direct YouTube link we only call `videos.list` for that single video. Playback always uses the official YouTube IFrame Player, shown visibly on the stream inside a "now playing" card (minimum 356×200 px) together with the video title and the viewer who requested it. We never download, cache, or extract audio or video, never separate audio from video, never hide or overlay the player, and never alter or block ads.
>
> We store only the search results (video ID, title, channel name, duration) for at most 30 days, shared between streamers to avoid repeated identical searches, then delete them automatically. We do not use YouTube OAuth and access no YouTube user data.

**How do users interact with it?**

> Streamers sign in to aymngames.online, add the song-player widget to their overlay and set who may request songs (everyone, moderators, or specific usernames), a maximum song length, and a per-viewer queue limit. Viewers request songs from the TikTok LIVE chat. The streamer or allowed users can skip a song or change the volume from chat.

**Quota requested and justification:**

> We request **100,000 units per day**. A name request costs about 101 units (`search.list` + `videos.list`); link requests cost 1 unit. Identical searches are served from our 30-day cache and do not hit the API. With about [عدد الستريمرز] active streamers making about [عدد الطلبات] song requests per stream per day, we expect about [الناتج] name searches per day (≈ [الناتج × 101] units). We also rate-limit to one search every 3 seconds per overlay and cap each streamer's daily searches on our platform key.

احسب الأرقام اللي بين الأقواس قبل الإرسال. مثال: 30 ستريمر × 25 طلب = 750 بحث ≈ 75,750 وحدة، وعشان كذا الطلب 100,000.

**Demo video / screenshots:** رابط فيديو العرض (Unlisted) + صورة لكرت المشغّل بالبث + صورة لإعداداته بفيرو.

## بعد الإرسال

- **الرد:** Google يرد على البريد، وأحياناً يطلب تعديلات أو توضيح. الموافقة تاخذ من أيام لأسابيع.
- **الحد الحالي يبقى شغّال:** لين تجي الموافقة، يشتغل المشروع بالحد المجاني. الكاش الدائم والطلب بالرابط يخففون الاستهلاك.
- **بعد الموافقة:** يصير الحد الجديد على نفس المفتاح، وما يحتاج أي تعديل بالكود. ولو تبي ترفع حد كل ستريمر (`PLATFORM_DAILY_PER_USER = 25` بـ`backend/stats/screen-audio-service.js`) غيّره.
