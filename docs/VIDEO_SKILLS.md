# سكيلز الفيديو والمؤثرات (من GitHub)

سكيلز منصّبة في `.claude/skills/` لصناعة فيديوهات وموشن جرافيك ومؤثرات بمستوى مونتير محترف.
تشتغل جنب سكيلز Remotion الموجودة أصلاً (`remotion-*`).

| السكيل | وش يسوي | المصدر |
|---|---|---|
| `hyperframes` | البوابة الأساسية: فيديو من HTML (إعلانات، إنترو، كابشن، شروحات، مقاطع عمودية) ويصدّره MP4 | heygen-com/hyperframes@b754f7c (Apache-2.0) |
| `hyperframes-cli` | أوامر المعاينة والفحص والتصدير | نفسه |
| `hyperframes-registry` | ~450 بلوك جاهز: ترانزشن، جلتش، فيلم جرين، عناوين متحركة، كاميرا 3D | نفسه |
| `media-use` | موسيقى، مؤثرات صوتية، LUTs وتلوين، تفريغ صوت، قص خلفية | نفسه |
| `motion-doctrine` | قوانين الحركة: الفيديو يحس كأنه حركة كاميرا وحدة مو شرايح | heygen-com/hyperframes (.claude/skills) |
| `cut-the-curve` | كتالوج الانتقالات الاحترافية (zoom-through، waterfall، rack-focus) | نفسه |
| `seam-craft` | صحة الانتقالات بين المشاهد (بدون فلاش أبيض) | نفسه |
| `captions-overlay` | قواعد الكابشن فوق الفيديو | نفسه |
| `gsap-core` / `gsap-timeline` / `gsap-plugins` / `gsap-utils` / `gsap-performance` | GSAP الرسمي: التوقيت، الإيزنق، SplitText، المسارات، الأداء | greensock/gsap-skills@aed9cfd (MIT) |
| `ffmpeg` | وصفات FFmpeg: قص، دمج، ضغط، نصوص، أوفرلاي، صوت | n0an/ffmpeg-skill@aec7706 (MIT) |

ملاحظات:
- سكيلز HyperFrames تشغّل `npx hyperframes` (من npm) عند الحاجة؛ تحتاج Node وChromium وFFmpeg.
- `motion-doctrine` و`cut-the-curve` و`seam-craft` و`captions-overlay` مكتوبة أصلاً لفيديوهات HeyGen الداخلية، فبعض أمثلتها خاصة بهويتهم؛ المبادئ نفسها عامة.
- رخصة كل سكيل محفوظة داخل مجلده (`LICENSE`).
