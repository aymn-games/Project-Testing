/**
 * ألعاب أيمن — «بثوث شغّالة الآن» بمكتبة الألعاب.
 * منقول كما هو من games.html (المصدر GET /api/public/live-streams + ستريمرز
 * ينتظرون خصم أو فاضين من js/agp-challenge-lobby.js، والدخول المباشر للتحدي).
 * الفرق الوحيد: مكان التركيب صار [data-live-host] بالتصميم الجديد.
 */
(function(){

  // [البثوث الشغّالة الآن] بطاقات للستريمرز اللي متصلين الحين من داخل
  // الألعاب: صورة، اسم، حساب تيك توك، اسم اللعبة، عدد المشاهدين، والآيدي
  // (يفتح البروفايل). المصدر GET /api/public/live-streams ويتحدّث كل 30 ثانية.
  // يُركَّب تحت بطاقة "اتصل بالبث"، ويختفي القسم لو ما فيه أي بث.
  var LIVE_STREAMS_POLL_MS = 15000;

  function ensureLiveStreamsStyles(){
    if (document.getElementById('agp-live-streams-style')) return;
    var st = document.createElement('style');
    st.id = 'agp-live-streams-style';
    st.textContent =
      '.agp-live-streams{margin:0 0 28px;direction:rtl}' +
      '.agp-live-streams[hidden]{display:none}' +
      '.agp-live-head{display:flex;align-items:center;gap:8px;margin-bottom:14px;font-family:"Noto Kufi Arabic",sans-serif;font-size:15px;font-weight:700;color:#f4f2fb}' +
      '.agp-live-head-dot{width:8px;height:8px;border-radius:50%;background:#f43f5e;box-shadow:0 0 0 4px rgba(244,63,94,.16);animation:agpLiveDot 1.6s ease-in-out infinite}' +
      '.agp-live-head-count{font-size:12.5px;font-weight:600;color:#8f88a3}' +
      '.agp-live-head-viewers{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;background:rgba(244,63,94,.1);border:1px solid rgba(244,63,94,.25);font-size:12px;font-weight:700;color:#fda4af;white-space:nowrap}' +
      '.agp-live-head-viewers[hidden]{display:none}' +
      '.agp-live-head-viewers svg{width:14px;height:14px}' +
      // الشريط: سكرول أفقي حقيقي (يتحرك تلقائياً بـJS، ويقدر المستخدم يسحبه بإصبعه/الماوس أو يوقفه).
      '.agp-live-head{flex-wrap:wrap}' +
      '.agp-live-ctl{margin-inline-start:auto;display:flex;align-items:center;gap:6px}' +
      '.agp-live-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;min-width:34px;padding:0 12px;border-radius:999px;border:1px solid rgba(255,255,255,.12);background:rgba(255,255,255,.05);color:#e9e4f7;font:inherit;font-size:12.5px;font-weight:700;cursor:pointer;transition:background .2s,border-color .2s,transform .15s;-webkit-tap-highlight-color:transparent}' +
      '.agp-live-btn:hover{background:rgba(178,140,245,.16);border-color:rgba(178,140,245,.45)}' +
      '.agp-live-btn:active{transform:scale(.95)}' +
      '.agp-live-btn:focus-visible{outline:2px solid #b28cf5;outline-offset:2px}' +
      '.agp-live-btn.icon{padding:0;width:34px}' +
      '.agp-live-btn svg{width:15px;height:15px;flex:none}' +
      '.agp-live-btn[aria-pressed="true"]{background:rgba(178,140,245,.2);border-color:rgba(178,140,245,.6);color:#fff}' +
      '.agp-live-marquee{direction:ltr;overflow-x:auto;overflow-y:hidden;padding:6px 0 10px;scrollbar-width:none;overscroll-behavior-x:contain;cursor:grab;touch-action:pan-x pan-y;-webkit-mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent);mask-image:linear-gradient(90deg,transparent,#000 5%,#000 95%,transparent)}' +
      '.agp-live-marquee::-webkit-scrollbar{display:none}' +
      '.agp-live-marquee.dragging{cursor:grabbing;user-select:none}' +
      '.agp-live-marquee.dragging .agp-live-card{pointer-events:none}' +
      '.agp-live-track{direction:ltr;display:flex;width:max-content}' +
      '.agp-live-track .agp-live-card{direction:rtl;flex:0 0 330px;margin-right:14px;box-sizing:border-box}' +
      '.agp-live-track .agp-live-meta{flex-wrap:nowrap}' +
      // «عرض الكل»: شبكة ثابتة بنسخة وحدة من البطاقات
      '.agp-live-streams.all .agp-live-marquee{overflow:visible;cursor:auto;-webkit-mask-image:none;mask-image:none}' +
      '.agp-live-streams.all .agp-live-track{direction:rtl;width:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px}' +
      '.agp-live-streams.all .agp-live-track .agp-live-card{margin:0}' +
      '.agp-live-streams.all .agp-live-track [data-live-dup]{display:none}' +
      '.agp-live-streams.all [data-live-nav]{display:none}' +
      '@media (max-width:640px){.agp-live-track .agp-live-card{flex-basis:290px;margin-right:10px}.agp-live-btn .agp-live-btn-t{display:none}.agp-live-btn{padding:0;width:34px}.agp-live-streams.all .agp-live-track{grid-template-columns:minmax(0,1fr)}}' +
      '.agp-live-card{display:flex;align-items:center;gap:12px;padding:14px;border-radius:18px;border:1px solid rgba(255,255,255,.07);background:linear-gradient(180deg,rgba(24,21,36,.92),rgba(14,13,22,.96));box-shadow:inset 0 1px 0 rgba(255,255,255,.04),0 18px 40px -32px rgba(0,0,0,1);color:inherit;text-decoration:none;transition:transform .25s,border-color .25s,box-shadow .25s}' +
      '.agp-live-card:hover{transform:translateY(-3px);border-color:rgba(178,140,245,.32);box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 22px 46px -30px rgba(122,63,212,.55)}' +
      '.agp-live-avatar{position:relative;flex:none;width:56px;height:56px}' +
      '.agp-live-avatar-img,.agp-live-avatar-ph{display:block;width:56px;height:56px;border-radius:50%;object-fit:cover;border:2px solid #f43f5e;box-shadow:0 0 0 3px rgba(244,63,94,.14);box-sizing:border-box;background:#1e1a2e}' +
      '.agp-live-avatar-ph{display:flex;align-items:center;justify-content:center;font-weight:700;color:#d9cff2;background:linear-gradient(135deg,#2e2547,#1a1628)}' +
      '.agp-live-tag{position:absolute;bottom:-6px;left:50%;transform:translateX(-50%);padding:1px 7px;border-radius:6px;background:#e11d48;border:2px solid #15131f;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.8px;line-height:1.5}' +
      '.agp-live-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px}' +
      '.agp-live-top{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0}' +
      '.agp-live-name{min-width:0;font-size:15px;font-weight:700;color:#f4f2fb;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-watch{flex:none;display:inline-flex;align-items:center;gap:5px;padding:5px 12px;border-radius:999px;background:linear-gradient(180deg,#f43f5e,#e11d48);color:#fff;font-size:12px;font-weight:700;box-shadow:0 6px 16px -8px rgba(225,29,72,.9),inset 0 1px 0 rgba(255,255,255,.25);transition:filter .2s,transform .2s}' +
      '.agp-live-watch svg{width:11px;height:11px}' +
      '.agp-live-card:hover .agp-live-watch{filter:brightness(1.1);transform:translateX(-2px)}' +
      '.agp-live-acc{font-size:12.5px;color:#a596cf;direction:ltr;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-game{display:flex;align-items:center;gap:5px;font-size:12.5px;color:#b9b2c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-game svg,.agp-live-chip svg{flex:none;width:13px;height:13px}' +
      '.agp-live-game svg{color:#9a7fe0}' +
      '.agp-live-meta{display:flex;flex-wrap:wrap;gap:6px;margin-top:3px}' +
      '.agp-live-chip{display:inline-flex;align-items:center;gap:5px;white-space:nowrap;padding:2px 9px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.07);font-size:11.5px;color:#8f88a3}' +
      '.agp-live-chip b{font-weight:700;color:#ece8f6}' +
      '.agp-live-chip-viewers svg{color:#f43f5e}' +
      '.agp-live-chip-id{direction:ltr;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}' +
      // بطاقات الستريمرز المتاحين: ينتظر خصم («دخول مباشر») وفاضي بمكتبة الألعاب («تحدّاه»).
      '.agp-live-card.wait .agp-live-avatar-img,.agp-live-card.wait .agp-live-avatar-ph{border-color:#fbbf24;box-shadow:0 0 0 3px rgba(251,191,36,.16)}' +
      '.agp-live-card.wait .agp-live-tag{background:#d97706}' +
      '.agp-live-card.wait .agp-live-watch{background:linear-gradient(180deg,#10b981,#059669);box-shadow:0 6px 16px -8px rgba(5,150,105,.9),inset 0 1px 0 rgba(255,255,255,.25)}' +
      '.agp-live-card.idle .agp-live-avatar-img,.agp-live-card.idle .agp-live-avatar-ph{border-color:#34d399;box-shadow:0 0 0 3px rgba(52,211,153,.14)}' +
      '.agp-live-card.idle .agp-live-tag{background:#059669}' +
      '.agp-live-card.idle .agp-live-watch{background:linear-gradient(180deg,#8a4fe8,#7a3fd4);box-shadow:0 6px 16px -8px rgba(122,63,212,.9),inset 0 1px 0 rgba(255,255,255,.25)}' +
      // بطاقات مميزة يمنحها الأدمن (card.style من السيرفر — backend/live-cards/live-card-styles-service.js).
      // شكل مستقل كلياً عن البطاقة العادية: خلفية بهالة ناعمة، إطار متدرّج رفيع، حلقة صورة تدور ببطء،
      // اسم بتدرّج، شارة، وكل عنصر (اليوزر، اللعبة، المشاهدين، ID، زر المشاهدة، وسم LIVE) بألوان التصميم.
      // الألوان كلها متغيرات (--fx-*) يحددها كل تصميم تحت.
      '.agp-live-namewrap{min-width:0;display:flex;align-items:center;gap:6px}' +
      '.agp-live-verified{flex:none;width:16px;height:16px;color:#9ccbf0;filter:drop-shadow(0 0 5px rgba(156,203,240,.35))}' +
      '.agp-live-badge{flex:none;display:inline-flex;align-items:center;gap:4px;padding:2px 9px 2px 8px;border-radius:999px;font-size:10.5px;font-weight:800;line-height:1.55;letter-spacing:.2px;color:var(--fx-badge-tx);background:var(--fx-badge);border:1px solid var(--fx-badge-bd);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}' +
      '.agp-live-badge svg{width:11px;height:11px}' +
      // تبويب الـID بالبطاقات المميزة: إطار متدرّج بألوان التصميم (مو حدود شفافة مثل باقي الشارات)،
      // تعبئة داكنة بلمسة لون، توهّج خفيف، والرقم بتدرّج مثل الاسم.
      '.agp-live-card.fx .agp-live-chip.agp-live-chip-id{gap:6px;padding:3px 11px 3px 9px;border-radius:10px;border:1.5px solid transparent;font-weight:800;background:linear-gradient(135deg,var(--fx-chip),var(--fx-gap)) padding-box,var(--fx-btn) border-box;box-shadow:0 0 14px -6px var(--fx-glow-h),inset 0 1px 0 rgba(255,255,255,.06)}' +
      '.agp-live-id-ic{width:14px;height:14px;color:var(--fx-num)}' +
      '.agp-live-id-v{letter-spacing:1.2px;font-size:12px;background:var(--fx-name);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      // سطري «يقدّم البث» و«البث برعاية» (يكتبهم الأدمن) — تحت الشارات بفاصل ناعم.
      '.agp-live-credits{display:flex;flex-direction:column;gap:3px;margin-top:7px;padding-top:7px;border-top:1px solid var(--fx-chip-bd)}' +
      '.agp-live-credit{display:flex;align-items:center;gap:5px;min-width:0;font-size:11.5px;color:var(--fx-chip-tx);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-credit svg{flex:none;width:13px;height:13px;color:var(--fx-a)}' +
      '.agp-live-credit b{font-weight:700;color:var(--fx-num);overflow:hidden;text-overflow:ellipsis}' +
      '.agp-live-card.fx{position:relative;overflow:hidden;isolation:isolate;padding:16px;border-radius:22px;border:1px solid transparent;background:var(--fx-bg) padding-box,var(--fx-border) border-box;box-shadow:0 18px 44px -26px var(--fx-glow);transition:transform .4s cubic-bezier(.2,.8,.2,1),box-shadow .4s}' +
      '.agp-live-card.fx:hover{transform:translateY(-4px);border-color:transparent;box-shadow:0 26px 56px -24px var(--fx-glow-h)}' +
      '.agp-live-card.fx::before{content:"";position:absolute;inset:0;z-index:-1;background:var(--fx-aura);pointer-events:none}' +
      '.agp-live-card.fx::after{content:"";position:absolute;top:0;bottom:0;width:40%;left:-70%;z-index:-1;background:linear-gradient(100deg,transparent,var(--fx-shine),transparent);transform:skewX(-20deg);animation:agpLiveShine 7s ease-in-out infinite;pointer-events:none}' +
      '.agp-live-card.fx .agp-live-avatar{width:60px;height:60px}' +
      '.agp-live-card.fx .agp-live-avatar::before{content:"";position:absolute;inset:-3px;border-radius:50%;background:var(--fx-ring);animation:agpLiveSpin 9s linear infinite}' +
      '.agp-live-card.fx .agp-live-avatar-img,.agp-live-card.fx .agp-live-avatar-ph{position:relative;width:60px;height:60px;border:3px solid var(--fx-gap);box-shadow:none}' +
      '.agp-live-card.fx .agp-live-avatar-ph{background:var(--fx-ph);color:var(--fx-ph-tx)}' +
      '.agp-live-card.fx .agp-live-tag{z-index:1;background:var(--fx-tag);color:var(--fx-tag-tx);border-color:var(--fx-gap);letter-spacing:1px}' +
      '.agp-live-card.fx .agp-live-name{font-size:15.5px;font-weight:800;background:var(--fx-name);-webkit-background-clip:text;background-clip:text;color:transparent}' +
      '.agp-live-card.fx .agp-live-acc{color:var(--fx-acc)}' +
      '.agp-live-card.fx .agp-live-game{color:var(--fx-game)}' +
      '.agp-live-card.fx .agp-live-game svg,.agp-live-card.fx .agp-live-chip-viewers svg{color:var(--fx-a)}' +
      '.agp-live-card.fx .agp-live-chip{background:var(--fx-chip);border-color:var(--fx-chip-bd);color:var(--fx-chip-tx)}' +
      '.agp-live-card.fx .agp-live-chip b{color:var(--fx-num)}' +
      '.agp-live-card.fx .agp-live-chip-id{color:var(--fx-id)}' +
      '.agp-live-card.fx .agp-live-watch{background:var(--fx-btn);color:var(--fx-btn-tx);box-shadow:0 8px 18px -12px var(--fx-glow-h),inset 0 1px 0 rgba(255,255,255,.3)}' +
      // المؤسس — ذهبي شمباني ناعم على أسود
      '.agp-live-card.fx-founder{--fx-a:#d9bf86;--fx-bg:linear-gradient(160deg,#1a160f 0%,#110e0a 55%,#0c0a08 100%);--fx-border:linear-gradient(140deg,rgba(240,220,170,.55),rgba(190,160,100,.08) 42%,rgba(190,160,100,.06) 62%,rgba(235,212,160,.42));--fx-aura:radial-gradient(120% 90% at 100% 0%,rgba(217,191,134,.11),transparent 55%),radial-gradient(80% 70% at 0% 100%,rgba(170,140,90,.08),transparent 60%),repeating-linear-gradient(135deg,rgba(240,220,170,.018) 0 1px,transparent 1px 9px);--fx-shine:rgba(250,235,200,.06);--fx-glow:rgba(217,191,134,.26);--fx-glow-h:rgba(217,191,134,.4);--fx-ring:conic-gradient(from 0deg,#f6ead0,#d9bf86,#b8975e,#d9bf86,#f6ead0);--fx-gap:#110e0a;--fx-ph:linear-gradient(135deg,#34291a,#18130d);--fx-ph-tx:#ecd9ad;--fx-tag:linear-gradient(180deg,#eedcb0,#cdae72);--fx-tag-tx:#2b2214;--fx-name:linear-gradient(90deg,#fbf3e0,#ead3a2 60%,#cfb07a);--fx-badge:linear-gradient(135deg,rgba(225,200,145,.16),rgba(225,200,145,.05));--fx-badge-tx:#ecd9ad;--fx-badge-bd:rgba(225,200,145,.3);--fx-acc:#bfa983;--fx-game:#d5c8ae;--fx-chip:rgba(217,191,134,.05);--fx-chip-bd:rgba(217,191,134,.16);--fx-chip-tx:#b3a07e;--fx-num:#f3e4bf;--fx-id:#dcc390;--fx-btn:linear-gradient(180deg,#efdfb6,#d1b47c);--fx-btn-tx:#2b2214}' +
      // حساب المنصة (رسمي) — لافندر/وردي/سماوي ناعم
      '.agp-live-card.fx-platform{--fx-a:#bba6ee;--fx-bg:linear-gradient(160deg,#17122a 0%,#110d20 55%,#0d0b18 100%);--fx-border:linear-gradient(135deg,rgba(200,184,245,.58),rgba(236,180,210,.18) 45%,rgba(160,200,245,.4));--fx-aura:radial-gradient(90% 80% at 100% 0%,rgba(170,140,235,.16),transparent 60%),radial-gradient(70% 70% at 0% 100%,rgba(230,160,200,.09),transparent 60%),radial-gradient(60% 50% at 50% 115%,rgba(140,190,240,.08),transparent 70%);--fx-shine:rgba(255,255,255,.05);--fx-glow:rgba(160,130,230,.28);--fx-glow-h:rgba(160,130,230,.42);--fx-ring:conic-gradient(from 0deg,#c9b6f5,#eeb4d2,#a9cdf3,#c9b6f5);--fx-gap:#120e21;--fx-ph:linear-gradient(135deg,#33275a,#1a1530);--fx-ph-tx:#ebe3ff;--fx-tag:linear-gradient(90deg,#a993e0,#d9a0c2);--fx-tag-tx:#fff;--fx-name:linear-gradient(90deg,#ffffff,#ece6ff 55%,#f5e0f0);--fx-badge:linear-gradient(135deg,rgba(170,145,225,.24),rgba(220,160,195,.14));--fx-badge-tx:#f1eaff;--fx-badge-bd:rgba(210,195,245,.32);--fx-acc:#b2a5d6;--fx-game:#cbc3e6;--fx-chip:rgba(170,145,225,.07);--fx-chip-bd:rgba(190,170,240,.18);--fx-chip-tx:#a59ac6;--fx-num:#f6f2ff;--fx-id:#d6caf7;--fx-btn:linear-gradient(90deg,#a993e0,#d9a0c2);--fx-btn-tx:#fff}' +
      // مميز — وردي لؤلؤي ناعم
      '.agp-live-card.fx-vip{--fx-a:#eab4cc;--fx-bg:linear-gradient(160deg,#1f141d 0%,#140d14 60%,#0f0a0f 100%);--fx-border:linear-gradient(135deg,rgba(245,200,220,.52),rgba(245,200,220,.07) 50%,rgba(245,215,228,.36));--fx-aura:radial-gradient(100% 80% at 100% 0%,rgba(234,160,195,.11),transparent 60%),radial-gradient(70% 60% at 0% 100%,rgba(240,175,185,.07),transparent 60%);--fx-shine:rgba(255,230,240,.06);--fx-glow:rgba(234,160,195,.24);--fx-glow-h:rgba(234,160,195,.38);--fx-ring:conic-gradient(from 0deg,#fbe6ef,#e9a9c6,#f0bcc4,#fbe6ef);--fx-gap:#150d15;--fx-ph:linear-gradient(135deg,#3d2234,#1c1019);--fx-ph-tx:#f5d5e4;--fx-tag:linear-gradient(90deg,#efbcd3,#f2c3c8);--fx-tag-tx:#3a1426;--fx-name:linear-gradient(90deg,#fff4f8,#f7d6e5 60%,#ebb5cd);--fx-badge:linear-gradient(135deg,rgba(234,160,195,.17),rgba(234,160,195,.05));--fx-badge-tx:#f5d5e4;--fx-badge-bd:rgba(240,185,210,.3);--fx-acc:#cfa5b9;--fx-game:#e0cbd5;--fx-chip:rgba(234,160,195,.06);--fx-chip-bd:rgba(240,185,210,.16);--fx-chip-tx:#bb9cab;--fx-num:#fdf0f6;--fx-id:#ecbdd2;--fx-btn:linear-gradient(90deg,#efbcd3,#f2c3c8);--fx-btn-tx:#3a1426}' +
      // ألماسي — ثلجي ناعم
      '.agp-live-card.fx-diamond{--fx-a:#a8d8f0;--fx-bg:linear-gradient(160deg,#0e1a24 0%,#0b141c 60%,#090f15 100%);--fx-border:linear-gradient(135deg,rgba(205,235,250,.58),rgba(160,210,240,.08) 45%,rgba(185,195,245,.42));--fx-aura:radial-gradient(100% 80% at 100% 0%,rgba(130,195,235,.12),transparent 60%),radial-gradient(70% 60% at 0% 100%,rgba(160,170,240,.09),transparent 60%),repeating-linear-gradient(60deg,rgba(255,255,255,.016) 0 1px,transparent 1px 14px);--fx-shine:rgba(235,248,255,.06);--fx-glow:rgba(130,195,235,.24);--fx-glow-h:rgba(130,195,235,.38);--fx-ring:conic-gradient(from 0deg,#e8f6fd,#9fd3ef,#b3bdf3,#e8f6fd);--fx-gap:#0c161e;--fx-ph:linear-gradient(135deg,#1a3547,#0e1c27);--fx-ph-tx:#cdeafa;--fx-tag:linear-gradient(90deg,#b2def3,#c3caf5);--fx-tag-tx:#0e2533;--fx-name:linear-gradient(90deg,#f4fbff,#d1ecfa 55%,#bcc6f4);--fx-badge:linear-gradient(135deg,rgba(140,200,235,.17),rgba(140,200,235,.05));--fx-badge-tx:#cdeafa;--fx-badge-bd:rgba(160,210,240,.3);--fx-acc:#98b9cb;--fx-game:#c4d8e3;--fx-chip:rgba(140,200,235,.06);--fx-chip-bd:rgba(160,210,240,.16);--fx-chip-tx:#93afbf;--fx-num:#f2faff;--fx-id:#aed9f0;--fx-btn:linear-gradient(90deg,#b2def3,#c3caf5);--fx-btn-tx:#0e2533}' +
      // بطل التوب — برونزي — أول لقب
      '.agp-live-card.fx-champion.ct-1{--fx-a:#d6a07a;--fx-bg:linear-gradient(160deg,#1b140f 0%,#120d0a 60%,#0d0a08 100%);--fx-border:linear-gradient(140deg,rgba(235,190,150,.55),rgba(200,140,100,.08) 45%,rgba(230,180,140,.4));--fx-aura:radial-gradient(110% 85% at 100% 0%,rgba(214,160,122,.13),transparent 58%),radial-gradient(70% 60% at 0% 100%,rgba(190,120,80,.08),transparent 60%);--fx-shine:rgba(255,250,240,.06);--fx-glow:rgba(214,160,122,.26);--fx-glow-h:rgba(214,160,122,.4);--fx-ring:conic-gradient(from 0deg,#f6dcc6,#d6a07a,#a8714a,#d6a07a,#f6dcc6);--fx-gap:#120d0a;--fx-ph:linear-gradient(135deg,#3a2618,#1a110b);--fx-ph-tx:#f0cdb2;--fx-tag:linear-gradient(180deg,#ecc3a1,#c98d63);--fx-tag-tx:#2a170c;--fx-name:linear-gradient(90deg,#fdf1e8,#eccab0 60%,#d5a07c);--fx-badge:linear-gradient(135deg,rgba(214,160,122,.2),rgba(214,160,122,.06));--fx-badge-tx:#f0cdb2;--fx-badge-bd:rgba(214,160,122,.34);--fx-acc:#c2a089;--fx-game:#d8c4b5;--fx-chip:rgba(214,160,122,.06);--fx-chip-bd:rgba(214,160,122,.17);--fx-chip-tx:#b39784;--fx-num:#f9e3d2;--fx-id:#e0b18f;--fx-btn:linear-gradient(180deg,#ecc3a1,#c98d63);--fx-btn-tx:#2a170c}' +
      // بطل التوب — فضي — لقبين
      '.agp-live-card.fx-champion.ct-2{--fx-a:#c3cddb;--fx-bg:linear-gradient(160deg,#14171c 0%,#0e1014 60%,#0b0c0f 100%);--fx-border:linear-gradient(140deg,rgba(235,240,248,.6),rgba(170,180,195,.08) 45%,rgba(215,222,232,.45));--fx-aura:radial-gradient(110% 85% at 100% 0%,rgba(195,205,219,.13),transparent 58%),radial-gradient(70% 60% at 0% 100%,rgba(150,165,185,.08),transparent 60%);--fx-shine:rgba(255,250,240,.06);--fx-glow:rgba(195,205,219,.26);--fx-glow-h:rgba(195,205,219,.4);--fx-ring:conic-gradient(from 0deg,#f7f9fc,#c3cddb,#8e99a8,#c3cddb,#f7f9fc);--fx-gap:#0e1014;--fx-ph:linear-gradient(135deg,#2c323c,#15181d);--fx-ph-tx:#e3e8ef;--fx-tag:linear-gradient(180deg,#eef2f7,#b8c2cf);--fx-tag-tx:#151a21;--fx-name:linear-gradient(90deg,#ffffff,#e2e8f0 55%,#b9c3d0);--fx-badge:linear-gradient(135deg,rgba(195,205,219,.2),rgba(195,205,219,.06));--fx-badge-tx:#e3e8ef;--fx-badge-bd:rgba(195,205,219,.34);--fx-acc:#a9b3c1;--fx-game:#cdd4de;--fx-chip:rgba(195,205,219,.06);--fx-chip-bd:rgba(195,205,219,.17);--fx-chip-tx:#9da7b5;--fx-num:#f4f7fb;--fx-id:#cfd8e4;--fx-btn:linear-gradient(180deg,#eef2f7,#b8c2cf);--fx-btn-tx:#151a21}' +
      // بطل التوب — ذهبي — 3 ألقاب
      '.agp-live-card.fx-champion.ct-3{--fx-a:#e3c77a;--fx-bg:linear-gradient(160deg,#19150b 0%,#110e08 60%,#0c0a06 100%);--fx-border:linear-gradient(140deg,rgba(250,230,170,.62),rgba(200,160,80,.1) 30%,rgba(250,225,150,.5) 55%,rgba(200,160,80,.1) 80%,rgba(250,230,170,.6));--fx-aura:radial-gradient(110% 85% at 100% 0%,rgba(227,199,122,.13),transparent 58%),radial-gradient(70% 60% at 0% 100%,rgba(200,160,80,.08),transparent 60%);--fx-shine:rgba(255,250,240,.06);--fx-glow:rgba(227,199,122,.26);--fx-glow-h:rgba(227,199,122,.4);--fx-ring:conic-gradient(from 0deg,#fcf2cf,#e3c77a,#c19a45,#e3c77a,#fcf2cf);--fx-gap:#110e08;--fx-ph:linear-gradient(135deg,#3a2e12,#1a150a);--fx-ph-tx:#f3e1aa;--fx-tag:linear-gradient(180deg,#f4e3ad,#d6b260);--fx-tag-tx:#2a2008;--fx-name:linear-gradient(90deg,#fff9e6,#f0da95 55%,#d6b260);--fx-badge:linear-gradient(135deg,rgba(227,199,122,.2),rgba(227,199,122,.06));--fx-badge-tx:#f3e1aa;--fx-badge-bd:rgba(227,199,122,.34);--fx-acc:#c4b080;--fx-game:#dacda9;--fx-chip:rgba(227,199,122,.06);--fx-chip-bd:rgba(227,199,122,.17);--fx-chip-tx:#b5a479;--fx-num:#fbedc4;--fx-id:#e8cf86;--fx-btn:linear-gradient(180deg,#f4e3ad,#d6b260);--fx-btn-tx:#2a2008}' +
      // بطل التوب — بلاتيني — 4 ألقاب
      '.agp-live-card.fx-champion.ct-4{--fx-a:#b2e0dc;--fx-bg:linear-gradient(160deg,#0f1919 0%,#0b1213 60%,#090e0f 100%);--fx-border:linear-gradient(140deg,rgba(220,250,246,.62),rgba(150,200,200,.1) 30%,rgba(205,200,245,.5) 55%,rgba(150,200,200,.1) 80%,rgba(220,250,246,.6));--fx-aura:radial-gradient(110% 85% at 100% 0%,rgba(178,224,220,.13),transparent 58%),radial-gradient(70% 60% at 0% 100%,rgba(190,185,240,.08),transparent 60%);--fx-shine:rgba(255,250,240,.06);--fx-glow:rgba(178,224,220,.26);--fx-glow-h:rgba(178,224,220,.4);--fx-ring:conic-gradient(from 0deg,#effdfb,#b2e0dc,#c9c4f2,#b2e0dc,#effdfb);--fx-gap:#0b1213;--fx-ph:linear-gradient(135deg,#1c3433,#0e1a1a);--fx-ph-tx:#d5f2ef;--fx-tag:linear-gradient(180deg,#dcf5f2,#b7cfee);--fx-tag-tx:#0d2222;--fx-name:linear-gradient(90deg,#f6fffe,#d0efeb 55%,#c9c4f2);--fx-badge:linear-gradient(135deg,rgba(178,224,220,.2),rgba(178,224,220,.06));--fx-badge-tx:#d5f2ef;--fx-badge-bd:rgba(178,224,220,.34);--fx-acc:#9fc2bf;--fx-game:#c6dedb;--fx-chip:rgba(178,224,220,.06);--fx-chip-bd:rgba(178,224,220,.17);--fx-chip-tx:#93b3b0;--fx-num:#effdfb;--fx-id:#bfe7e3;--fx-btn:linear-gradient(180deg,#dcf5f2,#b7cfee);--fx-btn-tx:#0d2222}' +
      // بطل التوب — أسطوري — 5 ألقاب وأكثر
      '.agp-live-card.fx-champion.ct-5{--fx-a:#dcbcfb;--fx-bg:linear-gradient(160deg,#17111f 0%,#100c17 60%,#0c0a11 100%);--fx-border:linear-gradient(120deg,rgba(255,200,225,.6),rgba(220,190,255,.55) 20%,rgba(185,215,255,.55) 40%,rgba(195,250,225,.5) 60%,rgba(255,240,185,.55) 80%,rgba(255,200,225,.6));--fx-aura:radial-gradient(110% 85% at 100% 0%,rgba(220,188,251,.13),transparent 58%),radial-gradient(70% 60% at 0% 100%,rgba(185,215,255,.08),transparent 60%);--fx-shine:rgba(255,250,240,.06);--fx-glow:rgba(220,188,251,.26);--fx-glow-h:rgba(220,188,251,.4);--fx-ring:conic-gradient(from 0deg,#ffd6e8,#dcbcfb,#b8d8ff,#c8f7e2,#fff1b8,#ffd6e8);--fx-gap:#100c17;--fx-ph:linear-gradient(135deg,#33264a,#18121f);--fx-ph-tx:#ecdfff;--fx-tag:linear-gradient(90deg,#f6c9dd,#d9c6fb,#c0e0fb);--fx-tag-tx:#1d1430;--fx-name:linear-gradient(90deg,#fff2f8,#e8daff 35%,#d6ecff 70%,#fff4d6);--fx-badge:linear-gradient(135deg,rgba(220,188,251,.2),rgba(220,188,251,.06));--fx-badge-tx:#ecdfff;--fx-badge-bd:rgba(220,188,251,.34);--fx-acc:#b7a9cf;--fx-game:#d2c9e2;--fx-chip:rgba(220,188,251,.06);--fx-chip-bd:rgba(220,188,251,.17);--fx-chip-tx:#a99dc0;--fx-num:#fbf6ff;--fx-id:#e2cdfd;--fx-btn:linear-gradient(90deg,#f6c9dd,#d9c6fb,#c0e0fb);--fx-btn-tx:#1d1430}' +
      // التطور مع كل لقب: كل مستوى يضيف على اللي قبله.
      // 2+: حلقة ثانية رفيعة حول الصورة.
      '.agp-live-card.fx-champion:not(.ct-1) .agp-live-avatar::after{content:"";position:absolute;inset:-8px;border-radius:50%;border:1px solid var(--fx-a);opacity:.4;pointer-events:none}' +
      // 3+: الإطار المتدرّج يتحرك ببطء.
      '.agp-live-card.fx-champion.ct-3,.agp-live-card.fx-champion.ct-4,.agp-live-card.fx-champion.ct-5{background-size:100% 100%,300% 300%;animation:agpFxBorder 7s ease-in-out infinite alternate}' +
      // 4+: نجوم صغيرة تلمع على البطاقة.
      '.agp-live-sparkles{position:absolute;inset:0;z-index:-1;pointer-events:none}' +
      '.agp-live-sparkles i{position:absolute;width:7px;height:7px;background:var(--fx-a);clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);opacity:0;animation:agpFxTwinkle 3.2s ease-in-out infinite}' +
      '.agp-live-sparkles i:nth-child(1){top:14%;left:8%}' +
      '.agp-live-sparkles i:nth-child(2){top:70%;left:20%;animation-delay:.8s;width:5px;height:5px}' +
      '.agp-live-sparkles i:nth-child(3){top:22%;left:46%;animation-delay:1.6s;width:5px;height:5px}' +
      '.agp-live-sparkles i:nth-child(4){top:80%;left:58%;animation-delay:2.2s}' +
      '.agp-live-sparkles i:nth-child(5){top:10%;left:72%;animation-delay:1.1s;width:6px;height:6px}' +
      // 5+: تاج فوق الصورة يطفو بهدوء.
      '.agp-live-crown{position:absolute;top:-17px;left:50%;z-index:2;width:22px;height:16px;transform:translateX(-50%);color:var(--fx-a);filter:drop-shadow(0 2px 6px var(--fx-glow-h));animation:agpFxFloat 3s ease-in-out infinite}' +
      '.agp-live-crown svg{display:block;width:100%;height:100%}' +
      '.agp-live-card.fx-champion.ct-5 .agp-live-avatar{margin-top:6px}' +
      // صف الشارات (التصميم + بطل التوب لو اجتمعوا).
      '.agp-live-badges{align-self:flex-start;display:flex;flex-wrap:wrap;gap:5px;margin-bottom:2px}' +
      '.agp-live-badge-count{direction:ltr;unicode-bidi:isolate;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-weight:800;opacity:.85;margin-inline-start:2px}' +
      // شارة بطل التوب على بطاقة لها تصميم يدوي (المؤسس/رسمي…): ذهبية هادية ثابتة.
      '.agp-live-badge.champ-extra{color:#f3e1aa;background:linear-gradient(135deg,rgba(227,199,122,.2),rgba(227,199,122,.06));border-color:rgba(227,199,122,.36)}' +
      '@keyframes agpFxBorder{0%{background-position:0 0,0% 50%}100%{background-position:0 0,100% 50%}}' +
      '@keyframes agpFxTwinkle{0%,100%{opacity:0;transform:scale(.4) rotate(0)}50%{opacity:.75;transform:scale(1) rotate(45deg)}}' +
      '@keyframes agpFxFloat{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(-3px)}}' +
      '@keyframes agpLiveShine{0%,60%{left:-70%}100%{left:140%}}' +
      '@keyframes agpLiveSpin{to{transform:rotate(360deg)}}' +
      '@keyframes agpLiveDot{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.45;transform:scale(1.35)}}' +
      '@media (prefers-reduced-motion:reduce){.agp-live-head-dot{animation:none}.agp-live-card.fx::after{display:none}.agp-live-card.fx .agp-live-avatar::before{animation:none}.agp-live-card.fx-champion{animation:none!important}.agp-live-sparkles i{animation:none;opacity:.5}.agp-live-crown{animation:none}}';
    document.head.appendChild(st);
  }

  function arNum(n){ return String(n).replace(/[0-9]/g, function(d){ return '٠١٢٣٤٥٦٧٨٩'[d]; }); }

  var LIVE_ICON_EYE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>';
  var LIVE_ICON_GAME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 11h4M8 9v4M15 12h.01M18 10h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-3.96 3.43l-.7 4.9A2.5 2.5 0 0 0 6.6 15.2L8 13.5h8l1.4 1.7a2.5 2.5 0 0 0 4.56-1.87l-.7-4.9A4 4 0 0 0 17.3 5z"/></svg>';

  // s.kind: 'live' (يلعب الحين) | 'wait' (فاتح شاشة دعوة لعبة بثين وينتظر خصم) | 'idle' (فاضي بمكتبة الألعاب)
  var LIVE_JOIN_PAGES = { 'penalty': 'games/penalty/index.html?mode=versus', 'fastest-answer': 'games/fastest-answer/versus.html' };
  var LIVE_JOIN_ERRORS = { not_waiting: 'الستريمر طلع من شاشة الدعوة — جرّب غيره.', opponent_in_match: 'الستريمر بدأ مباراة مع غيرك.', you_in_match: 'عندك مباراة أو تجهيز جاري — خلّصه أول.', not_eligible: 'لازم حساب ستريمر مربوط بتيك توك.', self: 'هذا أنت 🙂' };
  function joinFromLibrary(s){
    var A = window.AGPAuth;
    if (!A || !A.getToken || !A.getToken()) { location.href = 'login.html'; return; }
    A.challengeJoin(s.customId, s.game).then(function(r){
      if (r && r.success) { location.href = LIVE_JOIN_PAGES[s.game] || 'challenge.html'; return; }
      alert(LIVE_JOIN_ERRORS[r && r.error] || 'تعذّر الدخول، حاول مرة ثانية.');
      fetchLiveStreams();
    }).catch(function(){ alert('تعذّر الاتصال، حاول مرة ثانية.'); });
  }

  // التصاميم المميزة — نفس مفاتيح STYLES بـbackend/live-cards/live-card-styles-service.js.
  var LIVE_FX = {
    founder: { label: 'المؤسس', icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 8l4.5 3.5L12 5l4.5 6.5L21 8l-1.8 10H4.8z"/><rect x="5" y="19.5" width="14" height="2" rx="1"/></svg>' },
    platform: { label: 'رسمي', verified: true, icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.3z"/></svg>' },
    vip: { label: 'مميز', icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4 6.1 20.5l1.2-6.5L2.5 9.4l6.6-.9z"/></svg>' },
    diamond: { label: 'ألماسي', icon: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 3h12l4 6-10 12L2 9z"/></svg>' }
  };
  // بطل التوب (المركز الأول بتصنيف الاستريمرز الأسبوعي) — المستوى = عدد الألقاب (حد أعلى 5).
  // العدد من السيرفر (champion — backend/live-cards/champions-service.js).
  var CHAMP_TIERS = ['', 'برونزي', 'فضي', 'ذهبي', 'بلاتيني', 'أسطوري'];
  var LIVE_ICON_TROPHY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 3h10v2h3.5v2.5A4.5 4.5 0 0 1 16.6 12 5.5 5.5 0 0 1 13 14.8V17h3v4H8v-4h3v-2.2A5.5 5.5 0 0 1 7.4 12 4.5 4.5 0 0 1 3.5 7.5V5H7zm10 4v3.2A2.5 2.5 0 0 0 18.5 7.5V7zM7 7H5.5v.5A2.5 2.5 0 0 0 7 10.2z"/></svg>';
  var LIVE_ICON_CROWN = '<svg viewBox="0 0 24 18" fill="currentColor" aria-hidden="true"><path d="M2 4l5.5 4.5L12 1l4.5 7.5L22 4l-2 11H4z"/><rect x="4" y="15.5" width="16" height="2.5" rx="1.2"/></svg>';
  // نص الشارة يوضح إنه من التصنيف الأسبوعي: «توب 1 أسبوعي · ذهبي ×3».
  function champLabel(n){ return 'توب 1 أسبوعي · ' + CHAMP_TIERS[n]; }
  function champTitle(c){ return 'أخذ المركز الأول بتصنيف الاستريمرز الأسبوعي ' + (c === 1 ? 'مرة وحدة' : c === 2 ? 'مرتين' : c + ' مرات'); }
  function buildBadge(icon, label, count, extraClass){
    var b = document.createElement('span');
    b.className = 'agp-live-badge' + (extraClass ? ' ' + extraClass : '');
    b.innerHTML = icon;
    b.appendChild(document.createTextNode(label));
    if (count) {
      var c = document.createElement('span');
      c.className = 'agp-live-badge-count';
      c.textContent = '×' + count;
      b.appendChild(c);
    }
    return b;
  }

  // أيقونة ID بالبطاقات المميزة (بطاقة هوية).
  var LIVE_ICON_ID = '<svg class="agp-live-id-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-label="ID"><rect x="2.5" y="5" width="19" height="14" rx="3"/><circle cx="8.5" cy="11" r="2.2"/><path d="M5.5 16c.6-1.5 1.7-2.2 3-2.2s2.4.7 3 2.2M14 10h4.5M14 13.5h3"/></svg>';
  // علامة التوثيق جنب اسم الحساب الرسمي (مثل علامة التوثيق بالمنصات).
  var LIVE_VERIFIED = '<svg class="agp-live-verified" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.2 3 1.2 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.2-3-1.2-3 2.8-1.6.9-3.1 3.2.3z"/><path d="M8.3 12.2l2.5 2.5 4.9-5" fill="none" stroke="#0d0a1a" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  var LIVE_ICON_MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
  var LIVE_ICON_SPONSOR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12v8H4v-8M2.5 7.5h19V12h-19zM12 20V7.5M12 7.5H8.2a2.3 2.3 0 1 1 0-4.5c2.3 0 3.8 4.5 3.8 4.5zM12 7.5h3.8a2.3 2.3 0 1 0 0-4.5c-2.3 0-3.8 4.5-3.8 4.5z"/></svg>';
  function buildCredit(icon, label, value){
    var row = document.createElement('div');
    row.className = 'agp-live-credit';
    row.innerHTML = icon;
    row.appendChild(document.createTextNode(label + ' '));
    var b = document.createElement('b');
    b.textContent = value;
    row.appendChild(b);
    return row;
  }

  function buildLiveCard(s){
    var kind = s.kind || 'live';
    var card = document.createElement('a');
    card.className = 'agp-live-card' + (kind === 'live' ? '' : ' ' + kind);
    var champ = kind === 'live' && s.champion > 0 ? Number(s.champion) : 0;
    var champTier = Math.min(champ, 5);
    // التصميم اليدوي من الأدمن له الأولوية؛ بدونه بطل التوب ياخذ بطاقة «بطل» حسب عدد ألقابه.
    var fxCard = kind === 'live' && s.card && LIVE_FX[s.card.style] ? s.card : (champ ? { style: 'champion' } : null);
    var fx = fxCard ? (fxCard.style === 'champion' ? { label: champLabel(champTier), icon: LIVE_ICON_TROPHY, count: champ } : LIVE_FX[fxCard.style]) : null;
    if (fx) card.className += ' fx fx-' + fxCard.style + (fxCard.style === 'champion' ? ' ct-' + champTier : '');
    if (kind === 'live') {
      // الضغط يفتح بث الستريمر نفسه في تيك توك (تبويب جديد).
      card.href = 'https://www.tiktok.com/@' + encodeURIComponent(s.tiktok) + '/live';
      card.target = '_blank';
      card.rel = 'noopener noreferrer';
    } else if (kind === 'wait') {
      card.href = '#';
      card.addEventListener('click', function(e){ e.preventDefault(); joinFromLibrary(s); });
    } else {
      card.href = 'challenge.html';
    }

    var av = document.createElement('div');
    av.className = 'agp-live-avatar';
    function fallbackAvatar(){
      var ph = document.createElement('span');
      ph.className = 'agp-live-avatar-ph';
      ph.textContent = String(s.name || s.tiktok || '?').charAt(0).toUpperCase();
      return ph;
    }
    // الصورة من السيرفر (المخزَّنة بالحساب) بدل رابط تيك توك اللي تنتهي
    // صلاحيته — ولو ما فيه صورة (404) يظهر أول حرف من الاسم.
    var apiBase = (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    var img = document.createElement('img');
    img.className = 'agp-live-avatar-img';
    img.src = apiBase + '/api/public/streamer-avatar?u=' + encodeURIComponent(s.tiktok);
    img.alt = '';
    img.decoding = 'async';
    img.onerror = function(){ img.replaceWith(fallbackAvatar()); };
    av.appendChild(img);
    var tag = document.createElement('span');
    tag.className = 'agp-live-tag';
    tag.textContent = kind === 'wait' ? 'ينتظر' : kind === 'idle' ? 'فاضي' : 'LIVE';
    av.appendChild(tag);

    var info = document.createElement('div');
    info.className = 'agp-live-info';
    var name = document.createElement('div');
    name.className = 'agp-live-name';
    name.textContent = s.name || s.tiktok;
    var acc = document.createElement('div');
    acc.className = 'agp-live-acc';
    acc.textContent = '@' + s.tiktok;
    var game = document.createElement('div');
    game.className = 'agp-live-game';
    game.innerHTML = LIVE_ICON_GAME;
    game.appendChild(document.createTextNode(kind === 'wait' ? (s.gameName || 'لعبة') + ' · ينتظر خصم' : kind === 'idle' ? 'فاتح مكتبة الألعاب' : (s.gameName || 'لعبة')));
    var meta = document.createElement('div');
    meta.className = 'agp-live-meta';
    var viewers = document.createElement('span');
    viewers.className = 'agp-live-chip agp-live-chip-viewers';
    viewers.innerHTML = LIVE_ICON_EYE;
    var count = document.createElement('b');
    // عدد المشاهدين بالأرقام الإنجليزية.
    count.textContent = typeof s.viewers === 'number' ? Number(s.viewers).toLocaleString('en') : '—';
    viewers.appendChild(count);
    viewers.appendChild(document.createTextNode(' مشاهد'));
    var idChip = document.createElement('span');
    idChip.className = 'agp-live-chip agp-live-chip-id';
    if (fx) {
      // بالبطاقات المميزة: أيقونة بطاقة هوية بدل «ID:»، بلون التصميم.
      idChip.innerHTML = LIVE_ICON_ID;
      var idVal = document.createElement('span');
      idVal.className = 'agp-live-id-v';
      idVal.textContent = s.customId;
      idChip.appendChild(idVal);
    } else {
      idChip.textContent = 'ID: ' + s.customId;
    }
    if (kind === 'live') meta.appendChild(viewers);
    meta.appendChild(idChip);

    // زر «شاهد» — البطاقة كلها رابط للبث، فالزر عنصر شكلي داخلها (ما نحط رابط داخل رابط).
    var top = document.createElement('div');
    top.className = 'agp-live-top';
    var watch = document.createElement('span');
    watch.className = 'agp-live-watch';
    watch.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
    watch.appendChild(document.createTextNode(kind === 'wait' ? 'دخول مباشر' : kind === 'idle' ? 'تحدّاه' : 'شاهد'));
    if (fx) {
      // الاسم + الشارة بحاوية وحدة عشان الاسم الطويل يتقص (…) والشارة تبقى ظاهرة.
      var nameWrap = document.createElement('div');
      nameWrap.className = 'agp-live-namewrap';
      var badges = document.createElement('div');
      badges.className = 'agp-live-badges';
      var mainBadge = buildBadge(fx.icon, fx.label, fx.count);
      if (fxCard.style === 'champion') mainBadge.title = champTitle(champ);
      badges.appendChild(mainBadge);
      // صاحب تصميم يدوي وهو بطل توب بعد: شارة البطل جنب شارة التصميم.
      if (champ && fxCard.style !== 'champion') {
        var extra = buildBadge(LIVE_ICON_TROPHY, champLabel(champTier), champ, 'champ-extra');
        extra.title = champTitle(champ);
        badges.appendChild(extra);
      }
      nameWrap.appendChild(name);
      if (fx.verified) nameWrap.insertAdjacentHTML('beforeend', LIVE_VERIFIED);
      top.appendChild(nameWrap);
      // الشارات بسطر مستقل فوق الاسم — لو كانت بنفس سطر الاسم تقصّه وتغطيه.
      info.appendChild(badges);
    } else {
      top.appendChild(name);
    }
    top.appendChild(watch);
    info.appendChild(top);
    info.appendChild(acc);
    info.appendChild(game);
    info.appendChild(meta);
    // «يقدّم البث» و«البث برعاية» — سطرين اختياريين يكتبهم الأدمن للبطاقة المميزة.
    if (fx && (fxCard.host || fxCard.sponsor)) {
      var credits = document.createElement('div');
      credits.className = 'agp-live-credits';
      if (fxCard.host) credits.appendChild(buildCredit(LIVE_ICON_MIC, 'يقدّم البث:', fxCard.host));
      if (fxCard.sponsor) credits.appendChild(buildCredit(LIVE_ICON_SPONSOR, 'البث برعاية', fxCard.sponsor));
      info.appendChild(credits);
    }
    if (fxCard && fxCard.style === 'champion') {
      if (champTier >= 4) {
        var sp = document.createElement('span');
        sp.className = 'agp-live-sparkles';
        sp.setAttribute('aria-hidden', 'true');
        sp.innerHTML = '<i></i><i></i><i></i><i></i><i></i>';
        card.appendChild(sp);
      }
      if (champTier >= 5) {
        var crown = document.createElement('span');
        crown.className = 'agp-live-crown';
        crown.innerHTML = LIVE_ICON_CROWN;
        av.appendChild(crown);
      }
    }
    card.appendChild(av);
    card.appendChild(info);
    return card;
  }

  function buildLiveStreamsSection(){
    var section = document.createElement('div');
    section.className = 'agp-live-streams';
    section.setAttribute('data-live-streams', '1');
    section.hidden = true;
    var head = document.createElement('div');
    head.className = 'agp-live-head';
    head.innerHTML = '<span class="agp-live-head-dot"></span><span>بثوث شغّالة الآن</span><span class="agp-live-head-count" data-live-count></span>' +
      '<span class="agp-live-head-viewers" data-live-viewers hidden title="إجمالي المشاهدين بكل البثوث"></span>' +
      '<div class="agp-live-ctl">' +
        '<button type="button" class="agp-live-btn icon" data-live-nav="prev" aria-label="السابق">' + LIVE_ICON_RIGHT + '</button>' +
        '<button type="button" class="agp-live-btn icon" data-live-nav="next" aria-label="التالي">' + LIVE_ICON_LEFT + '</button>' +
        '<button type="button" class="agp-live-btn" data-live-pause aria-pressed="false"></button>' +
        '<button type="button" class="agp-live-btn" data-live-all aria-expanded="false"></button>' +
      '</div>';
    var grid = document.createElement('div');
    grid.className = 'agp-live-marquee';
    grid.setAttribute('data-live-scroller', '1');
    grid.setAttribute('aria-label', 'بثوث شغّالة الآن — اسحب للتنقّل');
    var track = document.createElement('div');
    track.className = 'agp-live-track';
    track.setAttribute('data-live-track', '1');
    grid.appendChild(track);
    section.appendChild(head);
    section.appendChild(grid);
    initLiveScroller(section);
    return section;
  }

  /* حركة الشريط: تمرير تلقائي ناعم (~٤٠ بكسل/ث) بـrequestAnimationFrame على
     سكرول حقيقي — فالمستخدم يقدر يسحبه بإصبعه أو بالماوس أو عجلة الماوس.
     يوقف مؤقتاً مع اللمس/السحب/المرور بالماوس ويرجع بعد ثواني، و«إيقاف الحركة»
     يثبّته (ويتذكّر الاختيار بالجهاز). «عرض الكل» يحوّله لشبكة بدون حركة. */
  var LIVE_ICON_RIGHT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
  var LIVE_ICON_LEFT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 6-6 6 6 6"/></svg>';
  var LIVE_ICON_PAUSE = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2"/><rect x="14" y="5" width="4" height="14" rx="1.2"/></svg>';
  var LIVE_ICON_PLAY = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>';
  var LIVE_ICON_GRID = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/></svg>';
  var LIVE_PAUSE_KEY = 'agp_live_strip_paused';
  function livePausedPref(){ try { return localStorage.getItem(LIVE_PAUSE_KEY) === '1'; } catch (e) { return false; } }

  function initLiveScroller(section){
    var sc = section.querySelector('[data-live-scroller]');
    var pauseBtn = section.querySelector('[data-live-pause]');
    var allBtn = section.querySelector('[data-live-all]');
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var st = { pinned: livePausedPref() || reduce, hold: 0, hover: false, pos: 0, last: 0, setAt: -1, all: false };
    section.__live = st;
    var SPEED = 40; // بكسل بالثانية

    function paintButtons(){
      pauseBtn.setAttribute('aria-pressed', st.pinned ? 'true' : 'false');
      pauseBtn.innerHTML = (st.pinned ? LIVE_ICON_PLAY : LIVE_ICON_PAUSE) + '<span class="agp-live-btn-t">' + (st.pinned ? 'تشغيل الحركة' : 'إيقاف الحركة') + '</span>';
      pauseBtn.setAttribute('aria-label', st.pinned ? 'تشغيل حركة الشريط' : 'إيقاف حركة الشريط');
      allBtn.setAttribute('aria-expanded', st.all ? 'true' : 'false');
      allBtn.innerHTML = LIVE_ICON_GRID + '<span class="agp-live-btn-t">' + (st.all ? 'عرض أقل' : 'عرض الكل') + '</span>';
      allBtn.setAttribute('aria-label', st.all ? 'رجوع للشريط' : 'عرض كل البثوث');
    }
    paintButtons();
    pauseBtn.addEventListener('click', function(){
      st.pinned = !st.pinned;
      try { localStorage.setItem(LIVE_PAUSE_KEY, st.pinned ? '1' : '0'); } catch (e) {}
      paintButtons();
    });
    allBtn.addEventListener('click', function(){
      st.all = !st.all;
      section.classList.toggle('all', st.all);
      paintButtons();
      if (!st.all) syncPos();
    });
    // يوقف مؤقتاً (اللمس/السحب/الأسهم) ويرجع بعد ٤ ثواني
    function holdFor(ms){ st.hold = Math.max(st.hold, performance.now() + ms); }
    function half(){ return sc.scrollWidth / 2; }
    function syncPos(){ st.pos = sc.scrollLeft; }
    function step(dir){
      var card = sc.querySelector('.agp-live-card');
      var w = card ? card.getBoundingClientRect().width + 14 : 340;
      holdFor(4000);
      sc.scrollBy({ left: dir * w, behavior: 'smooth' });
    }
    section.querySelector('[data-live-nav="prev"]').addEventListener('click', function(){ step(1); });
    section.querySelector('[data-live-nav="next"]').addEventListener('click', function(){ step(-1); });

    sc.addEventListener('mouseenter', function(){ st.hover = true; });
    sc.addEventListener('mouseleave', function(){ st.hover = false; });
    sc.addEventListener('focusin', function(){ holdFor(6000); });
    sc.addEventListener('touchstart', function(){ holdFor(4000); }, { passive: true });
    sc.addEventListener('wheel', function(){ holdFor(4000); }, { passive: true });
    // تمرير من المستخدم (مو من الحركة التلقائية): نحدّث الموضع ونوقف شوي
    sc.addEventListener('scroll', function(){
      if (Math.abs(sc.scrollLeft - st.setAt) > 2) { syncPos(); if (performance.now() > st.hold - 3500) holdFor(4000); }
    }, { passive: true });

    // سحب بالماوس (الجوال يسحب طبيعي بالإصبع)
    var drag = null;
    sc.addEventListener('pointerdown', function(e){
      if (e.pointerType !== 'mouse' || e.button !== 0 || st.all) return;
      drag = { x: e.clientX, left: sc.scrollLeft, moved: false };
    });
    window.addEventListener('pointermove', function(e){
      if (!drag) return;
      var dx = e.clientX - drag.x;
      if (!drag.moved && Math.abs(dx) > 5) { drag.moved = true; sc.classList.add('dragging'); }
      if (drag.moved) { sc.scrollLeft = drag.left - dx; holdFor(4000); }
    });
    window.addEventListener('pointerup', function(){
      if (!drag) return;
      var moved = drag.moved; drag = null;
      // نخلي كلاس السحب لحظة عشان الضغطة ما تفتح البطاقة بعد السحب
      setTimeout(function(){ sc.classList.remove('dragging'); }, moved ? 60 : 0);
    });

    function tick(now){
      if (!section.isConnected) return; // القالب أعاد بناء الصفحة — النسخة الجديدة لها حلقتها
      var dt = st.last ? Math.min(64, now - st.last) : 0;
      st.last = now;
      var moving = !st.pinned && !st.all && !st.hover && now > st.hold && !document.hidden && sc.scrollWidth > sc.clientWidth + 4;
      if (moving) {
        // يتحرك لليمين (نفس اتجاه الشريط القديم)، ولما يوصل البداية يقفز نص المسافة (النسختين متطابقة)
        st.pos -= SPEED * dt / 1000;
        if (st.pos <= 0) st.pos += half();
        sc.scrollLeft = st.pos;
        st.setAt = sc.scrollLeft;
      } else if (!drag) {
        // ما نخلي المستخدم يوصل الطرف: نلف بنفس الطريقة لو قرّب منه
        var h = half();
        if (h > 0 && sc.scrollLeft < 4) { sc.scrollLeft += h; syncPos(); st.setAt = sc.scrollLeft; }
        else if (h > 0 && sc.scrollLeft > h * 2 - sc.clientWidth - 4) { sc.scrollLeft -= h; syncPos(); st.setAt = sc.scrollLeft; }
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function renderLiveStreams(streams){
    var section = document.querySelector('[data-live-streams]');
    if (!section) return;
    // نعيد البناء فقط لو تغيّرت البيانات — عشان الشريط ما يرجع لأوله كل تحديث.
    var sig = JSON.stringify(streams || []);
    if (section.getAttribute('data-live-sig') === sig) return;
    section.setAttribute('data-live-sig', sig);
    var track = section.querySelector('[data-live-track]');
    track.innerHTML = '';
    var list = streams || [];
    // شريط متحرك بلا نهاية: نكرّر البطاقات لين تغطي عرض الشاشة، ثم نسخة
    // ثانية مطابقة، والحركة تزيح نص المسافة (-50%) وترجع بلا قفزة ملحوظة.
    var copies = list.length ? Math.max(1, Math.ceil(Math.max(window.innerWidth, 1600) / (list.length * 344))) : 0;
    for (var half = 0; half < 2; half++) {
      for (var c = 0; c < copies; c++) {
        list.forEach(function(s){
          var card = buildLiveCard(s);
          if (half || c) { card.setAttribute('aria-hidden', 'true'); card.tabIndex = -1; card.setAttribute('data-live-dup', '1'); }
          track.appendChild(card);
        });
      }
    }
    // نبدأ من نص المسافة عشان الحركة (لليمين) والسحب بالاتجاهين يلقون بطاقات
    var sc = section.querySelector('[data-live-scroller]');
    requestAnimationFrame(function(){
      if (!sc) return;
      sc.scrollLeft = sc.scrollWidth / 2;
      if (section.__live) { section.__live.pos = sc.scrollLeft; section.__live.setAt = sc.scrollLeft; }
    });
    section.querySelector('[data-live-count]').textContent = streams && streams.length ? '(' + arNum(streams.length) + ')' : '';
    // إجمالي المشاهدين = مجموع مشاهدين البثوث اللي عندها عدد (المنتظرين/الفاضيين بدون عدد ما ينحسبون).
    // بالأرقام الإنجليزية مثل عدد المشاهدين على البطاقات.
    var totalViewers = 0, hasViewers = false;
    list.forEach(function(s){ if (typeof s.viewers === 'number') { totalViewers += s.viewers; hasViewers = true; } });
    var tv = section.querySelector('[data-live-viewers]');
    tv.innerHTML = LIVE_ICON_EYE;
    tv.appendChild(document.createTextNode(totalViewers.toLocaleString('en') + ' مشاهد'));
    tv.hidden = !hasViewers;
    section.hidden = !(streams && streams.length);
  }

  function fetchLiveStreams(){
    if (document.hidden || !window.fetch) return;
    var base = (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com';
    var lobby = window.AGPChallengeLobby ? window.AGPChallengeLobby.load() : Promise.resolve({ waiting: [], idle: [] });
    Promise.all([
      fetch(base + '/api/public/live-streams').then(function(res){ return res.json(); }).catch(function(){ return null; }),
      lobby
    ]).then(function(all){
      var d = all[0], L = all[1] || {};
      if (!(d && d.success) && !(L.waiting || []).length && !(L.idle || []).length) return;
      // ينتظرون خصم أول، بعدهم اللي يلعبون، وآخر شي الفاضين بالمكتبة (بدون تكرار نفس الستريمر).
      var seen = {}, list = [];
      function add(arr, kind){ (arr || []).forEach(function(x){ var k = String(x.tiktok || '').toLowerCase(); if (!k || seen[k]) return; seen[k] = true; list.push(Object.assign({}, x, { kind: kind })); }); }
      add(L.waiting, 'wait'); add(d && d.streams, 'live'); add(L.idle, 'idle');
      renderLiveStreams(list);
    }).catch(function(){});
  }

  function mountLiveStreams(){
    if (document.querySelector('[data-live-streams]')) return true;
    var host = document.querySelector('[data-live-host]');
    if (!host) return false;
    ensureLiveStreamsStyles();
    host.appendChild(buildLiveStreamsSection());
    fetchLiveStreams();
    return true;
  }

  // القالب يعيد بناء الصفحة بعد التحميل — نعيد التركيب لو انمسح القسم.
  var __liveTries = 0;
  var __liveTimer = setInterval(function(){
    __liveTries++;
    mountLiveStreams();
    if (__liveTries >= 30) clearInterval(__liveTimer);
  }, 300);
  setInterval(function(){ if (mountLiveStreams()) fetchLiveStreams(); }, LIVE_STREAMS_POLL_MS);
  document.addEventListener('visibilitychange', function(){ if (!document.hidden) fetchLiveStreams(); });

})();
