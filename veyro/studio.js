/**
 * VEYRO — «شاشات البث» (veyro/index.html): محرر شاشات لـOBS وTikTok LIVE Studio
 * بهوية Veyro (من منظومة ألعاب أيمن). المذيع يسوي أكثر من شاشة، يرتّب فوق كل وحدة
 * الأدوات اللي يبيها، وينسخ رابطها (veyro/screen.html?k=<رمز>&v=<نسخة>) ويحطه بتطبيق البث.
 *
 * - يسار الشاشة قائمة جانبية تنطوي (أيقونات بس) وتنفتح (أيقونة + اسم):
 *   الرئيسية ← الشاشات ← أدوات البث (الأليرتات، التوب، الأهداف، الوعاء، النصوص،
 *   الأيقونات، الأشكال — كل أداة قسم) ← الطبقات ← الرابط والإعدادات.
 *   قسم الأداة يفتح المحرر ولوحته جنب القائمة، وفيها بطاقات بمعاينة حقيقية مصغّرة
 *   — الضغط على البطاقة يضيف الأداة. بالجوال القائمة درج، والأقسام شريط فوق المحرر.
 * - الرسم والبيانات كلها من js/agp-stream-overlay.js (وضع data-agp-screens):
 *   نفس الكود اللي يرسم الرابط، فالمعاينة = اللي يطلع بالبث.
 * - الشاشات بالسيرفر (backend/stats/stream-screens-service.js، /api/screens*)،
 *   وكل تعديل ينحفظ بعد لحظة، والرابط يتحدّث لحاله خلال ثواني.
 * - صفوف الإعدادات: العنوان يمين والتحكم يسار (قاعدة CLAUDE.md).
 */
(function () {
    'use strict';

    var O = window.AGPStreamOverlay;
    if (!O) return;

    var LAST_KEY = 'agp:obs-studio:last';
    var TEMPLATE = 'pc'; // 1920×1080 (أفقي) / 1080×1920 (عمودي)

    var app = document.getElementById('vy-app');
    var navEl = document.getElementById('vy-nav');
    var mtabs = document.getElementById('ob-mtabs');
    var homeBody = document.getElementById('vy-home-body');
    var screensBody = document.getElementById('vy-screens-body');
    var statsBody = document.getElementById('vy-stats-body');
    var statsUi = null;
    var userEl = document.getElementById('vy-user');
    var tipEl = document.getElementById('vy-tip');
    var mtitle = document.getElementById('vy-mtitle');
    var body = document.getElementById('ob-body');
    var panel = document.getElementById('ob-panel');
    var stage = document.getElementById('ob-stage');
    var frame = document.getElementById('ob-frame');
    var zoomBar = document.getElementById('ob-zoom');
    var chipsEl = document.getElementById('ob-screens');
    var savedEl = document.getElementById('ob-saved');
    var statusEl = document.getElementById('ob-status');
    var copyBtn = document.getElementById('ob-copy');
    var gate = document.getElementById('ob-gate');
    var gbox = document.getElementById('ob-gbox');
    var toastEl = document.getElementById('ob-toast');

    var UI = {
        text: '<path d="M4 4h16v4h-2V6h-5v12h2v2H9v-2h2V6H6v2H4z"/>',
        dollar: '<path d="M12 2a10 10 0 110 20 10 10 0 010-20zm.9 4.2h-1.8v1.4c-1.7.3-2.9 1.4-2.9 3 0 1.9 1.5 2.6 3.4 3.1 1.4.4 1.9.7 1.9 1.3 0 .6-.6 1-1.6 1-1.1 0-2.1-.4-2.9-1l-.9 1.6c.8.6 1.9 1 3 1.1v1.4h1.8v-1.4c1.8-.3 3-1.4 3-3.1 0-1.9-1.4-2.6-3.5-3.2-1.3-.4-1.8-.6-1.8-1.2 0-.5.5-.9 1.4-.9.9 0 1.8.3 2.5.8l.9-1.6c-.7-.5-1.6-.8-2.5-.9z"/>',
        speaker: '<path d="M3 9h4l5-4v14l-5-4H3zM15.5 8.5a5 5 0 010 7l-1.4-1.4a3 3 0 000-4.2zM18.4 5.6a9 9 0 010 12.8L17 17a7 7 0 000-9.9z"/>',
        note: '<path d="M20 3v12.5a3.5 3.5 0 11-2-3.16V7.3l-9 2.25v8.95A3.5 3.5 0 117 15.34V5.78a1 1 0 01.76-.97l11-2.75A1 1 0 0120 3z"/>',
        bars: '<path d="M3 13h4v8H3zM10 8h4v13h-4zM17 3h4v18h-4z"/>',
        shapes: '<path d="M3 3h9v9H3zM17.5 3a4.5 4.5 0 110 9 4.5 4.5 0 010-9zM12 13.5l5.5 8.5h-11z"/>',
        layers: '<path d="M12 2l10 5-10 5L2 7zM4.4 10.2L12 14l7.6-3.8L22 11.5l-10 5-10-5zm0 4.5L12 18.5l7.6-3.8L22 16l-10 5-10-5z"/>',
        gear: '<path d="M10 2h4l.6 3 2.4 1.4 2.9-1 2 3.4-2.3 2a7 7 0 010 2.4l2.3 2-2 3.4-2.9-1-2.4 1.4-.6 3h-4l-.6-3L7 17.8l-2.9 1-2-3.4 2.3-2a7 7 0 010-2.4l-2.3-2 2-3.4 2.9 1L9.4 5zM12 9a3 3 0 100 6 3 3 0 000-6z"/>',
        close: '<path d="M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z"/>',
        home: '<path d="M12 3l9 7.6V21h-6.5v-6h-5v6H3V10.6z"/>',
        screens: '<path d="M3 4h18a1 1 0 011 1v12a1 1 0 01-1 1h-7v2h3v2H7v-2h3v-2H3a1 1 0 01-1-1V5a1 1 0 011-1zm1 2v10h16V6z"/>',
        link: '<path d="M10.6 13.4a1 1 0 001.4 1.4l.1-.1a4 4 0 000-5.6L9.3 6.3a4 4 0 00-5.6 5.6l1.6 1.6 1.4-1.4-1.6-1.6a2 2 0 112.8-2.8l2.8 2.8a2 2 0 010 2.8zm2.8-2.8a1 1 0 00-1.4-1.4l-.1.1a4 4 0 000 5.6l2.8 2.8a4 4 0 005.6-5.6l-1.6-1.6-1.4 1.4 1.6 1.6a2 2 0 11-2.8 2.8l-2.8-2.8a2 2 0 010-2.8z"/>',
        copy: '<path d="M8 3h11a2 2 0 012 2v11h-2V5H8zM4 7h11a2 2 0 012 2v11a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2z"/>',
        edit: '<path d="M4 17.3V20h2.7L17.8 8.9l-2.7-2.7zM20.7 6a1 1 0 000-1.4l-1.3-1.3a1 1 0 00-1.4 0l-1.5 1.5 2.7 2.7z"/>',
        dup: '<path d="M7 7V3h14v14h-4v4H3V7zm2 0h8v8h2V5H9zm-4 2v10h10V9z"/>',
        trash: '<path d="M9 3h6l1 2h4v2H4V5h4zM6 9h12l-1 12H7z"/>',
        plus: '<path d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>',
        play: '<path d="M8 5v14l11-7z"/>',
        login: '<path d="M10 3h9a2 2 0 012 2v14a2 2 0 01-2 2h-9v-2h9V5h-9zm1.6 4.6L13 6.2 18.8 12 13 17.8l-1.4-1.4 3.4-3.4H3v-2h12z"/>',
        check: '<path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
        bolt2: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
        upload: '<path d="M11 15V6.8L7.4 10.4 6 9l6-6 6 6-1.4 1.4L13 6.8V15zM4 14h2v4h12v-4h2v6H4z"/>',
        pause: '<path d="M7 5h4v14H7zm6 0h4v14h-4z"/>',
        drop: '<path d="M17.7 3.3a2.4 2.4 0 013.4 3.4l-2.5 2.5 1 1-1.4 1.4-1-1-7.6 7.6c-.5.5-1 .7-1.6.8l-2.6.4-1.2 1.2-1.4-1.4 1.2-1.2.4-2.6c.1-.6.3-1.1.8-1.6l7.6-7.6-1-1L13.2 4l1 1zM8.4 15.6l7-7-1.4-1.4-7 7-.3 1.7z"/>',
        wand: '<path d="M14 2l1.1 2.9L18 6l-2.9 1.1L14 10l-1.1-2.9L10 6l2.9-1.1zM5 4l.7 1.8L7.5 6.5 5.7 7.2 5 9l-.7-1.8L2.5 6.5l1.8-.7zM16.6 10.6l1.4 1.4L6.4 23.6 5 22.2zM20 15l.7 1.8 1.8.7-1.8.7L20 20l-.7-1.8-1.8-.7 1.8-.7z"/>',
        library: '<path d="M3 4h4v16H3zM9 4h4v16H9zM15.4 4.9l3.9-1 3.7 15.6-3.9.9z"/>',
        video: '<path d="M3 5h13a1 1 0 011 1v3.5l4-2.5v10l-4-2.5V18a1 1 0 01-1 1H3a1 1 0 01-1-1V6a1 1 0 011-1z"/>'
    };
    function ic(name) { return O.ICON_SET[name] ? O.ICON_SET[name].p : UI[name]; }
    function svg(paths) { return '<svg viewBox="0 0 24 24" fill="currentColor" fill-rule="evenodd" aria-hidden="true">' + paths + '</svg>'; }

    var SECTIONS = [
        { key: 'library', label: 'مكتبتي', icon: 'library', title: 'مكتبتي', desc: 'أليرتاتك المحفوظة: ارفع الفيديو، فرّغ خلفيته، ويصير جاهز تستخدمه بأي شاشة.' },
        { key: 'alerts', label: 'الأليرتات', icon: 'bell', title: 'الأليرتات', desc: 'اختر أليرت من مكتبتك وحدد متى يشتغل: هدايا بعدد عملات، تكبيسات، دخولية شخص، اشتراك…' },
        { key: 'tops', label: 'التوب', icon: 'trophy', title: 'التوب', desc: 'أكثر المشاهدين تفاعلاً بالبث، يتحدّث لحاله.' },
        { key: 'goals', label: 'الأهداف', icon: 'bars', title: 'الأهداف والعدّادات', desc: 'هدف يتعبّى قدام المشاهدين، وعدّادات لأرقام البث.' },
        { key: 'donations', label: 'الدونيشن', icon: 'dollar', title: 'أليرتات الدونيشن', desc: 'الدعم المادي من Streamlabs (كريترز/دكان تب وغيره): اختر أليرت من مكتبتك لكل مبلغ، وحدد مكان اسم الداعم وصورته ومدته.' },
        { key: 'audio', label: 'الصوت', icon: 'speaker', title: 'الصوت', desc: 'قارئ يقرأ رسائل الشات بصوت، ومشغّل أغاني يشغّل اللي يطلبه المشاهدين بأمر بالشات.' },
        { key: 'jar', label: 'الوعاء', icon: 'gift', title: 'وعاء الهدايا', desc: 'وعاء يتعبّى بصور الهدايا اللي توصلك.' },
        { key: 'text', label: 'النصوص', icon: 'text', title: 'النصوص', desc: 'عناوين وجمل بخطوط عربية وتأثيرات وحركة.' },
        { key: 'icons', label: 'الأيقونات', icon: 'star', title: 'الأيقونات والملصقات', desc: 'أيقونات وإيموجي تزيّن فيها شاشتك.' },
        { key: 'shapes', label: 'الأشكال', icon: 'shapes', title: 'الأشكال', desc: 'لوحات وإطارات وشرائط تحط فوقها الأدوات.' },
        { sep: true },
        { key: 'layers', label: 'الطبقات', icon: 'layers', title: 'الطبقات', desc: 'كل عناصر الشاشة — فوق القائمة = فوق الشاشة.' },
        { key: 'screen', label: 'الرابط والإعدادات', icon: 'gear', title: 'الشاشة والرابط', desc: 'رابط الشاشة لتطبيق البث، والاتجاه والاسم.' }
    ];
    var TOOL_KEYS = ['library', 'alerts', 'donations', 'tops', 'goals', 'jar', 'audio', 'text', 'icons', 'shapes'];
    var VIEW_TITLES = { home: 'الرئيسية', screens: 'الشاشات', stats: 'إحصائيات البث', editor: 'أدوات البث' };
    var TYPE_NAMES = { text: 'نص', top: 'توب', goal: 'هدف', counter: 'عدّادات', jar: 'وعاء الهدايا', alert: 'أليرت', icon: 'أيقونة', shape: 'شكل', tts: 'القارئ الصوتي', music: 'مشغّل الأغاني', lastdonation: 'آخر دعم' };
    var TYPE_ICONS = { text: 'text', top: 'trophy', goal: 'bars', counter: 'bars', jar: 'gift', alert: 'bell', icon: 'star', shape: 'shapes', tts: 'speaker', music: 'note', lastdonation: 'dollar' };
    var PREVIEWS = [
        { key: 'checker', label: 'شفاف' },
        { key: 'dark', label: 'داكن' },
        { key: 'light', label: 'فاتح' },
        { key: 'green', label: 'كروما' },
        { key: 'roulette', label: 'لعبة', img: '../elimination-roulette-cover.png' }
    ];

    var TOOLS = {
        tops: [
            // كل تصميم أداة وحدة: يختار من داخلها («التوب») الداعمين أو المكبّسين أو الاثنين أو الكل،
            // وأكثر من واحد يتبدّلون («مدة التبديل» و«حركة التبديل»). الافتراضي: الاثنين.
            { label: 'العرش — جناح الملاك', sub: 'توب 3 — تختار من داخل: الداعمين أو المكبّسين أو الاثنين', type: 'top', opts: { section: 'gifters' }, set: { design: 'throne', sections: ['gifters', 'likers'], top: 3, title: '', palette: 'medal', frame: 'angel', frameColor: 'original', cycle: 10 } },
            { label: 'العرش — الحصان المجنح', sub: 'توب 3 — تختار من داخل: الداعمين أو المكبّسين أو الاثنين', type: 'top', opts: { section: 'gifters' }, set: { design: 'throne', sections: ['gifters', 'likers'], top: 3, title: '', palette: 'medal', frame: 'pegasus', frameColor: 'original', cycle: 10 } },
            { label: 'العرش الكريستالي', sub: 'لمعة ضوء تمر على الإطار — تختار من داخل: الداعمين أو المكبّسين أو الاثنين', type: 'top', opts: { section: 'gifters' }, set: { design: 'throne', sections: ['gifters', 'likers'], top: 3, title: '', palette: 'medal', frame: 'crystal', frameColor: 'original', cycle: 10 } },
            { label: 'عرش الغبار الذهبي', sub: 'مذنّبين ضوء يلفّون حول الصورة بغبار لامع — تختار من داخل: الداعمين أو المكبّسين أو الاثنين', type: 'top', opts: { section: 'gifters' }, set: { design: 'throne', sections: ['gifters', 'likers'], top: 3, title: '', palette: 'medal', frame: 'stardust', frameColor: 'original', cycle: 10 } },
            { label: 'عرش الفراشات', sub: 'حلقة ضوء وفراشات ترفرف — تختار من داخل: الداعمين أو المكبّسين أو الاثنين', type: 'top', opts: { section: 'gifters' }, set: { design: 'throne', sections: ['gifters', 'likers'], top: 3, title: '', palette: 'medal', frame: 'butterfly', frameColor: 'original', cycle: 10 } },
            { label: 'القائمة', sub: 'لين توب 10 بطاقات تحت بعض — تختار من داخل وش تعرض', type: 'top', opts: { section: 'gifters' }, set: { design: 'stack', sections: ['gifters', 'likers'], top: 10, title: '', palette: 'medal', frame: 'ring', frameColor: 'original', cycle: 10 } },
            // الدونيشن (Streamlabs): التوب وآخر داعم والهدف — الأليرتات بقسم «الدونيشن»
            { label: 'هدف الدونيشن', sub: 'شريط يتعبّى بالدولار', type: 'goal', set: { metric: 'donations', title: 'هدف الدعم', target: 100, design: 'bar', color: '#ffd54a' } },
            { label: 'هدف الدونيشن — دائرة', sub: 'نسبة الهدف بدائرة', type: 'goal', set: { metric: 'donations', title: 'هدف الدعم', target: 100, design: 'ring', color: '#ffd54a' } },
            { label: 'آخر داعم', sub: 'آخر داعم ومبلغه — يتحدّث مع كل دعم', type: 'lastdonation' },
            { label: 'توب الدونيشن', sub: 'العرش الكريستالي — أعلى 3 داعمين بالدولار', type: 'top', opts: { section: 'donors' }, set: { design: 'throne', sections: ['donors'], top: 3, title: '', palette: 'medal', frame: 'crystal', frameColor: 'original', cycle: 10 } },
            { label: 'قائمة الدونيشن', sub: 'لين توب 10 بالدولار', type: 'top', opts: { section: 'donors' }, set: { design: 'stack', sections: ['donors'], top: 10, title: '', palette: 'medal', frame: 'ring', frameColor: 'original', cycle: 10 } }
        ],
        goals: [
            { label: 'هدف التكبيسات', sub: 'شريط يتعبّى', type: 'goal' },
            { label: 'هدف الماس', sub: 'دائرة', type: 'goal', set: { metric: 'diamonds', title: 'هدف الماس', target: 1000, design: 'ring', color: '#4dd8ff' } },
            { label: 'هدف المتابعين', sub: 'شريط', type: 'goal', set: { metric: 'follows', title: 'هدف المتابعين', target: 100, color: '#7cff6b' } },
            { label: 'عدّادات كبسولات', sub: 'تكبيسات وماس ومتابعين', type: 'counter' },
            { label: 'أرقام كبيرة', sub: 'للزاوية', type: 'counter', set: { design: 'big', metrics: ['likes', 'diamonds'] } },
            { label: 'قائمة أرقام', sub: 'تحت بعض', type: 'counter', set: { design: 'stack', metrics: ['likes', 'diamonds', 'follows', 'shares'] } }
        ],
        audio: [
            { label: 'القارئ الصوتي', sub: 'يقرأ رسائل الشات بصوت عالي، رسالة ورى رسالة', type: 'tts', at: [0.12, 0.85] },
            { label: 'مشغّل الأغاني', sub: 'المشاهد يكتب «!تشغيل» واسم الأغنية وتشتغل', type: 'music', at: [0.85, 0.12] }
        ],
        jar: [
            { label: 'وعاء الهدايا', sub: 'صور الهدايا تطيح فيه وتتكدّس، وتحته مجموع الماس', type: 'jar' },
            { label: 'كرة القمر', sub: 'سائل يتموّج ويتعبّى حسب الدعم', type: 'goal', set: { design: 'orb', metric: 'diamonds', title: 'هدف الدعم', target: 5000, autoNext: true, palette: 'lavender', speed: 'normal', bubbles: true, showNums: true, showPct: false, size: 3.4, color: '#a68bff' } }
        ],
        text: [
            { label: 'عنوان ذهبي', type: 'text', set: { text: 'حياكم الله', style: 'gold', font: 'lalezar', size: 9 } },
            { label: 'نيون', type: 'text', set: { text: 'LIVE', style: 'neon', font: 'changa', color: '#4dd8ff', size: 8, anim: 'glow' } },
            { label: 'بخلفية', type: 'text', set: { text: 'تابعني 💜', style: 'pill', font: 'cairo', size: 5 } },
            { label: 'نار', type: 'text', set: { text: 'تحدي اليوم', style: 'fire', font: 'cairo', size: 7 } },
            { label: 'زجاجي', type: 'text', set: { text: 'اكتب سؤالك بالشات', style: 'glass', font: 'tajawal', size: 4.5 } },
            { label: 'نص عادي', type: 'text', set: { text: 'اكتب نصك هنا', style: 'outline', size: 6 } }
        ],
        shapes: [
            { label: 'لوحة زجاجية', sub: 'خلفية للأدوات', type: 'shape', opts: { shape: 'round', fill: 'glass', w: 60, h: 36 } },
            { label: 'شريط سفلي', sub: 'بعرض الشاشة', type: 'shape', opts: { shape: 'rect', fill: 'gradient', w: 178, h: 12, color: '#7a3fd4' }, at: [0.5, 0.92] },
            { label: 'إطار نيون', sub: 'حول الكاميرا', type: 'shape', opts: { shape: 'round', fill: 'neon', w: 64, h: 40, color: '#4dd8ff' } },
            { label: 'كبسولة', sub: 'تحت عنوان', type: 'shape', opts: { shape: 'pill', fill: 'gradient', w: 42, h: 9, color: '#ff4d6d' } },
            { label: 'دائرة', sub: 'خلف أيقونة', type: 'shape', opts: { shape: 'circle', fill: 'solid', w: 16, color: '#ffd54a' } },
            { label: 'إطار', sub: 'حدود بس', type: 'shape', opts: { shape: 'round', fill: 'outline', w: 60, h: 36, color: '#ffffff' } }
        ]
    };

    var screens = [];
    var cur = null;            // الشاشة المفتوحة { id, name, key, design, updatedAt }
    var maxScreens = 12;
    var tiktokLinked = true;
    var section = 'alerts';
    var view = 'home';         // home | screens | editor
    var me = null;             // الحساب (AGPAuth.getCachedUser)
    var panelOpen = true;
    var selectedId = null;
    var textTab = 'text';
    var iconTab = 'icons';
    var iconColor = '#ffd54a';
    var drag = null, resize = null;
    var F = null;
    var nodes = {};
    var save = { timer: null, pending: false, busy: false, again: false };

    function S() { return O.getState(); }
    function find(id) { return S().items.filter(function (it) { return it.id === id; })[0] || null; }
    function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
    function orientNow() { return S().editOrient === 'p' ? 'p' : 'l'; }
    function curKey() { return O.keyFor(TEMPLATE, orientNow()); }

    function el(tag, cls, text) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (text != null) e.textContent = text;
        return e;
    }
    function button(label, cls, onClick) {
        var b = el('button', cls, label);
        b.type = 'button';
        b.addEventListener('click', onClick);
        return b;
    }
    function iconEl(name) { var s = el('span'); s.innerHTML = svg(ic(name)); return s.firstChild; }

    var toastTimer = null;
    function toast(msg) {
        toastEl.textContent = msg;
        toastEl.classList.add('show');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2600);
    }

    /* ---------------- السيرفر ---------------- */

    function apiBase() { return (window.AGPAuth && window.AGPAuth.API_BASE) || 'https://project-testing-akds.onrender.com'; }
    function token() {
        try { return (window.AGPAuth && window.AGPAuth.getToken && window.AGPAuth.getToken()) || localStorage.getItem('agp_auth_token'); } catch (e) { return null; }
    }
    function api(method, path, data, keepalive) {
        var opt = { method: method, headers: { 'Authorization': 'Bearer ' + token() } };
        if (data) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(data); }
        if (keepalive) opt.keepalive = true;
        return fetch(apiBase() + path, opt).then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (d) { d = d || {}; d._status = res.status; return d; });
        });
    }

    // screen.html (مو live.html) و&v=: رابط جديد = تطبيق البث يجيب آخر نسخة بدل نسخة قديمة مخزّنة
    function linkUrl(scr) { return scr ? new URL('screen.html?k=' + scr.key + '&v=' + O.LIVE_VERSION, location.href).href : ''; }

    function setSaved(kind, text) {
        savedEl.className = 'ob-saved' + (kind === 'ok' ? ' ok' : kind === 'bad' ? ' bad' : '');
        savedEl.textContent = text || { ok: 'محفوظ ✓', saving: 'يحفظ…', bad: 'ما انحفظ' }[kind] || '';
    }

    /** بعد أي تعديل على S(): يحدّث البيانات ويجدول الحفظ. */
    /**
     * «جرّب»: يطلع هنا بالمعاينة، وبنفس اللحظة على رابط الشاشة المفتوح بـOBS / TikTok LIVE Studio
     * (POST /api/screens/test-alert — الرابط يسحبه خلال ثانيتين). لو الأليرت جديد نحفظ أول.
     */
    function tryAlert(it, type) {
        O.alertDemo(it.id, type);
        if (!cur) return;
        if (save.pending) flush();
        api('POST', '/api/screens/test-alert', { id: cur.id, itemId: it.id, type: type }).then(function (d) {
            if (!d || !d.success) { toast('التجربة اشتغلت هنا بس — ما وصلت لشاشة البث (حدّث الصفحة وجرّب)'); return; }
            var m = liveMsg();
            toast(m.state === 'ok' ? 'التجربة طالعة بشاشة البث بعد ثواني…' : m.tip);
            if (m.state !== 'ok') return;
            // بعد ثواني: رابط الشاشة يبلّغ وش صار بالتجربة (اشتغل الفيديو أو لا ولماذا)
            var sent = Date.now();
            setTimeout(function () { pollLive(function () { var r = testResult(sent); if (r) toast(r); }); }, 7000);
        }).catch(function () { toast('التجربة اشتغلت هنا بس — تأكد من الاتصال'); });
    }

    /** تشخيص رابط الشاشة: "mp4|webm|gl|آخر نتيجة|قبل كم ثانية". */
    function diagOf(x) {
        var a = String((x && x.diag) || '').split('|');
        return { mp4: a[0] || '', webm: a[1] || '', gl: a[2] === '1', last: a[3] || '', lastAgo: a[4] === '' || a[4] == null ? null : Number(a[4]) };
    }
    function testResult(sent) {
        var mine = cur && liveState.list.filter(function (x) { return String(x.id) === String(cur.id); })[0];
        if (!mine) return null;
        var d = diagOf(mine);
        var age = (Date.now() - sent) / 1000;
        if (d.lastAgo == null || d.lastAgo > age + 3) return 'التجربة وصلت للرابط بس ما بدأ أي أليرت — تأكد إن الأليرت مفعّل (مو مطفي) وجرّب مرة ثانية.';
        if (d.last === 'played') return 'الأليرت اشتغل بشاشة البث ✓';
        if (/^error/.test(d.last)) return 'تطبيق البث ما قدر يشغّل فيديو الأليرت (' + (d.mp4 === 'no' ? 'ما يدعم ملفات MP4' : 'خطأ ' + d.last.split(':')[1]) + ') — طلعت الصورة والاسم والرسالة بس.';
        if (d.last === 'blocked') return 'تطبيق البث منع تشغيل الفيديو تلقائياً — طلعت الصورة والاسم والرسالة بس.';
        return null;
    }

    /*
     * «متصلة بتطبيق البث»: رابط الشاشة المفتوح بـOBS / TikTok LIVE Studio يسأل السيرفر كل
     * ثانيتين، فنعرف هل الشاشة اللي تعدّلها هي نفسها اللي بالتطبيق (GET /api/screens/live-status).
     */
    var liveState = { list: [], at: 0 };
    var liveChip = document.createElement('button');
    liveChip.type = 'button';
    liveChip.className = 'ob-live';
    copyBtn.parentNode.insertBefore(liveChip, copyBtn);
    liveChip.addEventListener('click', function () { toast(liveMsg().tip); });
    function liveMsg() {
        var mine = cur && liveState.list.filter(function (x) { return String(x.id) === String(cur.id); })[0];
        var fresh = function (x) { return x && x.agoMs != null && x.agoMs < 12000; };
        var cur2 = mine && mine.vers && mine.vers[O.LIVE_VERSION] != null && mine.vers[O.LIVE_VERSION] < 12000;
        if (cur2) {
            var d = diagOf(mine);
            if (d.mp4 === 'no') return { state: 'old', label: 'التطبيق ما يشغّل MP4', tip: 'هالشاشة مفتوحة بتطبيق البث، بس التطبيق ما يقدر يشغّل فيديوهات MP4 — الأليرت يطلع بالصورة والاسم والرسالة بس. ارفع الأليرت بصيغة WebM.' };
            return { state: 'ok', label: 'متصلة بتطبيق البث', tip: 'هالشاشة مفتوحة الحين بتطبيق البث ✓ — أي «جرّب» يطلع فيها.' + (d.gl ? '' : ' (التطبيق ما فيه WebGL، فالتفريغ ما يشتغل فيه.)') };
        }
        if (fresh(mine)) return { state: 'old', label: 'الرابط قديم — انسخه من جديد', tip: 'تطبيق البث فاتح هالشاشة برابط قديم (نسخة مخزّنة ما تعرف التصاميم الجديدة ولا التجربة). اضغط «نسخ رابط الشاشة» والصقه بمكان الرابط القديم بالمصدر.' };
        var other = liveState.list.filter(function (x) { return fresh(x) && (!cur || String(x.id) !== String(cur.id)); })[0];
        var os = other && screens.filter(function (s) { return String(s.id) === String(other.id); })[0];
        if (os) return { state: 'off', label: 'التطبيق فاتح شاشة ثانية', tip: 'تطبيق البث فاتح شاشة «' + os.name + '» مو هذي — يا تعدّل «' + os.name + '»، أو انسخ رابط هالشاشة وحطه بالمصدر بدال القديم.' };
        return { state: 'off', label: 'مو مفتوحة بتطبيق البث', tip: 'رابط هالشاشة مو مفتوح بأي تطبيق بث الحين. انسخ الرابط («نسخ رابط الشاشة») وحطه بـOBS أو TikTok LIVE Studio كمصدر «رابط»، وخلّ التطبيق مفتوح.' };
    }
    function paintLive() {
        var m = liveMsg();
        liveChip.className = 'ob-live ' + m.state;
        liveChip.textContent = '';
        liveChip.appendChild(el('i'));
        liveChip.appendChild(el('span', null, m.label));
        liveChip.title = m.tip;
        liveChip.hidden = !cur;
    }
    function pollLive(then) {
        if (!cur || (document.hidden && !then) || view !== 'editor') return;
        api('GET', '/api/screens/live-status').then(function (d) {
            if (d && d.success) { liveState.list = d.screens || []; liveState.at = Date.now(); paintLive(); }
            if (then) then();
        }).catch(function () { /* الدورة الجاية */ });
    }
    setInterval(pollLive, 5000);

    function commit() {
        markDirty();
        O.commit();
        save.pending = true;
        setSaved('saving');
        clearTimeout(save.timer);
        save.timer = setTimeout(flush, 700);
    }

    function flush(keepalive) {
        clearTimeout(save.timer);
        if (!save.pending || !cur) return;
        if (save.busy) { save.again = true; return; }
        save.pending = false;
        save.busy = true;
        var scr = cur;
        var design = JSON.parse(JSON.stringify(S()));
        scr.design = design;
        api('POST', '/api/screens/save', { id: scr.id, design: design }, keepalive).then(function (d) {
            if (d.success) { scr.updatedAt = d.updatedAt; setSaved('ok'); }
            else setSaved('bad', d.error === 'too_many_items' ? 'عناصر كثيرة' : d.error === 'design_too_large' ? 'التصميم كبير' : 'ما انحفظ');
        }).catch(function () { setSaved('bad'); save.pending = true; }).then(function () {
            save.busy = false;
            if (save.again || save.pending) { save.again = false; save.timer = setTimeout(flush, 1500); }
        });
    }

    window.addEventListener('beforeunload', function () { if (save.pending) flush(true); });

    /* ---------------- الشاشات ---------------- */

    function freshDesign() {
        return { v: 3, enabled: true, template: TEMPLATE, editOrient: 'l', preview: 'checker', items: [] };
    }

    function openScreen(scr) {
        markDirty();
        if (cur && cur !== scr && save.pending) flush();
        cur = scr;
        try { localStorage.setItem(LAST_KEY, String(scr.id)); } catch (e) { /* ignore */ }
        var d = scr.design && Array.isArray(scr.design.items) ? JSON.parse(JSON.stringify(scr.design)) : freshDesign();
        d.template = TEMPLATE;
        if (d.editOrient !== 'p') d.editOrient = 'l';
        O.setState(d);
        selectedId = null;
        setSaved(scr.updatedAt ? 'ok' : '', scr.updatedAt ? 'محفوظ ✓' : '');
        renderChips();
        renderRail();
        renderPanel();
        renderCanvas();
        renderZoom();
        if (media.loaded) syncLibKeys(); else loadMedia();
        paintLive();
        pollLive();
    }

    /** stay = تبقى بالصفحة الحالية (أول شاشة تنسوى تلقائياً). */
    function createScreen(name, design, stay, then) {
        if (screens.length >= maxScreens) { toast('وصلت للحد: ' + maxScreens + ' شاشة'); return; }
        api('POST', '/api/screens/create', { name: name || '', design: design || freshDesign() }).then(function (d) {
            if (!d.success) { toast(d.error === 'too_many_screens' ? 'وصلت للحد: ' + maxScreens + ' شاشة' : 'ما قدرنا نسوي الشاشة'); return; }
            screens.push(d.screen);
            // تكرار من صفحة الشاشات: الشاشة المفتوحة تبقى زي ما هي
            if (!stay || !cur) openScreen(d.screen);
            if (then) then();
            else if (stay) renderViews();
            else go('editor', design ? null : 'alerts');
            toast('انضافت «' + d.screen.name + '» — رابطها جاهز بقسم «الشاشة»');
        }).catch(function () { toast('ما قدرنا نسوي الشاشة — تأكد من الاتصال'); });
    }

    function renameScreen(name) {
        if (!cur) return;
        var scr = cur;
        api('POST', '/api/screens/save', { id: scr.id, name: name }).then(function (d) {
            if (d.success) { scr.name = d.name; renderChips(); renderViews(); }
        }).catch(function () { /* ignore */ });
    }

    function deleteScreen(target) {
        var scr = target && target.id ? target : cur;
        if (!scr) return;
        if (!window.confirm('تحذف «' + scr.name + '»؟ رابطها بيوقف على طول.')) return;
        if (scr === cur) save.pending = false;
        api('POST', '/api/screens/delete', { id: scr.id }).then(function (d) {
            if (!d.success) { toast('ما قدرنا نحذفها'); return; }
            screens = screens.filter(function (x) { return x.id !== scr.id; });
            if (scr === cur) {
                cur = null;
                if (screens.length) openScreen(screens[0]);
                else { createScreen('شاشتي الأولى'); return; }
            }
            renderViews();
            toast('انحذفت الشاشة');
        }).catch(function () { toast('ما قدرنا نحذفها'); });
    }

    function newKey() {
        if (!cur) return;
        if (!window.confirm('الرابط القديم بيوقف على طول، ولازم تحط الجديد بتطبيق البث. تكمل؟')) return;
        var scr = cur;
        api('POST', '/api/screens/new-key', { id: scr.id }).then(function (d) {
            if (d.success) { scr.key = d.key; renderPanel(); toast('تغيّر الرابط — انسخ الجديد'); }
        }).catch(function () { toast('ما قدرنا نغيّر الرابط'); });
    }

    function copyLink(target) {
        var scr = target && target.id ? target : cur;
        if (!scr) return;
        var url = linkUrl(scr);
        var done = function () { toast('انسخ الرابط ✓ — حطه بتطبيق البث كـ Browser Source'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { window.prompt('انسخ الرابط:', url); });
        else window.prompt('انسخ الرابط:', url);
    }
    copyBtn.addEventListener('click', function () { copyLink(); });

    function renderChips() {
        chipsEl.textContent = '';
        screens.forEach(function (scr) {
            var c = button('', 'ob-chip' + (scr === cur ? ' on' : ''), function () { if (scr !== cur) { openScreen(scr); renderViews(); } });
            c.appendChild(el('i', 'dot'));
            c.appendChild(el('span', null, scr.name));
            c.title = scr.name;
            chipsEl.appendChild(c);
        });
        if (screens.length < maxScreens) {
            var add = button('+ شاشة جديدة', 'ob-chip add', function () { createScreen(''); });
            chipsEl.appendChild(add);
        }
        var on = chipsEl.querySelector('.on');
        if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /* ---------------- القائمة الجانبية (يسار) ---------------- */

    function secOf(key) { return SECTIONS.filter(function (s) { return s.key === key; })[0]; }

    function navItem(label, icon, on, onClick, badge) {
        var b = button('', 'vy-item' + (on ? ' on' : ''), onClick);
        b.innerHTML = svg(ic(icon));
        b.appendChild(el('span', 'lbl', label));
        if (badge) b.appendChild(el('span', 'badge', badge));
        b.setAttribute('aria-label', label);
        b.setAttribute('data-tip', label);
        if (on) b.setAttribute('aria-current', 'page');
        return b;
    }

    /** قسم أداة من القائمة: يفتح المحرر عليه، والضغط مرة ثانية يطوي اللوحة. */
    function pickSection(key) {
        if (view === 'editor' && key === section && panelOpen && !selectedId) { panelOpen = false; }
        else { section = key; panelOpen = true; }
        if (selectedId) { selectedId = null; renderCanvas(); }
        go('editor');
    }

    function renderRail() {
        navEl.textContent = '';
        var n = S().items.length;
        navEl.appendChild(navItem('الرئيسية', 'home', view === 'home', function () { go('home'); }));
        navEl.appendChild(navItem('الشاشات', 'screens', view === 'screens', function () { go('screens'); }, screens.length ? String(screens.length) : ''));
        navEl.appendChild(navItem('إحصائيات البث', 'bars', view === 'stats', function () { go('stats'); }));
        navEl.appendChild(el('div', 'vy-group', 'أدوات البث'));
        TOOL_KEYS.forEach(function (k) {
            var sec = secOf(k);
            navEl.appendChild(navItem(sec.label, sec.icon, view === 'editor' && section === k && panelOpen && !selectedId, function () { pickSection(k); }));
        });
        navEl.appendChild(el('div', 'vy-group', 'الشاشة المفتوحة'));
        ['layers', 'screen'].forEach(function (k) {
            var sec = secOf(k);
            navEl.appendChild(navItem(sec.label, sec.icon, view === 'editor' && section === k && panelOpen && !selectedId, function () { pickSection(k); }, k === 'layers' && cur && n ? String(n) : ''));
        });
        // بالجوال: نفس أقسام المحرر كشريط فوقه
        mtabs.textContent = '';
        TOOL_KEYS.concat(['layers', 'screen']).forEach(function (k) {
            var sec = secOf(k);
            mtabs.appendChild(navItem(sec.label, sec.icon, section === k && panelOpen && !selectedId, function () { pickSection(k); }));
        });
        var on = mtabs.querySelector('.on');
        if (on && on.scrollIntoView && view === 'editor') on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    /** التنقّل بين الصفحات: home | screens | editor (و sec = قسم أداة بالمحرر). */
    function go(next, sec) {
        if (sec) { section = sec; panelOpen = true; selectedId = null; }
        if (next === 'editor' && !cur) { if (screens[0]) openScreen(screens[0]); else { next = 'screens'; } }
        var changed = next !== view;
        view = next;
        ['home', 'screens', 'stats', 'editor'].forEach(function (v) {
            var sEl = document.getElementById('vy-' + v);
            sEl.hidden = v !== view;
            if (v === view && changed) { sEl.classList.remove('enter'); void sEl.offsetWidth; sEl.classList.add('enter'); }
        });
        mtitle.textContent = view === 'editor' ? (secOf(section) || {}).label || VIEW_TITLES.editor : VIEW_TITLES[view];
        document.title = 'Veyro — ' + (view === 'editor' && cur ? cur.name : VIEW_TITLES[view]);
        app.classList.remove('drawer');
        try { history.replaceState(null, '', '#' + (view === 'editor' ? 'tools/' + section : view)); } catch (e) { /* ignore */ }
        renderRail();
        // الرئيسية والشاشات ما تنعاد رسمتها إلا لو تغيّر شي (أسرع تنقّل)
        if (view === 'home') { if (dirty.home) renderHome(); }
        else if (view === 'stats') {
            // «إحصائيات البث» (stats-card.js): تنبني أول مرة، وبعدها تحدّث أرقامها بس
            if (!statsUi && window.VeyroStats) statsUi = window.VeyroStats.mount(statsBody, { api: api, toast: toast });
            else if (statsUi && changed) statsUi.refresh();
        }
        else if (view === 'screens') { if (dirty.screens) renderScreensView(); }
        else {
            var wasClosed = body.classList.contains('closed');
            renderPanel();
            body.classList.toggle('closed', !panelOpen);
            if (changed || !F) renderCanvas();
            // بعد ما تخلص حركة فتح/طي اللوحة تتغيّر مساحة المعاينة
            if (wasClosed !== !panelOpen) setTimeout(function () { if (!drag) renderCanvas(); }, 380);
        }
    }

    /** شي تغيّر بالشاشات: الرئيسية وصفحة الشاشات تنرسم من جديد أول ما تنفتح. */
    var dirty = { home: true, screens: true };
    function markDirty() { dirty.home = true; dirty.screens = true; }

    /** يعيد رسم الصفحة المفتوحة لو هي الرئيسية أو الشاشات (بعد تغيّر قائمة الشاشات). */
    function renderViews() {
        markDirty();
        renderRail();
        if (view === 'home') renderHome();
        else if (view === 'screens') renderScreensView();
    }

    function layoutChanged() {
        body.classList.toggle('closed', !panelOpen);
        if (!panelOpen) body.classList.remove('wide');
        setTimeout(function () { if (!drag) renderCanvas(); }, 380);
    }

    /* ---------------- عناصر الإعدادات ---------------- */

    function row(label, control, col, sub) {
        var r = el('div', 'ob-row' + (col ? ' col' : ''));
        var l = el('span', 'ob-label', label);
        if (sub) l.appendChild(el('small', null, sub));
        r.appendChild(l);
        r.appendChild(control);
        return r;
    }
    function pills(options, current, onPick, multi) {
        var g = el('div', 'ob-pills');
        options.forEach(function (opt) {
            var on = multi ? current.indexOf(opt.value) !== -1 : opt.value === current;
            g.appendChild(button(opt.label, 'ob-pill' + (on ? ' on' : ''), function () { onPick(opt.value); }));
        });
        return g;
    }
    function swatches(current, onPick) {
        var g = el('div', 'ob-sw');
        O.COLORS.forEach(function (c) {
            var b = button('', c === current ? 'on' : '', function () { onPick(c); });
            b.style.background = c;
            b.setAttribute('aria-label', c);
            g.appendChild(b);
        });
        var pick = document.createElement('input');
        pick.type = 'color';
        pick.value = /^#[0-9a-f]{6}$/i.test(current || '') ? current : '#ffffff';
        pick.title = 'لون مخصص';
        pick.addEventListener('change', function () { onPick(pick.value); });
        g.appendChild(pick);
        return g;
    }
    function slider(min, max, step, value, onInput) {
        var s = document.createElement('input');
        s.type = 'range';
        s.className = 'ob-range';
        s.min = min; s.max = Math.max(max, Number(value) || 0); s.step = step; s.value = value;
        s.addEventListener('input', function () { onInput(Number(s.value)); });
        return s;
    }
    function textInput(value, max, onInput, multiline) {
        var i = document.createElement(multiline ? 'textarea' : 'input');
        if (!multiline) i.type = 'text';
        else i.rows = 2;
        i.className = 'ob-input';
        i.maxLength = max;
        i.value = value || '';
        i.addEventListener('input', function () { onInput(i.value); });
        return i;
    }
    function toggle(checked, onChange) {
        var l = el('label', 'ob-toggle');
        var i = document.createElement('input');
        i.type = 'checkbox';
        i.checked = Boolean(checked);
        i.addEventListener('change', function () { onChange(i.checked); });
        l.appendChild(i);
        l.appendChild(el('span'));
        return l;
    }
    function opts(list) { return list.map(function (x) { return { label: x.label, value: x.key }; }); }

    /** تعديل خاصية: يحفظ ويعيد رسم المعاينة؛ repaint = يعيد رسم اللوحة (للأزرار، مو للكتابة). */
    function update(it, key, value, repaint) {
        it[key] = value;
        commit();
        rebuildNode(it);
        if (repaint) renderPanel();
    }

    /* ---------------- إضافة وتعديل العناصر ---------------- */

    function itemName(it) {
        if (it.type === 'text') return (it.text || '').replace(/\s+/g, ' ').trim().slice(0, 28) || 'نص فاضي';
        if (it.type === 'top') return it.title || (O.SECTIONS[it.section] || O.SECTIONS.likers).title;
        if (it.type === 'goal') return it.title || 'هدف';
        if (it.type === 'jar') return it.title || 'وعاء الهدايا';
        if (it.type === 'lastdonation') return it.title || 'آخر دعم';
        if (it.type === 'tts') return 'القارئ الصوتي' + (it.enabled === false ? ' (موقف)' : '');
        if (it.type === 'music') return 'مشغّل الأغاني' + (it.enabled === false ? ' (موقف)' : '');
        if (O.isVideoAlert(it)) return 'أليرت فيديو: ' + (it.video.name || '');
        if (it.type === 'alert') return 'أليرت: ' + (it.events || []).map(function (k) { return (O.ALERT_EVENTS_ALL[k] || {}).label; }).filter(Boolean).join('، ');
        if (it.type === 'icon') return it.emoji ? 'ملصق ' + it.emoji : 'أيقونة ' + ((O.ICON_SET[it.icon] || {}).label || '');
        if (it.type === 'shape') return 'شكل: ' + ((O.SHAPES.filter(function (s) { return s.key === it.shape; })[0] || {}).label || '');
        return it.title || 'عدّادات البث';
    }

    function makeItem(tool) {
        var it = O.newItem(tool.type, tool.opts || {});
        if (tool.set) Object.keys(tool.set).forEach(function (k) { it[k] = Array.isArray(tool.set[k]) ? tool.set[k].slice() : tool.set[k]; });
        return it;
    }

    function addItem(it, at) {
        var spots = [[0.5, 0.3], [0.5, 0.7], [0.2, 0.5], [0.8, 0.5], [0.2, 0.2], [0.8, 0.2], [0.2, 0.8], [0.8, 0.8]];
        var spot = at || spots[S().items.length % spots.length];
        it.pos[curKey()] = { x: spot[0], y: spot[1] };
        // الأشكال تنحط تحت باقي العناصر عشان تصير خلفية لها
        if (it.type === 'shape') S().items.unshift(it); else S().items.push(it);
        commit();
        selectedId = it.id;
        textTab = 'text';
        renderRail();
        renderCanvas();
        renderPanel();
        if (O.isDataItem(it)) O.refreshStats();
        if (it.type === 'alert') setTimeout(function () { O.alertDemo(it.id, (it.events || ['gift'])[0]); }, 200);
        var ta = panel.querySelector('textarea');
        if (ta) { ta.focus(); ta.select(); }
    }

    function removeItem(it) {
        S().items = S().items.filter(function (x) { return x.id !== it.id; });
        if (selectedId === it.id) selectedId = null;
        commit();
        renderRail();
        renderCanvas();
        renderPanel();
    }

    function moveItem(it, dir) {
        var list = S().items, i = list.indexOf(it), j = i + dir;
        if (i < 0 || j < 0 || j >= list.length) return;
        list[i] = list[j]; list[j] = it;
        commit();
        renderCanvas();
        renderPanel();
    }

    function duplicate(it) {
        var copy = JSON.parse(JSON.stringify(it));
        copy.id = O.newItem('text').id;
        var k = curKey(), p = O.posOf(it, k);
        copy.pos = {};
        copy.pos[k] = { x: clamp(p.x + 0.04, 0.02, 0.98), y: clamp(p.y + 0.04, 0.02, 0.98) };
        var list = S().items;
        list.splice(list.indexOf(it) + 1, 0, copy);
        commit();
        selectedId = copy.id;
        renderRail();
        renderCanvas();
        renderPanel();
    }

    /* ---------------- المعاينة ---------------- */

    function renderCanvas() {
        if (!cur) return;
        var st = S();
        var o = orientNow();
        var pad = 28;
        var W = stage.clientWidth - pad * 2, H = stage.clientHeight - pad * 2 - 54;
        if (W < 50 || H < 50) return;
        var box = O.frameIn(TEMPLATE, o, W, H);
        F = { w: box.w, h: box.h };
        frame.style.left = (pad + box.x) + 'px';
        frame.style.top = (pad + box.y) + 'px';
        frame.style.width = box.w + 'px';
        frame.style.height = box.h + 'px';
        var pv = PREVIEWS.filter(function (p) { return p.key === st.preview; })[0] || PREVIEWS[0];
        // «صورتك»: خلفية من جهاز الستريمر للمعاينة بس — بالذاكرة، ما تنحفظ بالشاشة ولا تطلع بالرابط
        var bgImg = localBg || pv.img;
        frame.className = 'ob-frame ' + (bgImg ? 'bg-img' : 'bg-' + pv.key);
        frame.style.backgroundImage = bgImg ? 'url("' + bgImg + '")' : '';
        frame.textContent = '';
        nodes = {};
        var tag = el('div', 'ob-ftag');
        tag.appendChild(el('b', null, o === 'l' ? '1920×1080' : '1080×1920'));
        tag.appendChild(el('span', null, Math.round(box.w / (o === 'l' ? 1920 : 1080) * 100) + '%'));
        frame.appendChild(tag);
        if (!st.items.length) {
            var em = el('div', 'ob-empty');
            em.appendChild(el('b', null, 'شاشة فاضية'));
            em.appendChild(el('span', null, 'اختر قسم من اليمين واضغط على أي أداة — وبعدها اسحبها لأي مكان'));
            frame.appendChild(em);
        }
        st.items.forEach(function (it) { frame.appendChild(buildNode(it)); });
        // الأماكن بعد ما ينضافون كلهم (القياس يحتاج العنصر بالصفحة)
        st.items.forEach(function (it) { placeNode(it); });
    }

    function buildNode(it) {
        var n = O.buildItem(it, F, { preview: true });
        if (it.hidden) n.classList.add('ob-hidden');
        if (it.id === selectedId) {
            n.classList.add('ob-sel');
            var h = el('span', 'ob-handle');
            h.title = 'كبّر / صغّر';
            n.appendChild(h);
        }
        nodes[it.id] = n;
        return n;
    }

    function placeNode(it) {
        var n = nodes[it.id];
        if (!n) return;
        n._pos = O.posOf(it, curKey());
        n._F = F;
        O.place(n, n._pos, F);
    }

    /** يعيد رسم عنصر واحد بمكانه (تعديل خاصية أو تكبير). */
    function rebuildNode(it) {
        var old = nodes[it.id];
        if (!old || !F) { renderCanvas(); return; }
        var n = buildNode(it);
        frame.replaceChild(n, old);
        placeNode(it);
    }

    function select(id) {
        selectedId = id;
        textTab = 'text';
        if (id) panelOpen = true;
        renderCanvas();
        renderRail();
        renderPanel();
        body.classList.toggle('closed', !panelOpen);
    }

    frame.addEventListener('pointerdown', function (e) {
        var handle = e.target.closest && e.target.closest('.ob-handle');
        var n = e.target.closest && e.target.closest('.agp-so-item');
        if (!n) { if (selectedId) select(null); return; }
        e.preventDefault();
        var it = find(n.getAttribute('data-id'));
        if (!it) return;
        if (handle) {
            var r0 = n.getBoundingClientRect();
            resize = { it: it, pid: e.pointerId, sx: e.clientX, sy: e.clientY, half: Math.max(20, r0.width / 2), size: Number(it.size) || 5, w: Number(it.w) || 40, h: Number(it.h) || 20 };
            return;
        }
        if (selectedId !== it.id) { select(it.id); n = nodes[it.id] || n; }
        var r = n.getBoundingClientRect(), fr = frame.getBoundingClientRect();
        drag = {
            it: it, pid: e.pointerId, sx: e.clientX, sy: e.clientY, key: curKey(),
            px: (r.left + r.width / 2 - fr.left) / fr.width, py: (r.top + r.height / 2 - fr.top) / fr.height, moved: false
        };
    });

    window.addEventListener('pointermove', function (e) {
        if (resize && e.pointerId === resize.pid) {
            // المقبض بالزاوية اليسار تحت: نبعد عنه = يكبر
            var d = ((resize.sx - e.clientX) + (e.clientY - resize.sy)) / 2;
            var k = clamp(1 + d / resize.half, 0.15, 6);
            var it = resize.it;
            if (it.type === 'shape') { it.w = Math.round(clamp(resize.w * k, 2, 200)); it.h = Math.round(clamp(resize.h * k, 1, 200) * 10) / 10; }
            else it.size = Math.round(clamp(resize.size * k, 0.8, 40) * 10) / 10;
            rebuildNode(it);
            return;
        }
        if (!drag || e.pointerId !== drag.pid) return;
        var dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
        drag.it.pos[drag.key] = { x: clamp(drag.px + dx / F.w, 0.01, 0.99), y: clamp(drag.py + dy / F.h, 0.01, 0.99) };
        var n = nodes[drag.it.id];
        if (n) { n._pos = drag.it.pos[drag.key]; O.place(n, n._pos, F); }
    });

    function endPointer(e) {
        if (resize && e.pointerId === resize.pid) { resize = null; commit(); renderPanel(); return; }
        if (!drag || e.pointerId !== drag.pid) return;
        var moved = drag.moved;
        drag = null;
        if (moved) commit();
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    window.addEventListener('keydown', function (e) {
        var it = selectedId && find(selectedId);
        if (!it || /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || '')) return;
        var step = e.shiftKey ? 0.02 : 0.004, p = O.posOf(it, curKey());
        var moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
        if (moves[e.key]) {
            e.preventDefault();
            p.x = clamp(p.x + moves[e.key][0], 0.01, 0.99);
            p.y = clamp(p.y + moves[e.key][1], 0.01, 0.99);
            placeNode(it);
            commit();
        } else if (e.key === 'Delete' || e.key === 'Backspace') {
            e.preventDefault();
            removeItem(it);
        } else if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
            e.preventDefault();
            duplicate(it);
        } else if (e.key === 'Escape') {
            select(null);
        }
    });

    var localBg = null; // رابط blob: لصورة من الجهاز (بالذاكرة بس)
    function setLocalBg(file) {
        if (localBg) { try { URL.revokeObjectURL(localBg); } catch (e) { /* ignore */ } }
        localBg = file ? URL.createObjectURL(file) : null;
        renderCanvas();
        renderZoom();
        if (file) toast('خلفيتك للمعاينة بس — ما تنحفظ ولا تطلع برابط الشاشة');
    }
    function renderZoom() {
        zoomBar.textContent = '';
        zoomBar.appendChild(el('span', null, 'خلفية المعاينة'));
        PREVIEWS.forEach(function (p) {
            zoomBar.appendChild(button(p.label, 'ob-btn' + (!localBg && (S().preview || 'checker') === p.key ? ' primary' : ' ghost'), function () {
                if (localBg) setLocalBg(null);
                S().preview = p.key;
                commit();
                renderCanvas();
                renderZoom();
            }));
        });
        var up = el('label', 'ob-btn' + (localBg ? ' primary' : ' ghost'));
        up.title = 'صورة من جهازك تشوف عليها الشاشة وانت تصممها (ما تنحفظ)';
        up.innerHTML = svg(ic('upload'));
        up.appendChild(el('span', null, 'صورتك'));
        var fin = document.createElement('input');
        fin.type = 'file';
        fin.accept = 'image/*';
        fin.hidden = true;
        fin.addEventListener('change', function () { var f = fin.files && fin.files[0]; fin.value = ''; if (f) setLocalBg(f); });
        up.appendChild(fin);
        zoomBar.appendChild(up);
        if (localBg) {
            var x = button('', 'ob-btn ghost icon', function () { setLocalBg(null); });
            x.innerHTML = svg(UI.close);
            x.title = 'شيل صورتك';
            x.setAttribute('aria-label', 'شيل صورتك');
            zoomBar.appendChild(x);
        }
    }

    /* ---------------- اللوحة ---------------- */

    function head(title, desc, onBack) {
        var h = el('div', 'ob-phead');
        var t = el('div');
        t.appendChild(el('h2', null, title));
        if (desc) t.appendChild(el('p', null, desc));
        h.appendChild(t);
        var x = button('', 'ob-x', onBack || function () { panelOpen = false; renderRail(); layoutChanged(); });
        x.innerHTML = onBack ? '→' : svg(UI.close);
        x.setAttribute('aria-label', onBack ? 'رجوع' : 'إغلاق');
        h.appendChild(x);
        return h;
    }

    /*
     * اللوحة تنعاد رسمتها مع أي تعديل (مفتاح، زر، اختيار). عشان ما ترجع لأولها كل مرة،
     * نحفظ مكان التمرير ونرجّعه — بس لو نفس المحتوى (نفس العنصر أو نفس القسم).
     */
    var panelScroll = { ctx: null, top: 0 };
    function renderPanel() {
        var oldPb = panel.querySelector('.ob-pbody');
        if (oldPb && panelScroll.ctx) panelScroll.top = oldPb.scrollTop;
        panel.textContent = '';
        if (!cur) return;
        var it = selectedId && find(selectedId);
        var ctx = it ? 'i:' + it.id : 's:' + section;
        var keep = ctx === panelScroll.ctx ? panelScroll.top : 0;
        panelScroll.ctx = ctx;
        var pb = el('div', 'ob-pbody');
        requestAnimationFrame(function () { if (keep && pb.isConnected) pb.scrollTop = keep; });
        if (it) {
            panel.appendChild(head(TYPE_NAMES[it.type] || 'عنصر', itemName(it), function () { select(null); }));
            propsPane(it, pb);
        } else {
            var sec = SECTIONS.filter(function (s) { return s.key === section; })[0] || SECTIONS[0];
            panel.appendChild(head(sec.title, sec.desc));
            if (sec.key === 'library') libraryPane(pb);
            if (sec.key === 'alerts') videoAlertsPane(pb);
            if (sec.key === 'alerts' && TOOLS.alerts) pb.appendChild(el('div', 'ob-gtitle', 'أليرتات بطاقة (بدون فيديو)'));
            if (TOOLS[sec.key]) toolsPane(TOOLS[sec.key], pb, sec.key === 'jar');
            if (sec.key === 'jar') pb.appendChild(el('div', 'ob-hint', 'يتعبّى بصور هدايا تيك توك نفسها (آخر 54 صورة)، والجديدة تطيح من فوق.'));
            if (sec.key === 'donations') {
                pb.appendChild(streamlabsCard());
                videoAlertsPane(pb, 'donation');
                pb.appendChild(el('div', 'ob-hint', 'التوب وآخر داعم وهدف الدونيشن تلقاها بقسم «التوب».'));
            }
            if (sec.key === 'audio') pb.appendChild(el('div', 'ob-hint', 'الصوت يطلع من رابط الشاشة بـOBS أو TikTok LIVE Studio، والمعاينة هنا صامتة. الأوامر تشتغل وأنت تبث.'));
            if (sec.key === 'icons') iconsPane(pb);
            if (sec.key === 'layers') layersPane(pb);
            if (sec.key === 'screen') screenPane(pb);
        }
        panel.appendChild(pb);
        syncWide();
    }

    /** المكتبة والأليرتات (وإعدادات أي أليرت) = لوحة عريضة، وشاشة البث تصغر؛ تقفلها ترجع تتمدد. */
    function syncWide() {
        var it = selectedId && find(selectedId);
        var w = panelOpen && (it ? it.type === 'alert' : (section === 'library' || section === 'alerts'));
        if (body.classList.contains('wide') === w) return;
        body.classList.toggle('wide', w);
        setTimeout(function () { if (!drag) renderCanvas(); }, 380);
    }

    /** بطاقات أدوات بمعاينة حقيقية مصغّرة. */
    function toolsPane(list, box, one) {
        var g = el('div', 'ob-tools' + (one ? ' one' : ''));
        list.forEach(function (tool) {
            var card = button('', 'ob-tool', function () { addItem(makeItem(tool), tool.at); });
            var pv = el('div', 'pv');
            var wrap = el('div', 'ob-pvw');
            var sample = makeItem(tool);
            sample.id = 'pv-' + sample.id;
            var n = O.buildItem(sample, { w: 300, h: 300 }, { preview: true });
            wrap.appendChild(n);
            pv.appendChild(wrap);
            card.appendChild(pv);
            var meta = el('div', 'meta');
            meta.appendChild(el('b', null, tool.label));
            if (tool.sub) meta.appendChild(el('small', null, tool.sub));
            card.appendChild(meta);
            g.appendChild(card);
            fitPreview(pv, wrap, n);
        });
        box.appendChild(g);
    }

    function fitPreview(pv, wrap, n) {
        requestAnimationFrame(function () {
            var w = n.offsetWidth, h = n.offsetHeight;
            if (!w || !h) return;
            var k = Math.min(1.4, (pv.clientWidth - 18) / w, (pv.clientHeight - 14) / h);
            wrap.style.transform = 'scale(' + k + ')';
        });
    }

    function iconsPane(box) {
        var seg = el('div', 'ob-seg');
        [['icons', 'أيقونات'], ['emoji', 'إيموجي']].forEach(function (t) {
            seg.appendChild(button(t[1], t[0] === iconTab ? 'on' : '', function () { iconTab = t[0]; renderPanel(); }));
        });
        box.appendChild(seg);
        if (iconTab === 'icons') box.appendChild(row('اللون', swatches(iconColor, function (c) { iconColor = c; renderPanel(); }), true));
        var g = el('div', 'ob-igrid');
        if (iconTab === 'icons') {
            Object.keys(O.ICON_SET).forEach(function (k) {
                var b = button('', 'ob-ibtn', function () { addItem(O.newItem('icon', { icon: k, color: iconColor })); });
                b.innerHTML = svg(O.ICON_SET[k].p);
                b.style.color = iconColor;
                b.title = O.ICON_SET[k].label;
                b.setAttribute('aria-label', O.ICON_SET[k].label);
                g.appendChild(b);
            });
        } else {
            O.EMOJIS.forEach(function (em) {
                g.appendChild(button(em, 'ob-ibtn emo', function () { addItem(O.newItem('icon', { emoji: em })); }));
            });
        }
        box.appendChild(g);
    }

    function layersPane(box) {
        var list = S().items.slice().reverse(); // فوق القائمة = فوق الشاشة
        if (!list.length) { box.appendChild(el('div', 'ob-hint', 'ما فيه عناصر للحين — أضف من الأقسام.')); return; }
        var wrap = el('div', 'ob-layers');
        list.forEach(function (it) {
            var r = el('div', 'ob-layer' + (it.id === selectedId ? ' on' : '') + (it.hidden ? ' off' : ''));
            r.addEventListener('click', function () { select(it.id); });
            var li = el('span', 'ob-lic');
            li.innerHTML = svg(ic(TYPE_ICONS[it.type] || 'star'));
            r.appendChild(li);
            r.appendChild(el('span', 'ob-lname', itemName(it)));
            function ib(label, title, fn, cls) {
                var b = button(label, 'ob-ib' + (cls ? ' ' + cls : ''), function (e) { e.stopPropagation(); fn(); });
                b.title = title;
                b.setAttribute('aria-label', title);
                r.appendChild(b);
            }
            ib(it.hidden ? '◌' : '◉', it.hidden ? 'إظهار' : 'إخفاء', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderPanel(); });
            ib('↑', 'لفوق', function () { moveItem(it, 1); });
            ib('↓', 'لتحت', function () { moveItem(it, -1); });
            ib('✕', 'حذف', function () { removeItem(it); }, 'danger');
            wrap.appendChild(r);
        });
        box.appendChild(wrap);
    }

    function screenPane(box) {
        var st = S();
        box.appendChild(streamlabsCard());
        var link = el('div', 'ob-card link');
        link.appendChild(el('h3', null, 'رابط «' + cur.name + '»'));
        var url = el('input', 'ob-url');
        url.readOnly = true;
        url.value = linkUrl(cur);
        url.addEventListener('focus', function () { url.select(); });
        link.appendChild(url);
        var a = el('div', 'ob-actions');
        a.appendChild(button('نسخ الرابط', 'ob-btn primary', function () { copyLink(); }));
        a.appendChild(button('افتح الرابط', 'ob-btn ghost', function () { window.open(linkUrl(cur), '_blank', 'noopener'); }));
        a.appendChild(button('رابط جديد', 'ob-btn ghost', newKey));
        link.appendChild(a);
        link.appendChild(el('div', 'ob-hint', 'لا تنشر الرابط — اللي عنده يشوف أرقام بثك. لو تسرّب اضغط «رابط جديد».'));
        box.appendChild(link);

        if (!tiktokLinked) box.appendChild(el('div', 'ob-warn', 'حسابك مو مربوط بتيك توك — اربطه من «حسابي» عشان تطلع أرقام البث والأليرتات بالرابط.'));

        var nameIn = textInput(cur.name, 40, function (v) {
            clearTimeout(nameIn._t);
            nameIn._t = setTimeout(function () { if (v.trim()) renameScreen(v); }, 600);
        });
        box.appendChild(row('اسم الشاشة', nameIn));
        box.appendChild(row('الاتجاه', pills([{ label: 'أفقي', value: 'l' }, { label: 'عمودي', value: 'p' }], orientNow(), function (v) {
            st.editOrient = v; commit(); renderCanvas(); renderPanel();
        }), true, 'أفقي لـOBS، وعمودي لبث الجوال بـTikTok LIVE Studio'));
        box.appendChild(row('ظاهرة بالبث', toggle(st.enabled !== false, function (v) { st.enabled = v; commit(); }), false, 'إطفاؤها يخفي كل شي بالرابط'));

        var data = el('div', 'ob-card');
        data.appendChild(el('h3', null, 'أرقام البث'));
        data.appendChild(el('div', 'ob-hint', O.linkText()));
        data.appendChild(el('div', 'ob-hint', 'الرابط يعرض الأرقام اللي تنحسب وانت متصل بالبث من الموقع (لعبة، أو «اتصل بالبث» بمكتبة الألعاب).'));
        box.appendChild(data);

        var guide = el('div', 'ob-card');
        guide.appendChild(el('h3', null, 'طريقة الإضافة'));
        guide.appendChild(el('b', 'ob-hint', 'OBS'));
        var s1 = el('ol', 'ob-steps');
        ['من «المصادر» اضغط + واختر «Browser» (متصفح).', 'الصق الرابط بخانة URL.', 'العرض 1920 والطول 1080 (للعمودي 1080 × 1920).', 'اضغط OK — والخلفية شفافة لحالها.'].forEach(function (t) { s1.appendChild(el('li', null, t)); });
        guide.appendChild(s1);
        guide.appendChild(el('b', 'ob-hint', 'TikTok LIVE Studio'));
        var s2 = el('ol', 'ob-steps');
        ['من «إضافة مصدر» اختر «رابط» أو «Link».', 'الصق الرابط واضبط المقاس على حجم المشهد.', 'لو المشهد عمودي غيّر اتجاه الشاشة هنا لـ«عمودي».'].forEach(function (t) { s2.appendChild(el('li', null, t)); });
        guide.appendChild(s2);
        box.appendChild(guide);

        var acts = el('div', 'ob-actions');
        acts.appendChild(button('تكرار الشاشة', 'ob-btn ghost', function () {
            flush();
            createScreen(cur.name + ' (نسخة)', JSON.parse(JSON.stringify(S())));
        }));
        acts.appendChild(button('حذف الشاشة', 'ob-btn danger', function () { deleteScreen(); }));
        box.appendChild(acts);
    }

    /* ---------------- خصائص العنصر المحدد ---------------- */

    function sectionOpts() { return Object.keys(O.SECTIONS).map(function (k) { return { label: O.SECTIONS[k].label, value: k }; }); }
    function metricOpts(keys) { return keys.map(function (k) { return { label: O.METRICS[k].name, value: k }; }); }

    function propsPane(it, box) {
        if (it.type === 'text') textProps(it, box);
        else if (it.type === 'top') topProps(it, box);
        else if (it.type === 'goal') goalProps(it, box);
        else if (it.type === 'counter') counterProps(it, box);
        else if (it.type === 'jar') jarProps(it, box);
        else if (O.isVideoAlert(it)) videoAlertProps(it, box);
        else if (it.type === 'alert') alertProps(it, box);
        else if (it.type === 'icon') iconProps(it, box);
        else if (it.type === 'shape') shapeProps(it, box);
        else if (it.type === 'lastdonation') lastDonationProps(it, box);
        else if (it.type === 'tts') ttsProps(it, box);
        else if (it.type === 'music') musicProps(it, box);
        var a = el('div', 'ob-actions');
        a.appendChild(button('لفوق', 'ob-btn ghost', function () { moveItem(it, 1); }));
        a.appendChild(button('لتحت', 'ob-btn ghost', function () { moveItem(it, -1); }));
        a.appendChild(button('تكرار', 'ob-btn ghost', function () { duplicate(it); }));
        a.appendChild(button(it.hidden ? 'إظهار' : 'إخفاء', 'ob-btn ghost', function () { it.hidden = !it.hidden; commit(); renderCanvas(); renderPanel(); }));
        a.appendChild(button('حذف', 'ob-btn danger', function () { removeItem(it); }));
        box.appendChild(a);
        box.appendChild(el('div', 'ob-hint', 'اسحبه بالمعاينة لأي مكان، وكبّره من النقطة اللي بزاويته. بالكيبورد: الأسهم للتحريك، Delete للحذف، Ctrl+D للتكرار.'));
    }

    function textProps(it, box) {
        var tabs = el('div', 'ob-ptabs');
        [['text', 'النص'], ['font', 'الخط'], ['fx', 'التأثير'], ['anim', 'الحركة']].forEach(function (t) {
            tabs.appendChild(button(t[1], t[0] === textTab ? 'on' : '', function () { textTab = t[0]; renderPanel(); }));
        });
        box.appendChild(tabs);
        if (textTab === 'text') {
            box.appendChild(row('النص', textInput(it.text, 200, function (v) { update(it, 'text', v); }, true), true));
            box.appendChild(row('الحجم', slider(2, 20, 0.5, it.size, function (v) { update(it, 'size', v); })));
            box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
        } else if (textTab === 'font') {
            var g = el('div', 'ob-fgrid');
            var cur2 = it.font || O.DEFAULT_FONT;
            O.FONTS.forEach(function (f) {
                O.loadFont(f);
                var b = button('', 'ob-fbtn' + (f.key === cur2 ? ' on' : ''), function () { update(it, 'font', f.key, true); });
                var sample = el('span', null, 'حياكم');
                sample.style.fontFamily = O.fontStack(f);
                sample.style.fontWeight = String(f.b);
                b.appendChild(sample);
                b.appendChild(el('span', null, f.label));
                g.appendChild(b);
            });
            box.appendChild(g);
        } else if (textTab === 'fx') {
            box.appendChild(row('التأثير', pills(opts(O.TEXT_STYLES), it.style || 'outline', function (v) { update(it, 'style', v, true); }), true));
        } else {
            animRows(it, box);
        }
    }

    function animRows(it, box) {
        box.appendChild(row('الحركة', pills(opts(O.ANIMS), it.anim || 'none', function (v) { update(it, 'anim', v, true); }), true));
        if (it.anim && it.anim !== 'none') box.appendChild(row('السرعة', pills(O.SPEEDS, Number(it.speed) || 1, function (v) { update(it, 'speed', v, true); })));
    }

    function sizeColor(it, box, min, max) {
        box.appendChild(row('الحجم', slider(min, max, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
    }

    /** «العرش»: الأقسام (واحد أو أكثر يتبدّلون)، مدة التبديل، لون الإطار، ألوان المراكز. */
    /** لون اختياري: «الأصلي» أو أي لون (it[key] = '#rrggbb' أو بدون). */
    function optColor(it, box, key, label, sub) {
        var w = el('div', 'ob-sw');
        w.appendChild(button('الأصلي', 'ob-pill' + (it[key] ? '' : ' on'), function () { delete it[key]; update(it, key, undefined, true); }));
        var sw = swatches(it[key], function (c) { update(it, key, c, true); });
        while (sw.firstChild) w.appendChild(sw.firstChild);
        box.appendChild(row(label, w, true, sub));
    }

    function throneProps(it, box) {
        var all = Object.keys(O.SECTIONS);
        var cur = (Array.isArray(it.sections) && it.sections.length ? it.sections : [it.section || 'likers']).filter(function (k) { return O.SECTIONS[k]; });
        // اختيار سريع: الداعمين / المكبّسين / الاثنين / الكل (وتحت «يعرض» للتحكم الكامل)
        var QUICK = [
            { label: 'الداعمين', value: 'gifters', list: ['gifters'] },
            { label: 'المكبّسين', value: 'likers', list: ['likers'] },
            { label: 'الاثنين', value: 'both', list: ['gifters', 'likers'] },
            { label: 'الدونيشن', value: 'donors', list: ['donors'] },
            { label: 'الكل', value: 'all', list: all.slice() }
        ];
        var same = function (a, b) { return a.length === b.length && a.every(function (x) { return b.indexOf(x) !== -1; }); };
        var quickCur = (QUICK.filter(function (q) { return same(q.list, cur); })[0] || {}).value || '';
        box.appendChild(row('التوب', pills(QUICK.map(function (q) { return { label: q.label, value: q.value }; }), quickCur, function (v) {
            var q = QUICK.filter(function (x) { return x.value === v; })[0];
            it.section = q.list[0];
            update(it, 'sections', q.list.slice(), true);
            O.refreshStats();
        })));
        box.appendChild(row('يعرض', pills(all.map(function (k) { return { label: O.SECTIONS[k].label, value: k }; }), cur, function (v) {
            var next = cur.indexOf(v) === -1 ? cur.concat([v]) : cur.filter(function (x) { return x !== v; });
            if (!next.length) return;
            it.section = next[0];
            update(it, 'sections', next, true);
            O.refreshStats();
        }, true), true, 'اختر واحد أو أكثر — أكثر من واحد يتبدّلون'));
        if (cur.length > 1) {
            var cyc = Number(it.cycle) || 10;
            var cw = el('div', 'ob-pills');
            O.THRONE_CYCLES.forEach(function (n) {
                cw.appendChild(button(n + ' ث', 'ob-pill' + (cyc === n ? ' on' : ''), function () { update(it, 'cycle', n, true); }));
            });
            var cn = document.createElement('input');
            cn.type = 'number';
            cn.min = '3'; cn.max = '300'; cn.step = '1';
            cn.inputMode = 'numeric';
            cn.className = 'ob-input num';
            cn.style.maxWidth = '84px';
            cn.value = cyc;
            cn.setAttribute('aria-label', 'مدة التبديل بالثواني');
            cn.addEventListener('change', function () {
                var v = Math.round(Number(cn.value));
                if (!(v >= 3)) v = 3;
                if (v > 300) v = 300;
                cn.value = v;
                update(it, 'cycle', v, true);
            });
            cw.appendChild(cn);
            box.appendChild(row('مدة التبديل', cw, true, 'بالثواني (3–300) — كل كم ثانية يتبدّل بين ' + cur.map(function (k) { return O.SECTIONS[k].label; }).join(' و')));
            box.appendChild(row('حركة التبديل', pills(O.THRONE_FX.map(function (f) { return { label: f.label, value: f.key }; }), it.transition || 'flip', function (v) {
                update(it, 'transition', v, true);
                setTimeout(function () { if (O.throneDemo) O.throneDemo(it.id); }, 900);
            }), true, 'شكل الحركة لما يتبدّل القسم أو يتغيّر شخص'));
        }
        var stack = it.design === 'stack';
        if (stack) {
            var cnt = Math.min(10, Math.max(1, Math.round(Number(it.top) || 10)));
            var nw = el('div', 'ob-pills');
            O.STACK_COUNTS.forEach(function (n) {
                nw.appendChild(button('توب ' + n, 'ob-pill' + (cnt === n ? ' on' : ''), function () { update(it, 'top', n, true); O.refreshStats(); }));
            });
            var ni = document.createElement('input');
            ni.type = 'number'; ni.min = '1'; ni.max = '10'; ni.step = '1'; ni.inputMode = 'numeric';
            ni.className = 'ob-input num';
            ni.style.cssText = 'width:64px;flex:none';
            ni.value = cnt;
            ni.setAttribute('aria-label', 'عدد الأشخاص');
            ni.addEventListener('change', function () {
                var v = Math.min(10, Math.max(1, Math.round(Number(ni.value) || 1)));
                ni.value = v;
                update(it, 'top', v, true);
                O.refreshStats();
            });
            nw.appendChild(ni);
            box.appendChild(row('عدد الأشخاص', nw, true, 'من 1 لين 10'));
        }
        var frameOpts = Object.keys(O.THRONE_FRAMES).map(function (k) { return { label: O.THRONE_FRAMES[k].label, value: k }; });
        // «الفراشات» للتوب 3 بس
        if (stack) frameOpts = [{ label: 'حلقة دوّارة', value: 'ring' }].concat(frameOpts.filter(function (o) { return !O.THRONE_FRAMES[o.value].code; }), [{ label: 'بدون', value: 'none' }]);
        var fk = (O.THRONE_FRAMES[it.frame] && !(stack && O.THRONE_FRAMES[it.frame].code)) || (stack && (it.frame === 'none' || it.frame === 'ring')) ? it.frame : (stack ? 'ring' : 'angel');
        box.appendChild(row('شكل الإطار', pills(frameOpts, fk, function (v) {
            if (it.frameColor !== 'custom') it.frameColor = 'original';
            update(it, 'frame', v, true);
        }), true, 'اللي حول صورة كل واحد'));
        var curFc = it.frameColor || 'original';
        if (curFc === 'ice' && fk === 'angel') curFc = 'original';
        var fw = el('div', 'ob-sw');
        O.FRAME_COLORS.forEach(function (c) {
            var b = button('', curFc === c.key ? 'on' : '', function () { update(it, 'frameColor', c.key, true); });
            b.style.background = c.sw || ('linear-gradient(135deg,#fff 0 30%,' + (O.THRONE_FRAMES[fk] ? O.THRONE_FRAMES[fk].glow2 : '#b28cf5') + ')');
            b.title = c.label;
            b.setAttribute('aria-label', 'إطار ' + c.label);
            fw.appendChild(b);
        });
        var fp = document.createElement('input');
        fp.type = 'color';
        fp.value = /^#[0-9a-f]{6}$/i.test(it.frameCustom || '') ? it.frameCustom : '#7fd0ff';
        fp.title = 'لون مخصص';
        fp.setAttribute('aria-label', 'لون إطار مخصص');
        if (it.frameColor === 'custom') fp.className = 'on';
        fp.addEventListener('input', function () { it.frameCustom = fp.value; it.frameColor = 'custom'; commit(); rebuildNode(it); });
        fp.addEventListener('change', function () { renderPanel(); });
        fw.appendChild(fp);
        // الحلقة الدوّارة لونها من ألوان المراكز — لون الإطار للرسمات بس
        if (fk === 'butterfly') {
            box.appendChild(row('لون قوس الضوء', fw, true, 'القوس والغبار اللي حول الحلقة — أو اختر أي لون'));
            optColor(it, box, 'flyColor', 'لون الفراشات', 'فاضي = نفس لون القوس');
            optColor(it, box, 'ringColor', 'لون الحلقة', 'الافتراضي أبيض');
            optColor(it, box, 'rankText', 'لون رقم الترتيب', 'الرقم داخل الدائرة اللي على الحلقة');
            optColor(it, box, 'coinColor', 'لون العملة', 'الافتراضي ذهبي');
        } else if (fk === 'stardust') {
            box.appendChild(row('لون المذنّبين', fw, true, 'الضوء اللي يلف حول الصورة — أو اختر أي لون'));
            optColor(it, box, 'dustColor', 'لون الغبار', 'فاضي = نفس لون المذنّبين');
            optColor(it, box, 'ringColor', 'حد دائرة الترتيب', 'الافتراضي أبيض');
            optColor(it, box, 'rankText', 'لون رقم الترتيب', 'الرقم داخل الدائرة اللي على الإطار');
            optColor(it, box, 'coinColor', 'لون العملة', 'الافتراضي ذهبي');
        } else if (O.THRONE_FRAMES[fk]) box.appendChild(row('لون الإطار والتوهّج', fw, true, 'الرسمة والضوء اللي يلف والشرار حول الصور — أو اختر أي لون'));
        box.appendChild(row('ألوان المراكز', pills([{ label: 'ذهبي وفضي وبرونزي', value: 'medal' }, { label: 'لون واحد', value: 'single' }, { label: 'مخصص', value: 'custom' }], it.palette || 'medal', function (v) {
            if (v === 'custom' && !Array.isArray(it.rankColors)) it.rankColors = ['#ffd54a', '#eef2f7', '#ffb27a'];
            update(it, 'palette', v, true);
        }), true, 'حدود الأرقام وأيقوناتها'));
        if (it.palette === 'single') box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
        if (it.palette === 'custom') {
            ['الأول', 'الثاني', 'الثالث'].forEach(function (lbl, k) {
                box.appendChild(row('لون ' + lbl, swatches((it.rankColors || [])[k], function (c) {
                    var a = (Array.isArray(it.rankColors) ? it.rankColors : ['#ffd54a', '#eef2f7', '#ffb27a']).slice();
                    a[k] = c;
                    update(it, 'rankColors', a, true);
                }), true, O.THRONE_FRAMES[fk] && O.THRONE_FRAMES[fk].code ? 'دائرة الترتيب وحدود المربع' : 'ماسة الرقم وحدود الكبسولة'));
            });
        }
        optColor(it, box, 'nameColor', 'لون الاسم');
        optColor(it, box, 'numColor', 'لون الرقم', 'عدد التكبيسات أو الدعم');
        optColor(it, box, 'pillColor', 'خلفية الكبسولة', 'الكبسولة اللي فيها العدد');
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري — فاضي = بدون عنوان'));
        if (stack) box.appendChild(row('التباعد', slider(0, 2, 0.02, it.spacing == null ? (fk === 'pegasus' ? 0.95 : fk === 'crystal' ? 0.6 : fk === 'angel' ? 0.55 : 0.32) : it.spacing, function (v) { update(it, 'spacing', v); }), false, 'المسافة بين البطاقات'));
        else box.appendChild(row('التباعد', slider(-0.8, 5, 0.05, it.spacing == null ? 0.15 : it.spacing, function (v) { update(it, 'spacing', v); }), false, 'المسافة بين الثلاثة'));
        box.appendChild(row('الحجم', slider(1.5, 9, 0.1, it.size, function (v) { update(it, 'size', v); })));
    }

    function topProps(it, box) {
        var designs0 = (O.VEYRO_DESIGNS || []).concat(O.DESIGNS.filter(function (d) { return d.key !== 'podium'; }));
        if (it.design === 'throne' || it.design === 'stack') {
            box.appendChild(row('التصميم', pills(opts(designs0), it.design, function (v) {
                if (v === it.design) return;
                if (v === 'stack') { it.top = 10; it.frame = 'ring'; }
                else if (v === 'throne') { it.top = 3; if (it.frame === 'ring' || it.frame === 'none') it.frame = 'angel'; }
                else it.section = (it.sections && it.sections[0]) || it.section;
                update(it, 'design', v, true);
                O.refreshStats();
            }), true));
            throneProps(it, box);
            return;
        }
        box.appendChild(row('القسم', pills(sectionOpts(), it.section, function (v) {
            var oldTitle = (O.SECTIONS[it.section] || {}).title;
            if (!it.title || it.title === oldTitle) it.title = O.SECTIONS[v].title;
            update(it, 'section', v, true);
            O.refreshStats();
        }), true));
        // «العرش» بدل منصة التتويج القديمة، وحده الأقصى 3
        var designs = designs0;
        var curD = designs.filter(function (d) { return d.key === it.design; })[0] || designs[1] || designs[0];
        box.appendChild(row('التصميم', pills(opts(designs), curD.key, function (v) {
            var d = designs.filter(function (x) { return x.key === v; })[0];
            if (d && d.max && (Number(it.top) || 3) > d.max) it.top = d.max;
            if ((v === 'throne' || v === 'stack') && !it.sections) it.sections = [it.section || 'likers'];
            if (v === 'stack') { it.top = 10; it.frame = 'ring'; }
            update(it, 'design', v, true);
            O.refreshStats();
        }), true));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري — فاضي = بدون عنوان'));
        var counts = O.TOPS.filter(function (n) { return !curD.max || n <= curD.max; });
        box.appendChild(row('عدد الأشخاص', pills(counts.map(function (n) { return { label: String(n), value: n }; }), Math.min(Number(it.top) || 3, curD.max || 99), function (v) {
            update(it, 'top', v, true);
            O.refreshStats();
        }), false, curD.max ? 'الحد ' + curD.max : ''));
        sizeColor(it, box, 1.5, 9);
    }

    function goalProps(it, box) {
        box.appendChild(row('يحسب', pills(metricOpts(['likes', 'diamonds', 'donations', 'follows', 'gifts', 'shares', 'comments']), it.metric, function (v) {
            if (!it.title || /^هدف /.test(it.title)) it.title = 'هدف ' + O.METRICS[v].name;
            update(it, 'metric', v, true);
        }), true));
        var num = document.createElement('input');
        num.type = 'number';
        num.min = '1';
        num.inputMode = 'numeric';
        num.className = 'ob-input num';
        num.value = it.target;
        num.addEventListener('input', function () { var v = Math.floor(Number(num.value)); if (v > 0) update(it, 'target', v); });
        box.appendChild(row('الهدف', num));
        box.appendChild(row('لما يوصل ينتقل للي بعده', toggle(it.autoNext, function (v) { update(it, 'autoNext', v); })));
        box.appendChild(row('التصميم', pills(opts(O.GOAL_DESIGNS.concat(O.VEYRO_GOAL_DESIGNS)), it.design || 'bar', function (v) {
            if (v === 'orb' && !it.palette) { it.palette = 'lavender'; it.speed = 'normal'; it.bubbles = true; }
            update(it, 'design', v, true);
        })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, it.design === 'orb' ? 'فاضي = بدون عنوان' : ''));
        if (it.design === 'orb') { orbProps(it, box); return; }
        sizeColor(it, box, 1.5, 9);
    }

    /** «كرة القمر»: الألوان (لوحات جاهزة + كل لون لحاله)، سرعة الموج، الفقاعات، والأرقام. */
    function orbProps(it, box) {
        box.appendChild(el('div', 'ob-hint', 'تتعبّى حسب ' + (it.metric === 'diamonds' ? 'دعم تيك توك (العملات)' : O.METRICS[it.metric] ? O.METRICS[it.metric].name : '') + '. دعم الدونيشن يتربط قريباً مع Streamlabs.'));
        var pg = el('div', 'vo-pals');
        Object.keys(O.ORB_PALETTES).forEach(function (k) {
            var pal = O.ORB_PALETTES[k];
            var b = button('', 'vo-pal' + ((it.palette || 'lavender') === k && !(it.orb && Object.keys(it.orb).length) ? ' on' : ''), function () { it.orb = {}; update(it, 'palette', k, true); });
            var dot = el('i');
            dot.style.background = 'linear-gradient(180deg,' + pal.top + ',' + pal.bottom + ')';
            dot.style.boxShadow = '0 0 0 2px ' + pal.ring;
            b.appendChild(dot);
            b.appendChild(el('span', null, pal.label));
            pg.appendChild(b);
        });
        box.appendChild(row('الألوان', pg, true));
        var cur = O.orbColors(it);
        function colorPick(label, key) {
            var w = el('label', 'vo-cp');
            var inp = document.createElement('input');
            inp.type = 'color';
            inp.value = cur[key];
            inp.addEventListener('input', function () { it.orb = Object.assign({}, it.orb || {}); it.orb[key] = inp.value; commit(); rebuildNode(it); });
            w.appendChild(inp);
            w.appendChild(el('span', null, label));
            return w;
        }
        var cg = el('div', 'vo-cps');
        [['السائل فوق', 'top'], ['السائل تحت', 'bottom'], ['الحلقة', 'ring'], ['التوهّج', 'glow'], ['القمر', 'moon'], ['الغيوم', 'cloud']].forEach(function (x) { cg.appendChild(colorPick(x[0], x[1])); });
        box.appendChild(row('كل لون لحاله', cg, true, 'يبدأ من اللوحة اللي اخترتها'));
        box.appendChild(row('حركة الموج', pills([{ label: 'هادية', value: 'slow' }, { label: 'عادية', value: 'normal' }, { label: 'سريعة', value: 'fast' }], it.speed || 'normal', function (v) { update(it, 'speed', v, true); })));
        box.appendChild(row('فقاعات', toggle(it.bubbles !== false, function (v) { update(it, 'bubbles', v); })));
        box.appendChild(row('الأرقام تحت', toggle(it.showNums !== false, function (v) { update(it, 'showNums', v, true); })));
        if (it.showNums !== false) box.appendChild(row('النسبة ٪', toggle(Boolean(it.showPct), function (v) { update(it, 'showPct', v); })));
        box.appendChild(row('الحجم', slider(1.5, 12, 0.1, it.size, function (v) { update(it, 'size', v); })));
        box.appendChild(row('جرّب التعبئة', (function () {
            var w = el('div', 'ob-pills');
            [['ربع', 0.25], ['نص', 0.5], ['كامل', 1]].forEach(function (x) {
                w.appendChild(button(x[0], 'ob-pill', function () { O.orbDemo(nodes[it.id], x[1]); }));
            });
            return w;
        })(), true, 'يورّيك حركة السائل وهو يتعبّى (بالمعاينة بس)'));
    }

    function counterProps(it, box) {
        var cur2 = Array.isArray(it.metrics) ? it.metrics : [];
        box.appendChild(row('العدّادات', pills(metricOpts(Object.keys(O.METRICS)), cur2, function (v) {
            var next = cur2.indexOf(v) === -1 ? cur2.concat([v]) : cur2.filter(function (m) { return m !== v; });
            if (!next.length) return;
            update(it, 'metrics', next, true);
        }, true), true));
        box.appendChild(row('التصميم', pills(opts(O.COUNTER_DESIGNS), it.design || 'pills', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري'));
        sizeColor(it, box, 1.5, 9);
    }

    function jarProps(it, box) {
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري'));
        box.appendChild(row('تحت الوعاء', pills([{ label: 'مجموع الماس', value: 'diamonds' }, { label: 'عدد الهدايا', value: 'gifts' }, { label: 'بدون', value: 'none' }], it.counter || 'diamonds', function (v) { update(it, 'counter', v, true); }), true));
        sizeColor(it, box, 1, 8);
        var demo = el('div', 'ob-actions');
        demo.appendChild(button('جرّب سقوط هدايا', 'ob-btn primary', function () { O.jarDemo(6); }));
        demo.appendChild(button('فرّغ التجربة', 'ob-btn ghost', function () { O.jarClearDemo(); }));
        box.appendChild(demo);
    }

    /* ---------------- Streamlabs (الدونيشن — كريترز/دكان تب وغيره) ----------------
     * الستريمر يلصق «Socket API Token» من Streamlabs مرة وحدة، والسيرفر يتصل بحسابه طول الوقت.
     * الرمز ما يرجع للواجهة أبداً — نعرض الحالة بس. */
    var slState = { loaded: false, loading: false, data: null, list: [], busy: false, msg: '', ok: false };
    var SL_ERR = {
        invalid_token: 'الرمز غلط أو انلغى — انسخه من جديد من Streamlabs',
        timeout: 'ما رد Streamlabs — تأكد من الرمز وجرّب مرة ثانية',
        not_linked: 'حسابك مو مربوط بـStreamlabs',
        not_streamer: 'الربط لحسابات الستريمر'
    };
    function slRepaint() {
        var cards = document.querySelectorAll('.vy-sl');
        for (var i = 0; i < cards.length; i++) fillStreamlabs(cards[i]);
    }
    function loadStreamlabs(force) {
        if (slState.loading || (slState.loaded && !force)) return;
        slState.loading = true;
        Promise.all([api('GET', '/api/streamlabs'), api('GET', '/api/streamlabs/donations?limit=20')]).then(function (r) {
            slState.loading = false;
            slState.loaded = true;
            if (r[0] && r[0].success) slState.data = r[0];
            slState.list = (r[1] && r[1].donations) || [];
            slRepaint();
        }).catch(function () { slState.loading = false; });
    }
    function slCall(path, body, okMsg) {
        slState.busy = true; slState.msg = ''; slRepaint();
        return api('POST', path, body || {}).then(function (d) {
            slState.busy = false;
            if (!d || !d.success) { slState.ok = false; slState.msg = (d && SL_ERR[d.error]) || 'ما قدرنا نحفظ — جرّب بعد شوي'; slRepaint(); return; }
            slState.data = d; slState.ok = true; slState.msg = okMsg || '';
            loadStreamlabs(true);
        }).catch(function () { slState.busy = false; slState.ok = false; slState.msg = 'تعذّر الوصول للسيرفر'; slRepaint(); });
    }
    function streamlabsCard() {
        var c = el('div', 'ob-card vy-sl');
        loadStreamlabs();
        fillStreamlabs(c);
        return c;
    }
    function fmtUsd(a, cur0) { return O.fmtMoney ? O.fmtMoney(a, cur0) : '$' + a; }
    function fillStreamlabs(c) {
        c.textContent = '';
        var d = slState.data || {};
        var st = !slState.loaded ? 'loading' : !d.linked ? 'none' : d.status || 'connecting';
        var head = el('div', 'vy-sl-head');
        var dot = el('span', 'dot s-' + st);
        head.appendChild(dot);
        head.appendChild(el('h3', null, 'Streamlabs — الدونيشن'));
        head.appendChild(el('span', 'vy-sl-st', { loading: '…', none: 'مو مربوط', connecting: 'يتصل…', connected: 'متصل ✓', invalid_token: 'الرمز مرفوض', error: 'خطأ' }[st] || st));
        c.appendChild(head);
        c.appendChild(el('div', 'ob-hint', 'أي دعم يوصل لحسابك في Streamlabs (من كريترز/دكان تب، PayPal وغيرها) يطلع بأليرتاتك والتوب والهدف و«آخر دعم» — حتى لو كنت مو في بث.'));
        if ((st === 'none' || st === 'invalid_token') && d.oauth) {
            // زر «اربط Streamlabs» (OAuth) — يطلع بس لما المنصة سجّلت تطبيقها عند Streamlabs
            var ob = button(slState.busy ? 'يفتح Streamlabs…' : 'اربط Streamlabs', 'ob-btn primary lg', function () {
                slState.busy = true; slRepaint();
                api('GET', '/api/streamlabs/oauth/start').then(function (r) {
                    if (r && r.success && r.url) { location.href = r.url; return; }
                    slState.busy = false; slState.ok = false; slState.msg = 'الربط بزر Streamlabs مو متاح الحين — استخدم لصق الرمز تحت'; slRepaint();
                }).catch(function () { slState.busy = false; slState.ok = false; slState.msg = 'تعذّر الوصول للسيرفر'; slRepaint(); });
            });
            ob.disabled = slState.busy;
            ob.style.width = '100%';
            c.appendChild(ob);
            c.appendChild(el('div', 'ob-hint', 'تسجّل دخول بـStreamlabs وتوافق، وترجع هنا متصل. أو الصق الرمز يدوياً:'));
        }
        if (st === 'none' || st === 'invalid_token') {
            var steps = el('ol', 'ob-steps');
            ['افتح streamlabs.com وسجّل دخول', 'Settings ← API Settings ← تبويب API Tokens', 'انسخ «Your Socket API Token»', 'الصقه هنا واضغط «ربط»'].forEach(function (t) { steps.appendChild(el('li', null, t)); });
            c.appendChild(steps);
            var inp = document.createElement('input');
            inp.className = 'ob-input';
            inp.dir = 'ltr';
            inp.placeholder = 'Socket API Token';
            inp.autocomplete = 'off';
            inp.spellcheck = false;
            c.appendChild(row('الرمز', inp, true));
            var a = el('div', 'ob-actions');
            var b = button(slState.busy ? 'يتأكد من الرمز…' : 'ربط', 'ob-btn primary', function () {
                if (!inp.value.trim()) { slState.ok = false; slState.msg = 'الصق الرمز أول'; slRepaint(); return; }
                slCall('/api/streamlabs/link', { token: inp.value.trim() }, 'انربط ✓ — الدونيشن بيوصل لشاشاتك');
            });
            b.disabled = slState.busy;
            a.appendChild(b);
            c.appendChild(a);
        } else {
            c.appendChild(row('تصفير تلقائي مع كل بث', toggle(d.autoReset, function (on) { slCall('/api/streamlabs/settings', { autoReset: on }); }), false, 'التوب والهدف يبدون من الصفر مع كل بث جديد'));
            var since = d.counterFrom ? new Date(d.counterFrom).toLocaleString('ar', { dateStyle: 'medium', timeStyle: 'short' }) : '';
            var a2 = el('div', 'ob-actions');
            a2.appendChild(button('تصفير عدّاد الدونيشن', 'ob-btn ghost', function () { if (confirm('التوب والهدف والإحصائيات للدونيشن بيبدون من الصفر. السجل يبقى. تكمل؟')) slCall('/api/streamlabs/reset', {}, 'تصفّر العدّاد ✓'); }));
            a2.appendChild(button('فصل Streamlabs', 'ob-btn danger', function () { if (confirm('يوقف وصول الدونيشن لـVeyro. تكمل؟')) slCall('/api/streamlabs/unlink', {}, 'انفصل'); }));
            c.appendChild(a2);
            if (since) c.appendChild(el('div', 'ob-hint', 'العدّاد يحسب من: ' + since));
        }
        if (slState.msg) c.appendChild(el('div', slState.ok ? 'ob-hint vy-sl-ok' : 'ob-warn', slState.msg));
        if (d.linked) {
            c.appendChild(el('div', 'ob-gtitle', 'آخر الدونيشن'));
            if (!slState.list.length) c.appendChild(el('div', 'ob-hint', 'ما وصل شي للحين — جرّب «Test Donation» من Streamlabs.'));
            var lst = el('div', 'vy-sl-list');
            slState.list.forEach(function (x) {
                var r0 = el('div', 'vy-sl-row');
                r0.appendChild(el('b', null, x.name));
                r0.appendChild(el('span', 'amt', fmtUsd(x.amount, x.currency)));
                var tag = x.isTest ? 'تجربة' : String(x.currency).toUpperCase() !== 'USD' ? 'عملة مختلفة — ما تنحسب' : '';
                if (tag) r0.appendChild(el('small', 'tag', tag));
                r0.appendChild(el('small', 'when', new Date(x.at).toLocaleString('ar', { dateStyle: 'short', timeStyle: 'short' })));
                lst.appendChild(r0);
            });
            c.appendChild(lst);
        }
    }

    // رجوع من صفحة موافقة Streamlabs (OAuth): veyro/index.html?sl=<نتيجة>#tools/donations
    (function slOAuthReturn() {
        var q = new URLSearchParams(location.search);
        var r = q.get('sl');
        if (!r) return;
        q.delete('sl');
        try { history.replaceState(null, '', location.pathname + (q.toString() ? '?' + q.toString() : '') + location.hash); } catch (e) { /* ignore */ }
        var M = { ok: 'انربط Streamlabs ✓ — الدونيشن بيوصل لشاشاتك', cancelled: 'ألغيت الربط من Streamlabs', expired: 'انتهت مهلة الربط — جرّب مرة ثانية', invalid_token: 'Streamlabs رفض الرمز — جرّب مرة ثانية', timeout: 'ما رد Streamlabs — جرّب بعد شوي', failed: 'ما قدرنا نكمل الربط — جرّب مرة ثانية أو الصق الرمز يدوياً' };
        slState.ok = r === 'ok';
        slState.msg = M[r] || M.failed;
        setTimeout(function () { toast(slState.msg); }, 800);
    }());

    function lastDonationProps(it, box) {
        box.appendChild(row('العنوان', textInput(it.title, 40, function (v) { update(it, 'title', v); }), false, 'اختياري — فاضي = بدون عنوان'));
        box.appendChild(row('رسالة الداعم', toggle(it.showMessage, function (on) { update(it, 'showMessage', on); }), false, 'الرسالة اللي يكتبها الداعم تطلع على البث — مقفلة افتراضياً'));
        sizeColor(it, box, 1, 8);
        box.appendChild(streamlabsCard());
    }

    /* ---------------- أدوات الصوت: القارئ الصوتي ومشغّل الأغاني ---------------- */

    /** «جرّب»/«تخطي»/«إيقاف» يوصل لرابط الشاشة (المحرر صامت). */
    function tryAudio(it, type, okMsg) {
        if (!cur) return;
        if (save.pending) flush();
        api('POST', '/api/screens/test-alert', { id: cur.id, itemId: it.id, type: type }).then(function (d) {
            if (!d || !d.success) { toast('ما وصلت لشاشة البث — حدّث الصفحة وجرّب'); return; }
            var m = liveMsg();
            toast(m.state === 'ok' ? okMsg : m.tip);
        }).catch(function () { toast('ما وصلت لشاشة البث — تأكد من الاتصال'); });
    }

    function enabledRow(it, box, label) {
        box.appendChild(row(label, toggle(it.enabled !== false, function (on) { update(it, 'enabled', on, true); })));
    }

    function volumeRow(it, box, def) {
        var v = it.volume == null ? def : Number(it.volume);
        box.appendChild(row('مستوى الصوت', slider(0, 1, 0.05, v, function (x) { update(it, 'volume', x); })));
    }

    function ttsProps(it, box) {
        enabledRow(it, box, 'تشغيل القارئ');
        box.appendChild(row('الصوت', pills([{ label: 'نسائي', value: 'f' }, { label: 'رجالي', value: 'm' }], it.voice === 'm' ? 'm' : 'f', function (v) { update(it, 'voice', v, true); })));
        box.appendChild(row('السرعة', pills([{ label: 'بطيء', value: 0.8 }, { label: 'عادي', value: 1 }, { label: 'سريع', value: 1.25 }], Number(it.rate) || 1, function (v) { update(it, 'rate', v, true); })));
        volumeRow(it, box, 0.9);
        box.appendChild(row('يقرأ الاسم', toggle(it.readName !== false, function (on) { update(it, 'readName', on); }), false, '«فهد يقول: …» قبل الرسالة'));
        box.appendChild(row('أقل طول', numInput(it.minLen || 2, 1, 50, '2', function (n) { update(it, 'minLen', n || 2); }), false, 'الرسائل الأقصر ما تنقرى'));
        box.appendChild(row('أقصى طول', numInput(it.maxLen || 200, 10, 200, '200', function (n) { update(it, 'maxLen', n || 200); }), false, 'الأطول تنقص'));
        box.appendChild(row('تجاهل الأوامر', toggle(it.skipCommands !== false, function (on) { update(it, 'skipCommands', on); }), false, 'الرسائل اللي تبدأ بـ!'));
        box.appendChild(row('تجاهل الروابط', toggle(it.skipLinks !== false, function (on) { update(it, 'skipLinks', on); })));
        var banned = Array.isArray(it.banned) ? it.banned.join('، ') : String(it.banned || '');
        box.appendChild(row('كلمات ممنوعة', textInput(banned, 600, function (v) {
            update(it, 'banned', v.split(/[,،\n]/).map(function (w) { return w.trim(); }).filter(Boolean).slice(0, 60));
        }, true), true, 'افصل بينها بفاصلة — الرسالة اللي فيها وحدة منها ما تنقرى'));
        box.appendChild(row('فقاعة الرسالة', toggle(it.bubble !== false, function (on) { update(it, 'bubble', on); }), false, 'تعرض الاسم والرسالة وقت القراءة'));
        sizeColor(it, box, 1, 8);
        var a = el('div', 'ob-actions');
        a.appendChild(button('جرّب على شاشة البث', 'ob-btn primary', function () { tryAudio(it, 'tts', 'التجربة بتنقرى بشاشة البث بعد ثواني…'); }));
        box.appendChild(a);
    }

    var audioKey = { loaded: false, loading: false, has: false };
    function loadAudioKey() {
        if (audioKey.loaded || audioKey.loading) return;
        audioKey.loading = true;
        api('GET', '/api/screens/audio-key').then(function (d) {
            audioKey.loading = false;
            audioKey.loaded = true;
            audioKey.has = Boolean(d && d.hasKey);
            renderPanel();
        }).catch(function () { audioKey.loading = false; });
    }
    function saveAudioKey(value) {
        api('POST', '/api/screens/audio-key', { youtubeKey: value || null }).then(function (d) {
            if (!d || !d.success) { toast(d && d.error === 'invalid_key' ? 'المفتاح شكله غلط — انسخه كامل من Google Cloud' : 'ما انحفظ المفتاح، جرّب مرة ثانية'); return; }
            audioKey.has = Boolean(d.hasKey);
            toast(d.hasKey ? 'انحفظ مفتاحك ✓' : 'انمسح مفتاحك — يرجع يستخدم مفتاح المنصة');
            renderPanel();
        }).catch(function () { toast('ما انحفظ المفتاح — تأكد من الاتصال'); });
    }

    function musicProps(it, box) {
        enabledRow(it, box, 'تشغيل المشغّل');
        box.appendChild(row('أمر التشغيل', textInput(it.playCmd || '!تشغيل', 20, function (v) { update(it, 'playCmd', v.trim() || '!تشغيل'); }), false, 'المشاهد يكتبه وبعده اسم الأغنية'));
        box.appendChild(row('أمر التخطي', textInput(it.skipCmd || '!تخطي', 20, function (v) { update(it, 'skipCmd', v.trim() || '!تخطي'); }), false, 'لك أنت بس'));
        volumeRow(it, box, 0.6);
        box.appendChild(row('أقصى مدة', numInput(Math.round((Number(it.maxDurSec) || 360) / 60), 1, 60, '6', function (n) { update(it, 'maxDurSec', (n || 6) * 60); }), false, 'بالدقايق — الأطول ما تشتغل'));
        box.appendChild(row('حد الطابور', numInput(it.maxQueue || 10, 1, 50, '10', function (n) { update(it, 'maxQueue', n || 10); }), false, 'كل مشاهد له طلب واحد بالطابور'));
        box.appendChild(row('الشكل', pills([{ label: 'أيقونة + اسم الأغنية', value: 'card' }, { label: 'أيقونة بس', value: 'icon' }], it.design === 'icon' ? 'icon' : 'card', function (v) { update(it, 'design', v, true); }), true));
        sizeColor(it, box, 1, 8);
        var a = el('div', 'ob-actions');
        a.appendChild(button('جرّب أغنية', 'ob-btn primary', function () { tryAudio(it, 'music', 'أغنية التجربة بتشتغل بشاشة البث بعد ثواني…'); }));
        a.appendChild(button('تخطي', 'ob-btn ghost', function () { tryAudio(it, 'music-skip', 'تم التخطي بشاشة البث'); }));
        a.appendChild(button('إيقاف وتفريغ الطابور', 'ob-btn ghost', function () { tryAudio(it, 'music-stop', 'وقف المشغّل بشاشة البث'); }));
        box.appendChild(a);

        loadAudioKey();
        var kc = el('div', 'ob-card');
        kc.appendChild(el('h3', null, 'مفتاح يوتيوب الخاص (اختياري)'));
        kc.appendChild(el('div', 'ob-hint', 'المنصة عندها مفتاح مشترك بحد يومي. لو تبي طلبات أكثر، حط مفتاح YouTube Data API v3 من حسابك بـGoogle Cloud. مفتاحك ينحفظ بالسيرفر وما يطلع لأحد.'));
        var kin = textInput('', 60, function () {});
        kin.dir = 'ltr';
        kin.placeholder = audioKey.has ? 'محفوظ ✓ — اكتب مفتاح جديد لتغييره' : 'AIza…';
        kc.appendChild(row(audioKey.has ? 'المفتاح: محفوظ ✓' : 'المفتاح', kin, true));
        var ka = el('div', 'ob-actions');
        ka.appendChild(button('حفظ المفتاح', 'ob-btn primary', function () { if (kin.value.trim()) saveAudioKey(kin.value.trim()); }));
        if (audioKey.has) ka.appendChild(button('مسح مفتاحي', 'ob-btn danger', function () { saveAudioKey(null); }));
        kc.appendChild(ka);
        box.appendChild(kc);

        box.appendChild(el('div', 'ob-warn', 'تيك توك ممكن يكتم صوت البث أو ينذرك بسبب حقوق الأغاني.'));
    }

    /* ---------------- أليرتات الفيديو: رفع + مكتبة + أداة التفريغ ---------------- */

    var media = { list: [], max: 10, maxBytes: 20 * 1024 * 1024, loaded: false, loading: false, failed: false, uploading: null };
    var UPLOAD_ERR = {
        file_too_large: 'الملف أكبر من الحد المسموح',
        too_many_files: 'وصلت لحد الملفات — احذف فيديو قديم',
        unsupported_type: 'الملف لازم يكون فيديو MP4 أو WebM أو MOV',
        empty_file: 'الملف فاضي',
        storage_unavailable: 'التخزين بالسيرفر مو متاح الحين — جرّب بعد شوي',
        not_streamer: 'أليرتات الفيديو لحسابات الستريمر'
    };

    function fmtSize(b) { return b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round((b || 0) / 1024)) + ' KB'; }
    function fmtDur(d) { d = Math.round(Number(d) || 0); return Math.floor(d / 60) + ':' + ('0' + (d % 60)).slice(-2); }

    function loadMedia(force) {
        if (media.loading || (media.loaded && !force)) return;
        media.loading = true;
        api('GET', '/api/screens/media').then(function (d) {
            if (d.success) {
                media.list = d.media || [];
                media.max = d.max || media.max;
                media.maxBytes = d.maxBytes || media.maxBytes;
                media.loaded = true;
                media.failed = false;
            } else media.failed = true;
        }).catch(function () { media.failed = true; }).then(function () {
            media.loading = false;
            syncLibKeys();
            if (view === 'editor' && (section === 'alerts' || section === 'library' || section === 'donations') && !selectedId) renderPanel();
        });
    }

    /** أبعاد الفيديو ومدته من المتصفح قبل الرفع (وتأكد إنه يشتغل). */
    function readVideoMeta(file) {
        return new Promise(function (resolve) {
            var v = document.createElement('video');
            var url = URL.createObjectURL(file);
            var t = setTimeout(function () { done({ ok: null }); }, 10000);
            function done(m) { clearTimeout(t); URL.revokeObjectURL(url); resolve(m); }
            v.preload = 'metadata';
            v.muted = true;
            v.onloadedmetadata = function () { done({ ok: true, w: v.videoWidth, h: v.videoHeight, d: v.duration }); };
            v.onerror = function () { done({ ok: false }); };
            v.src = url;
        });
    }

    function paintUpload() {
        var u = media.uploading;
        var bar = panel.querySelector('.vy-up-bar i');
        var pct = panel.querySelector('.vy-up-pct');
        if (u && bar) bar.style.width = u.pct + '%';
        if (u && pct) pct.textContent = u.pct + '%';
    }

    function uploadVideo(file) {
        if (!file || media.uploading) return;
        if (media.list.length >= media.max) { toast(UPLOAD_ERR.too_many_files); return; }
        if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) { toast(UPLOAD_ERR.unsupported_type); return; }
        if (file.size > media.maxBytes) { toast('حجم الملف ' + fmtSize(file.size) + ' — الحد ' + fmtSize(media.maxBytes)); return; }
        readVideoMeta(file).then(function (m) {
            if (m.ok === false) { toast('المتصفح ما قدر يشغّل هذا الفيديو — جرّب MP4 (H.264) أو WebM'); return; }
            if (m.d > 60) { toast('الأليرت لازم يكون دقيقة أو أقل'); return; }
            var name = file.name.replace(/\.[^.]+$/, '').slice(0, 60);
            media.uploading = { name: name, pct: 0 };
            renderPanel();
            var q = '?name=' + encodeURIComponent(name) + '&w=' + (m.w || 0) + '&h=' + (m.h || 0) + '&d=' + (Number(m.d) || 0).toFixed(2);
            var xhr = new XMLHttpRequest();
            xhr.open('POST', apiBase() + '/api/screens/media/upload' + q);
            xhr.setRequestHeader('Authorization', 'Bearer ' + token());
            xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
            xhr.upload.onprogress = function (ev) {
                if (ev.lengthComputable && media.uploading) { media.uploading.pct = Math.round(ev.loaded / ev.total * 100); paintUpload(); }
            };
            xhr.onload = function () {
                var d = {};
                try { d = JSON.parse(xhr.responseText); } catch (e) { d = {}; }
                media.uploading = null;
                if (d.success && d.media) {
                    media.list.unshift(d.media);
                    toast('انرفع «' + d.media.name + '» ✓ — فرّغه أو استخدمه كأليرت');
                } else toast(UPLOAD_ERR[d.error] || (xhr.status === 413 ? UPLOAD_ERR.file_too_large : 'ما انرفع الملف'));
                renderPanel();
            };
            xhr.onerror = function () { media.uploading = null; toast('ما انرفع الملف — تأكد من الاتصال'); renderPanel(); };
            xhr.send(file);
        });
    }

    function mediaUsed(id) {
        return screens.some(function (scr) {
            return (designOf(scr).items || []).some(function (it) { return it.video && it.video.id === id; });
        });
    }

    function deleteMedia(m) {
        if (!window.confirm('تحذف «' + m.name + '»؟' + (mediaUsed(m.id) ? ' فيه أليرتات بشاشاتك تستخدمه وبتوقف.' : ''))) return;
        api('POST', '/api/screens/media/delete', { id: m.id }).then(function (d) {
            if (!d.success) { toast('ما قدرنا نحذفه'); return; }
            media.list = media.list.filter(function (x) { return x.id !== m.id; });
            toast('انحذف الفيديو');
            renderPanel();
        }).catch(function () { toast('ما قدرنا نحذفه'); });
    }

    /* ---------------- «مكتبتي» وشروط الأليرتات ---------------- */

    function numInput(value, min, max, placeholder, onChange) {
        var i = document.createElement('input');
        i.type = 'number';
        i.inputMode = 'numeric';
        i.className = 'ob-input num';
        i.min = min; i.max = max;
        if (placeholder) i.placeholder = placeholder;
        i.value = value ? String(value) : '';
        i.addEventListener('input', function () {
            var n = i.value === '' ? 0 : Math.max(min, Math.min(max, Math.round(Number(i.value) || 0)));
            onChange(n);
        });
        return i;
    }

    function fmtNum(n) { return Number(n || 0).toLocaleString('en-US'); }

    /** وصف قصير لشرط الأليرت (للقوائم). */
    function trigSummary(it) {
        var E = O.ALERT_EVENTS_ALL;
        return (it.events || []).map(function (k) {
            var lab = (E[k] || {}).label || k;
            if (k === 'gift') {
                var mn = Number(it.minDiamonds) || 0, mx = Number(it.maxDiamonds) || 0;
                if (mn && mx) return lab + ' ' + fmtNum(mn) + '–' + fmtNum(mx) + ' عملة';
                if (mn) return lab + ' ' + fmtNum(mn) + '+ عملة';
                if (mx) return lab + ' لين ' + fmtNum(mx) + ' عملة';
                return lab;
            }
            if (k === 'like') return 'كل ' + fmtNum(Number(it.likeEvery) || 100) + ' تكبيسة' + (it.likeScope === 'all' ? ' (البث)' : '');
            if (k === 'donation') {
                if (it.amountMode === 'exact') return lab + ' $' + fmtNum(Number(it.exactAmount) || 0) + ' بالضبط';
                var a = Number(it.minAmount) || 0, b = Number(it.maxAmount) || 0;
                if (a && b) return lab + ' $' + fmtNum(a) + '–$' + fmtNum(b);
                if (a) return lab + ' $' + fmtNum(a) + '+';
                if (b) return lab + ' لين $' + fmtNum(b);
                return lab;
            }
            if ((k === 'join' || k === 'subscribe') && it.joinUsers && it.joinUsers.length) return lab + ' @' + it.joinUsers.slice(0, 2).join(' @') + (it.joinUsers.length > 2 ? '…' : '');
            return lab;
        }).join('، ');
    }

    /** «يشتغل مع» + شرط كل حدث: العملات من/إلى، كل كم تكبيسة، يوزرات معيّنة. */
    function triggerRows(it, box) {
        var evs = Array.isArray(it.events) ? it.events : [];
        var E = O.ALERT_EVENTS_ALL;
        box.appendChild(row('يشتغل مع', pills(Object.keys(E).map(function (x) { return { label: E[x].label, value: x }; }), evs, function (v) {
            var next = evs.indexOf(v) === -1 ? evs.concat([v]) : evs.filter(function (x) { return x !== v; });
            if (!next.length) return;
            update(it, 'events', next, true);
        }, true), true));
        if (evs.indexOf('gift') !== -1) {
            var g = el('div', 'va-range');
            g.appendChild(el('span', null, 'من'));
            g.appendChild(numInput(it.minDiamonds, 0, 1000000, '0', function (n) { it.minDiamonds = n; commit(); }));
            g.appendChild(el('span', null, 'إلى'));
            g.appendChild(numInput(it.maxDiamonds, 0, 1000000, 'بدون حد', function (n) { it.maxDiamonds = n; commit(); }));
            box.appendChild(row('عدد العملات (الهدايا)', g, true, 'الأليرت يشتغل لو الهدية بين الحدين — «إلى» فاضي = بدون حد أعلى'));
        }
        if (evs.indexOf('donation') !== -1) {
            // الدونيشن (Streamlabs — كريترز وغيره): مدى المبلغ بالدولار — أليرت مختلف لكل مبلغ
            var exact = it.amountMode === 'exact';
            box.appendChild(row('شرط المبلغ', pills([{ label: 'من وإلى', value: 'range' }, { label: 'مبلغ محدد', value: 'exact' }], exact ? 'exact' : 'range', function (v) { update(it, 'amountMode', v, true); })));
            var dg = el('div', 'va-range');
            if (exact) {
                dg.appendChild(el('span', null, '$'));
                dg.appendChild(numInput(it.exactAmount, 1, 1000000, '10', function (n) { it.exactAmount = n; commit(); }));
                box.appendChild(row('المبلغ', dg, true, 'الأليرت يشتغل بس لو الدعم بهالمبلغ بالضبط (بالدولار)'));
            } else {
                dg.appendChild(el('span', null, 'من $'));
                dg.appendChild(numInput(it.minAmount, 0, 1000000, '0', function (n) { it.minAmount = n; commit(); }));
                dg.appendChild(el('span', null, 'إلى $'));
                dg.appendChild(numInput(it.maxAmount, 0, 1000000, 'بدون حد', function (n) { it.maxAmount = n; commit(); }));
                box.appendChild(row('مبلغ الدونيشن', dg, true, 'بالدولار — الأليرت يشتغل لو الدعم بين الحدين، و«إلى» فاضي = بدون حد. سوّ أليرت لكل مبلغ'));
            }
            box.appendChild(row('رسالة الداعم', toggle(it.showMessage, function (on) { update(it, 'showMessage', on); }), false, 'الرسالة اللي يكتبها الداعم تطلع على البث — مقفلة افتراضياً'));
            if (!slState.loaded) loadStreamlabs();
            if (slState.loaded && !(slState.data && slState.data.linked)) box.appendChild(el('div', 'ob-warn', 'حسابك مو مربوط بـStreamlabs — اربطه من «الرابط والإعدادات» عشان يوصل الدونيشن.'));
        }
        if (evs.indexOf('like') !== -1) {
            var l = el('div', 'va-range');
            l.appendChild(el('span', null, 'كل'));
            l.appendChild(numInput(it.likeEvery || 100, 1, 1000000, '100', function (n) { it.likeEvery = Math.max(1, n); commit(); }));
            l.appendChild(el('span', null, 'تكبيسة'));
            box.appendChild(row('عدد التكبيسات', l, true));
            box.appendChild(row('تنحسب', pills([{ label: 'من نفس الشخص', value: 'user' }, { label: 'مجموع البث', value: 'all' }], it.likeScope === 'all' ? 'all' : 'user', function (v) {
                update(it, 'likeScope', v, true);
            }), true, it.likeScope === 'all' ? 'كل ما يعدّي مجموع تكبيسات البث الحد' : 'كل ما مشاهد يوصل للعدد (ومضاعفاته)'));
        }
        if (evs.indexOf('join') !== -1 || evs.indexOf('subscribe') !== -1) {
            var ta = textInput((it.joinUsers || []).map(function (u) { return '@' + u; }).join('\n'), 600, function (v) {
                it.joinUsers = v.split(/[\s,،]+/).map(function (u) { return u.trim().replace(/^@/, '').toLowerCase(); }).filter(Boolean).slice(0, 30);
                commit();
            }, true);
            ta.placeholder = '@username';
            ta.dir = 'ltr';
            box.appendChild(row(evs.indexOf('join') !== -1 ? 'دخولية لأشخاص معيّنين' : 'لمشتركين معيّنين', ta, true, 'يوزر تيك توك، كل واحد بسطر — فاضي = يشتغل للكل'));
        }
    }

    /** خانة رفع فيديو (بمكتبتي). */
    function uploadBox() {
        var drop = el('label', 'vy-drop' + (media.uploading ? ' busy' : ''));
        var inp = document.createElement('input');
        inp.type = 'file';
        inp.accept = 'video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov,.m4v';
        inp.hidden = true;
        inp.addEventListener('change', function () { var f = inp.files && inp.files[0]; inp.value = ''; uploadVideo(f); });
        drop.appendChild(inp);
        if (media.uploading) {
            drop.appendChild(el('b', null, 'يرفع «' + media.uploading.name + '»…'));
            var bar = el('span', 'vy-up-bar');
            var fill = el('i');
            fill.style.width = media.uploading.pct + '%';
            bar.appendChild(fill);
            drop.appendChild(bar);
            drop.appendChild(el('small', 'vy-up-pct', media.uploading.pct + '%'));
        } else {
            drop.appendChild(svgEl('upload'));
            drop.appendChild(el('b', null, 'ارفع فيديو أليرت'));
            drop.appendChild(el('small', null, 'اسحب الملف هنا أو اضغط — MP4 أو WebM أو MOV، لين ' + fmtSize(media.maxBytes) + ' ودقيقة'));
        }
        ['dragenter', 'dragover'].forEach(function (t) { drop.addEventListener(t, function (e) { e.preventDefault(); drop.classList.add('over'); }); });
        ['dragleave', 'drop'].forEach(function (t) { drop.addEventListener(t, function () { drop.classList.remove('over'); }); });
        drop.addEventListener('drop', function (e) {
            e.preventDefault();
            var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            uploadVideo(f);
        });
        return drop;
    }

    /** بطاقة فيديو بالمكتبة: معاينة (مفرّغة لو فيه تفريغ — تشتغل لما يمر عليها الماوس). */
    function libThumb(m) {
        var th = el('div', 'th');
        var v = document.createElement('video');
        v.muted = true; v.preload = 'metadata'; v.playsInline = true; v.loop = true; v.crossOrigin = 'anonymous';
        v.src = O.videoFileUrl(m.id) + '#t=0.4';
        th.appendChild(v);
        var kr = null;
        th.addEventListener('pointerenter', function () {
            if (m.key && m.key.on && !kr) {
                v.src = O.videoSrc(m.id);
                kr = O.makeKeyer(v, function () { return Object.assign({}, O.KEY_DEFAULT, m.key); });
                if (kr) { th.appendChild(kr.canvas); th.classList.add('keyed'); }
            }
            v.play().catch(function () {});
        });
        th.addEventListener('pointerleave', function () {
            v.pause();
            if (kr) { kr.destroy(); kr.canvas.remove(); kr = null; th.classList.remove('keyed'); }
        });
        th.appendChild(el('span', 'dur', fmtDur(m.d)));
        th.appendChild(el('span', 'kb' + (m.key && m.key.on ? ' on' : ''), m.key && m.key.on ? 'مفرّغ ✓' : 'بدون تفريغ'));
        return th;
    }

    /** يحفظ تفريغ فيديو بالمكتبة، ويحدّث أليرتات الشاشة المفتوحة اللي تستخدمه. */
    function saveLibKey(id, key, quiet) {
        var m = media.list.filter(function (x) { return x.id === id; })[0];
        if (m) m.key = key ? Object.assign({}, key) : null;
        syncLibKeys();
        return api('POST', '/api/screens/media/update', { id: id, key: key || null }).then(function (d) {
            if (d.success && d.media && m) m.key = d.media.key;
            if (!quiet) toast(d.success ? 'انحفظ بمكتبتك ✓' : 'ما انحفظ بالمكتبة');
        }).catch(function () { if (!quiet) toast('ما انحفظ بالمكتبة — تأكد من الاتصال'); });
    }

    /** أليرتات الشاشة المفتوحة تاخذ تفريغ المكتبة (المكتبة هي المرجع). */
    function syncLibKeys() {
        if (!cur || !media.loaded) return;
        var changed = false;
        S().items.forEach(function (it) {
            if (!O.isVideoAlert(it)) return;
            var m = media.list.filter(function (x) { return x.id === it.video.id; })[0];
            if (!m || !m.key) return;
            var want = Object.assign({}, O.KEY_DEFAULT, m.key);
            if (JSON.stringify(O.keyOf(it)) !== JSON.stringify(want)) { it.key = want; changed = true; rebuildNode(it); }
        });
        if (changed) commit();
    }

    function renameMedia(m) {
        var n = window.prompt('اسم الأليرت', m.name);
        if (n == null || !n.trim() || n.trim() === m.name) return;
        api('POST', '/api/screens/media/update', { id: m.id, name: n.trim() }).then(function (d) {
            if (!d.success) { toast('ما تغيّر الاسم'); return; }
            m.name = d.media.name;
            renderPanel();
        }).catch(function () { toast('ما تغيّر الاسم'); });
    }

    /** يفتح أداة التفريغ على فيديو بالمكتبة (بدون ما يكون بالشاشة). */
    function keyLibrary(m) {
        var pseudo = { video: { id: m.id, w: m.w, h: m.h, d: m.d, name: m.name }, key: m.key ? Object.assign({}, m.key) : null };
        openKeyTool(pseudo, function (draft) { saveLibKey(m.id, draft).then(function () { renderPanel(); }); });
    }

    function libraryPane(box) {
        loadMedia();
        box.appendChild(uploadBox());
        var head = el('div', 'vy-lib-head');
        head.appendChild(el('b', null, 'أليرتاتك'));
        head.appendChild(el('span', null, media.list.length + ' / ' + media.max));
        box.appendChild(head);
        if (!media.loaded) { box.appendChild(el('div', 'ob-hint', media.failed ? 'ما قدرنا نجيب ملفاتك — حدّث الصفحة.' : 'يحمّل…')); return; }
        if (!media.list.length) { box.appendChild(el('div', 'ob-hint', 'مكتبتك فاضية. ارفع فيديو، فرّغ خلفيته، ويصير جاهز تستخدمه كأليرت بأي شاشة.')); return; }
        var g = el('div', 'vy-libgrid');
        media.list.forEach(function (m) {
            var c = el('div', 'vy-lcard');
            c.appendChild(libThumb(m));
            var info = el('div', 'mi');
            var nb = button(m.name, 'nm', function () { renameMedia(m); });
            nb.title = 'غيّر الاسم';
            info.appendChild(nb);
            info.appendChild(el('small', null, fmtSize(m.size) + (m.w ? ' · ' + m.w + '×' + m.h : '') + ' · ' + fmtSec(m.d)));
            c.appendChild(info);
            var a = el('div', 'acts');
            a.appendChild(iconBtn('استخدمه كأليرت', 'plus', 'primary', function () { newAlertFrom(m); }));
            a.appendChild(iconBtn(m.key && m.key.on ? 'عدّل التفريغ' : 'فرّغه', 'wand', 'ghost', function () { keyLibrary(m); }));
            var rm = iconBtn('', 'trash', 'danger icon', function () { deleteMedia(m); });
            rm.title = 'حذف';
            rm.setAttribute('aria-label', 'حذف ' + m.name);
            a.appendChild(rm);
            c.appendChild(a);
            g.appendChild(c);
        });
        box.appendChild(g);
        box.appendChild(el('div', 'ob-hint', 'التفريغ ينحفظ مع الفيديو بمكتبتك — وأي أليرت يستخدمه بشاشاتك ياخذه تلقائياً.'));
    }

    /** أليرت جديد من فيديو بالمكتبة (بتفريغه)، ويفتح إعداداته على طول. */
    function newAlertFrom(m, kind) {
        var don = kind === 'donation';
        var it = O.newItem('alert', { video: { id: m.id, w: m.w, h: m.h, d: m.d, name: m.name }, events: [don ? 'donation' : 'gift'], key: m.key || null });
        it.minDiamonds = 0;
        it.maxDiamonds = 0;
        if (don) { it.minAmount = 0; it.maxAmount = 0; it.amountMode = 'range'; }
        section = don ? 'donations' : 'alerts';
        addItem(it, [0.5, 0.5]);
    }

    /** قسم «الأليرتات»: أليرتات الشاشة بشروطها + أليرت جديد من المكتبة. */
    /** kind = 'donation': أليرتات الدونيشن بس (قسم «الدونيشن»)، والجديد يشتغل مع الدونيشن. */
    function videoAlertsPane(box, kind) {
        loadMedia();
        var don = kind === 'donation';
        var mine = S().items.filter(function (it) { return it.type === 'alert' && (!don || (it.events || []).indexOf('donation') !== -1); });
        box.appendChild(el('div', 'ob-gtitle', don ? 'أليرتات الدونيشن بهذي الشاشة' : 'أليرتات هذي الشاشة'));
        if (!mine.length) box.appendChild(el('div', 'ob-hint', don ? 'ما فيه أليرت دونيشن للحين — اختر فيديو من مكتبتك تحت، وبعدها حدد مبلغه.' : 'ما فيه أليرتات للحين — اختر فيديو من مكتبتك تحت.'));
        var lw = el('div', 'va-rules');
        mine.forEach(function (it) {
            var r = el('div', 'va-rule' + (it.hidden ? ' off' : ''));
            var li = el('span', 'ob-lic');
            li.innerHTML = svg(ic(O.isVideoAlert(it) ? 'video' : 'bell'));
            r.appendChild(li);
            var t = el('div', 'tx');
            t.appendChild(el('b', null, O.isVideoAlert(it) ? (it.video.name || 'فيديو') : 'أليرت بطاقة'));
            t.appendChild(el('small', null, trigSummary(it)));
            r.appendChild(t);
            var tg = toggle(!it.hidden, function (v) { it.hidden = !v; commit(); rebuildNode(it); renderRail(); r.classList.toggle('off', !v); });
            tg.title = 'تشغيل / إيقاف';
            tg.addEventListener('click', function (e) { e.stopPropagation(); });
            r.appendChild(tg);
            r.appendChild(button('جرّب', 'ob-pill', function (e) { e.stopPropagation(); tryAlert(it, don ? 'donation' : (it.events || ['gift'])[0]); }));
            r.appendChild(button('إعدادات', 'ob-pill', function (e) { e.stopPropagation(); select(it.id); }));
            r.addEventListener('click', function () { select(it.id); });
            lw.appendChild(r);
        });
        box.appendChild(lw);

        box.appendChild(el('div', 'ob-gtitle', don ? 'أليرت دونيشن جديد من مكتبتي' : 'أليرت جديد من مكتبتي'));
        if (!media.loaded) { box.appendChild(el('div', 'ob-hint', media.failed ? 'ما قدرنا نجيب مكتبتك — حدّث الصفحة.' : 'يحمّل…')); return; }
        if (!media.list.length) {
            box.appendChild(el('div', 'ob-hint', 'مكتبتك فاضية — ارفع أليرتك وفرّغه أول.'));
            box.appendChild(button('روح لمكتبتي', 'ob-btn primary', function () { pickSection('library'); }));
            return;
        }
        var g = el('div', 'vy-libgrid sm');
        media.list.forEach(function (m) {
            var c = button('', 'vy-lcard pick', function () { newAlertFrom(m, don ? 'donation' : null); });
            c.appendChild(libThumb(m));
            var info = el('div', 'mi');
            info.appendChild(el('b', null, m.name));
            c.appendChild(info);
            g.appendChild(c);
        });
        box.appendChild(g);
    }

    var KEY_MODES = [{ label: 'لون (كروما)', value: 'color' }, { label: 'خلفية سوداء', value: 'black' }, { label: 'خلفية بيضاء', value: 'white' }, { label: 'مؤثرات مضيئة', value: 'screen' }];
    function keySummary(k) {
        if (!k.on) return 'بدون تفريغ';
        var m = k.mode === 'black' ? 'خلفية سوداء' : k.mode === 'white' ? 'خلفية بيضاء' : k.mode === 'screen' ? 'مؤثرات مضيئة' : 'لون ' + k.color;
        return 'مفرّغ: ' + m + (k.mode !== 'screen' && k.protect !== false ? ' · الشخصية محمية' : '');
    }

    function videoAlertProps(it, box) {
        var evs = Array.isArray(it.events) ? it.events : [];
        var demo = el('div', 'ob-actions');
        evs.forEach(function (k) {
            demo.appendChild(button('جرّب ' + O.ALERT_EVENTS_ALL[k].label, 'ob-btn primary', function () { tryAlert(it, k); }));
        });
        box.appendChild(demo);

        var k = O.keyOf(it);
        var kc = el('div', 'ob-card link');
        var kh = el('div', 'vk-sum');
        kh.appendChild(svgEl('wand'));
        var kt = el('div');
        kt.appendChild(el('h3', null, 'تفريغ الخلفية'));
        kt.appendChild(el('div', 'ob-hint', keySummary(k)));
        kh.appendChild(kt);
        kc.appendChild(kh);
        kc.appendChild(iconBtn('افتح أداة التفريغ', 'wand', 'primary', function () { openKeyTool(it); }));
        box.appendChild(kc);

        triggerRows(it, box);
        box.appendChild(row('الصوت', slider(0, 1, 0.05, it.volume == null ? 0.8 : it.volume, function (v) { it.volume = v; commit(); }), false, 'صوت الفيديو نفسه'));
        durationRows(it, box);
        box.appendChild(row('حجم سريع', sizeShortcuts(it), true, 'يوسّط الأليرت ويضبط حجمه على الشاشة'));
        box.appendChild(row('الحجم', slider(1, 20, 0.1, it.size, function (v) { update(it, 'size', v); })));
        var parts = O.partsOf(it);
        if (parts) {
            partsEditor(it, box, parts);
        } else {
            var conv = el('div', 'ob-card');
            conv.appendChild(el('h3', null, 'الصورة والاسم والرسالة'));
            conv.appendChild(el('div', 'ob-hint', 'خلّها عناصر منفصلة تحركها بأي مكان على الفيديو، كل وحدة بحجمها ولونها.'));
            conv.appendChild(button('رتّبها بنفسي', 'ob-btn primary', function () {
                it.parts = JSON.parse(JSON.stringify(O.PARTS_DEFAULT));
                it.msg = Object.assign({}, O.PART_MSGS);
                commit(); rebuildNode(it); renderPanel();
            }));
            box.appendChild(conv);
        }
        if (!parts) box.appendChild(row('نص فوق الفيديو', toggle(it.showText !== false, function (v) { update(it, 'showText', v, true); }), false, 'اسم الداعم والهدية'));
        if (!parts && it.showText !== false) {
            box.appendChild(row('مكان النص', pills([{ label: 'فوق', value: 'top' }, { label: 'الوسط', value: 'middle' }, { label: 'تحت', value: 'bottom' }], it.textPos || 'bottom', function (v) { update(it, 'textPos', v, true); })));
            it.msg = it.msg || {};
            evs.forEach(function (x) {
                box.appendChild(row('نص ' + O.ALERT_EVENTS_ALL[x].label, textInput(it.msg[x] || O.ALERT_EVENTS_ALL[x].msg, 80, function (v) {
                    it.msg[x] = v; commit(); rebuildNode(it);
                }), true));
            });
            box.appendChild(row('لون النص', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
            box.appendChild(el('div', 'ob-hint', 'بالنص: {name} اسم المشاهد، {gift} اسم الهدية، {count} العدد، {diamonds} الماس.'));
        }
        box.appendChild(el('div', 'ob-hint', 'الفيديو: ' + (it.video.name || '') + ' · ' + fmtDur(it.video.d) + '. الأحداث اللي تجي وقت الأليرت تنتظر دورها.'));
    }

    /** أزرار تضبط حجم الأليرت على الشاشة (حسب أبعاد الفيديو واتجاه الشاشة) وتوسّطه. */
    function sizeShortcuts(it) {
        var w = el('div', 'ob-pills');
        [['ملء الشاشة', 1], ['نص الشاشة', 0.5], ['ثلث', 0.34]].forEach(function (x) {
            w.appendChild(button(x[0], 'ob-pill', function () {
                var vw = Number(it.video.w) || 16, vh = Number(it.video.h) || 9;
                var wEm = 18 * Math.min(1, vw / vh), hEm = 18 * Math.min(1, vh / vw);
                var Fw = orientNow() === 'l' ? 1920 : 1080, Fh = orientNow() === 'l' ? 1080 : 1920;
                var size = x[1] * Math.min(Fw / wEm, Fh / hEm) * 100 / Math.min(Fw, Fh);
                it.size = Math.round(size * 100) / 100;
                it.pos[curKey()] = { x: 0.5, y: 0.5 };
                commit(); rebuildNode(it); renderPanel();
            }));
        });
        w.appendChild(button('بالوسط', 'ob-pill', function () { it.pos[curKey()] = { x: 0.5, y: 0.5 }; commit(); placeNode(it); }));
        return w;
    }

    /** مدة أليرت الفيديو: تلقائي (مدة الفيديو) أو مخصصة، ووش يصير لو أطول من الفيديو. */
    function durationRows(it, box) {
        var vd = Number(it.video.d) || 0;
        var own = Number(it.vlen) > 0;
        box.appendChild(row('مدة الأليرت', pills([{ label: 'تلقائي' + (vd ? ' (' + fmtSec(vd) + ')' : ''), value: 'auto' }, { label: 'أحددها', value: 'own' }], own ? 'own' : 'auto', function (v) {
            if (v === 'auto') delete it.vlen;
            else it.vlen = Math.max(1, Math.round((vd || 5) * 2) / 2);
            commit(); rebuildNode(it); renderPanel();
        }), true, vd ? 'مدة الفيديو ' + fmtSec(vd) : 'تنحسب من الفيديو'));
        if (!own) return;
        var lab = el('b', 'va-durv', fmtSec(it.vlen));
        var s = slider(1, 60, 0.5, it.vlen, function (v) { it.vlen = v; lab.textContent = fmtSec(v); commit(); });
        s.addEventListener('change', function () { renderPanel(); });
        var wrap = el('div', 'va-dur');
        wrap.appendChild(button('−', 'ob-pill', function () { it.vlen = Math.max(1, it.vlen - 0.5); commit(); renderPanel(); }));
        wrap.appendChild(s);
        wrap.appendChild(button('+', 'ob-pill', function () { it.vlen = Math.min(60, it.vlen + 0.5); commit(); renderPanel(); }));
        wrap.appendChild(lab);
        box.appendChild(row('المدة', wrap, true, 'تنقصها تنقص الفيديو، وتزودها يكمل بعد نهايته'));
        if (vd && it.vlen > vd + 0.05) {
            box.appendChild(row('بعد نهاية الفيديو', pills([{ label: 'يوقف على آخر لقطة', value: 'hold' }, { label: 'يعيد الفيديو', value: 'loop' }], it.vend === 'loop' ? 'loop' : 'hold', function (v) {
                update(it, 'vend', v, true);
            }), true));
        }
    }
    function fmtSec(d) { d = Math.round((Number(d) || 0) * 10) / 10; return (d % 1 ? d.toFixed(1) : String(d)) + ' ث'; }

    var PART_NAMES = { avatar: 'الصورة', name: 'الاسم', msg: 'الرسالة' };
    var partSel = 'name';

    /**
     * ترتيب الصورة والاسم والرسالة فوق الفيديو: معاينة صغيرة بنفس النسب،
     * تسحب كل عنصر لمكانه (أو تحركه بالأسهم)، ولكل عنصر خط ولون وحجم ووقت ظهور واختفاء.
     */
    function partsEditor(it, box, parts) {
        var card = el('div', 'ob-card va-parts');
        card.appendChild(el('h3', null, 'الصورة والاسم والرسالة'));
        card.appendChild(el('div', 'ob-hint', 'اسحب أي عنصر لمكانه، أو اضغطه وعدّله تحت. ▶ يشغّل المعاينة بالتوقيت.'));
        var vw = Number(it.video.w) || 16, vh = Number(it.video.h) || 9;
        var wEm = 18 * Math.min(1, vw / vh);
        var lay = el('div', 'va-lay');
        lay.style.aspectRatio = vw + ' / ' + vh;
        if (vh > vw) lay.style.width = Math.round(220 * vw / vh) + 'px';
        var v = document.createElement('video');
        v.crossOrigin = 'anonymous'; v.muted = true; v.playsInline = true; v.preload = 'auto';
        v.src = O.videoSrc(it.video.id);
        lay.appendChild(v);
        v.addEventListener('loadeddata', function () { if (v.paused && !v.currentTime) { try { v.currentTime = 0.6; } catch (e) { /* ignore */ } } }, { once: true });
        // مدة الفيديو تلقائي: لو الأليرت قديم وما فيه مدة، ناخذها من الفيديو ونحفظها
        v.addEventListener('loadedmetadata', function () {
            if (!(Number(it.video.d) > 0) && isFinite(v.duration) && v.duration > 0) {
                it.video.d = Math.round(v.duration * 100) / 100;
                commit(); renderPanel();
            }
        }, { once: true });
        var k = O.keyOf(it);
        if (k.on) {
            var kr = O.makeKeyer(v, function () { return O.keyOf(it); });
            if (kr) { lay.appendChild(kr.canvas); lay.className += ' keyed'; kr.onfail = function () { lay.classList.remove('keyed'); }; }
        }
        card.appendChild(lay);

        // تشغيل المعاينة بالتوقيت
        var bar = el('div', 'va-play');
        var playB = button('▶ شغّل', 'ob-pill', function () { playing ? stopPlay() : startPlay(); });
        var clock = el('span', 'va-clock', '0.0 ث');
        bar.appendChild(playB);
        bar.appendChild(clock);
        card.appendChild(bar);
        var playing = false, t0 = 0, raf = 0;
        function len() { return O.videoAlertLen(it) || Number(it.video.d) || 5; }
        function showAt(t) {
            Object.keys(chips).forEach(function (key) {
                var p = O.partsOf(it)[key], c = chips[key];
                var vis = t == null || (t >= (Number(p.t) || 0) && (!(Number(p.e) > 0) || t < Number(p.e)));
                c.classList.toggle('va-off', !vis);
            });
        }
        function tick() {
            if (!playing) return;
            // اللوحة انعاد رسمها: نوقف الفيديو القديم بدل ما يكمل بالخلفية
            if (!lay.isConnected) { playing = false; v.pause(); v.removeAttribute('src'); v.load(); return; }
            var t = (performance.now() - t0) / 1000;
            if (t >= len()) { stopPlay(); return; }
            var vd = Number(it.video.d) || v.duration || 0;
            if (vd && t > vd && it.vend === 'loop' && v.ended) { v.currentTime = 0; v.play().catch(function () {}); }
            clock.textContent = t.toFixed(1) + ' / ' + fmtSec(len());
            showAt(t);
            raf = requestAnimationFrame(tick);
        }
        function startPlay() {
            playing = true; playB.textContent = '■ وقّف';
            try { v.currentTime = 0; } catch (e) { /* ignore */ }
            v.play().catch(function () {});
            t0 = performance.now();
            tick();
        }
        function stopPlay() {
            playing = false; playB.textContent = '▶ شغّل';
            cancelAnimationFrame(raf);
            v.pause();
            try { v.currentTime = 0.6; } catch (e) { /* ignore */ }
            clock.textContent = fmtSec(len());
            showAt(null);
        }
        clock.textContent = fmtSec(len());

        var ev = { type: (it.events || ['gift'])[0] || 'gift', user: 'اسم الداعم', gift: 'وردة', count: 5, diamonds: 5 };
        var chips = {};
        function emPx() { return lay.clientWidth / wEm; }
        function paintChip(key) {
            var p = O.partsOf(it)[key], c = chips[key];
            if (!c) return;
            c.style.display = p.on ? '' : 'none';
            c.style.left = p.x + '%';
            c.style.top = p.y + '%';
            c.classList.toggle('sel', key === partSel);
            var px = emPx();
            if (key === 'avatar') { c.style.width = c.style.height = (p.s * px) + 'px'; c.style.boxShadow = '0 0 0 2px ' + (p.c || '#fff'); }
            else {
                c.style.fontSize = (p.s * px) + 'px'; c.style.color = p.c;
                var f = O.fontOf(p.f || 'notokufi'); O.loadFont(f);
                c.style.fontFamily = O.fontStack(f); c.style.fontWeight = String(Math.max(700, f.b));
            }
        }
        [['avatar', ''], ['name', ev.user], ['msg', (it.msg && it.msg[ev.type]) || O.PART_MSGS[ev.type]]].forEach(function (x) {
            var c = el('div', 'va-chip va-' + x[0], x[0] === 'msg' ? String(x[1]).replace('{gift}', 'وردة').replace('{count}', '5').replace('{diamonds}', '5').replace('{name}', 'اسم الداعم') : x[1]);
            if (x[0] === 'avatar') c.appendChild(el('span', null, 'ا'));
            c.title = PART_NAMES[x[0]];
            chips[x[0]] = c;
            lay.appendChild(c);
            c.addEventListener('pointerdown', function (e) {
                e.preventDefault();
                c.setPointerCapture(e.pointerId);
                c.classList.add('drag');
                var moved = false;
                function mv(ev2) {
                    moved = true;
                    var r = lay.getBoundingClientRect();
                    var px2 = Math.max(0, Math.min(100, (ev2.clientX - r.left) / r.width * 100));
                    var py2 = Math.max(0, Math.min(100, (ev2.clientY - r.top) / r.height * 100));
                    it.parts[x[0]] = Object.assign({}, O.partsOf(it)[x[0]], { x: Math.round(px2 * 10) / 10, y: Math.round(py2 * 10) / 10 });
                    paintChip(x[0]);
                }
                function up() {
                    c.classList.remove('drag');
                    c.removeEventListener('pointermove', mv);
                    c.removeEventListener('pointerup', up);
                    c.removeEventListener('pointercancel', up);
                    if (moved) { commit(); rebuildNode(it); }
                    if (partSel !== x[0]) { partSel = x[0]; renderPanel(); }
                }
                c.addEventListener('pointermove', mv);
                c.addEventListener('pointerup', up);
                c.addEventListener('pointercancel', up);
            });
        });
        requestAnimationFrame(function () { Object.keys(chips).forEach(paintChip); });

        // خط الوقت: متى يطلع ويختفي كل عنصر
        var tl = el('div', 'va-tl');
        var L = len();
        Object.keys(PART_NAMES).forEach(function (key) {
            var p = parts[key];
            var r = el('div', 'va-tlr' + (key === partSel ? ' sel' : '') + (p.on ? '' : ' off'));
            r.appendChild(el('span', 'va-tln', PART_NAMES[key]));
            var track = el('div', 'va-tlt');
            var a = Math.min(1, (Number(p.t) || 0) / L), b = Number(p.e) > 0 ? Math.min(1, Number(p.e) / L) : 1;
            var fill = el('i');
            fill.style.insetInlineStart = (a * 100) + '%';
            fill.style.width = Math.max(2, (b - a) * 100) + '%';
            track.appendChild(fill);
            r.appendChild(track);
            r.addEventListener('click', function () { partSel = key; renderPanel(); });
            tl.appendChild(r);
        });
        card.appendChild(tl);
        box.appendChild(card);

        function setPart(key, field, val, repaint) {
            it.parts[key] = Object.assign({}, O.partsOf(it)[key]);
            it.parts[key][field] = val;
            commit();
            rebuildNode(it);
            paintChip(key);
            if (repaint) renderPanel();
        }

        // اختيار العنصر
        box.appendChild(row('العنصر', pills(Object.keys(PART_NAMES).map(function (x) { return { label: PART_NAMES[x], value: x }; }), partSel, function (v2) { partSel = v2; renderPanel(); }), true));
        var key = partSel, p = parts[key], nm = PART_NAMES[key];
        box.appendChild(row('إظهار ' + nm, toggle(p.on, function (val) { setPart(key, 'on', val, true); })));
        if (p.on) {
            // التحريك الدقيق
            var nudge = el('div', 'va-nudge');
            [['↑', 0, -1, 'فوق'], ['↓', 0, 1, 'تحت'], ['→', 1, 0, 'يمين'], ['←', -1, 0, 'يسار']].forEach(function (d) {
                var b = button(d[0], 'ob-pill', function () {
                    var q = O.partsOf(it)[key];
                    it.parts[key] = Object.assign({}, q, { x: Math.max(0, Math.min(100, Math.round((q.x + d[1]) * 10) / 10)), y: Math.max(0, Math.min(100, Math.round((q.y + d[2]) * 10) / 10)) });
                    commit(); rebuildNode(it); paintChip(key);
                });
                b.setAttribute('aria-label', d[3]);
                nudge.appendChild(b);
            });
            nudge.appendChild(button('بالنص', 'ob-pill', function () { setPart(key, 'x', 50); }));
            box.appendChild(row('المكان', nudge, true, 'كل ضغطة تحرك 1٪ — أو اسحبه بالمعاينة'));
            var mn = key === 'avatar' ? 1 : 0.4, mx = key === 'avatar' ? 8 : 3;
            box.appendChild(row('حجم ' + nm, slider(mn, mx, 0.05, p.s, function (val) { setPart(key, 's', val); })));
            box.appendChild(row(key === 'avatar' ? 'لون إطار الصورة' : 'لون ' + nm, swatches(p.c, function (c) { setPart(key, 'c', c, true); }), true));
            if (key !== 'avatar') {
                var g = el('div', 'ob-fgrid');
                var curF = p.f || 'notokufi';
                O.FONTS.forEach(function (f) {
                    O.loadFont(f);
                    var fb = button('', 'ob-fbtn' + (f.key === curF ? ' on' : ''), function () { setPart(key, 'f', f.key, true); });
                    var sample = el('span', null, key === 'name' ? 'أيمن' : 'شكراً');
                    sample.style.fontFamily = O.fontStack(f);
                    sample.style.fontWeight = String(f.b);
                    fb.appendChild(sample);
                    fb.appendChild(el('span', null, f.label));
                    g.appendChild(fb);
                });
                box.appendChild(row('خط ' + nm, g, true));
            }
            // التوقيت
            var tLab = el('b', 'va-durv', fmtSec(p.t || 0));
            var tw = el('div', 'va-dur');
            tw.appendChild(slider(0, Math.max(1, L), 0.1, Number(p.t) || 0, function (val) { tLab.textContent = fmtSec(val); setPart(key, 't', val); }));
            tw.appendChild(tLab);
            tw.lastChild.previousSibling.addEventListener('change', function () { renderPanel(); });
            box.appendChild(row('يطلع بعد', tw, true, 'من بداية الأليرت'));
            var eOn = Number(p.e) > 0;
            box.appendChild(row('يختفي', pills([{ label: 'مع نهاية الأليرت', value: 0 }, { label: 'بوقت أحدده', value: 1 }], eOn ? 1 : 0, function (val) {
                setPart(key, 'e', val ? Math.min(L, Math.max((Number(p.t) || 0) + 1, L - 1)) : 0, true);
            }), true));
            if (eOn) {
                var eLab = el('b', 'va-durv', fmtSec(p.e));
                var ew = el('div', 'va-dur');
                var es = slider(0.5, Math.max(1, L), 0.1, Number(p.e), function (val) { eLab.textContent = fmtSec(val); setPart(key, 'e', val); });
                es.addEventListener('change', function () { renderPanel(); });
                ew.appendChild(es);
                ew.appendChild(eLab);
                box.appendChild(row('يختفي عند', ew, true));
            }
            box.appendChild(row('حركة الظهور', pills(opts(O.PART_ANIMS), p.a || 'fade', function (val) { setPart(key, 'a', val, true); }), true));
        }

        var evs = Array.isArray(it.events) ? it.events : [];
        it.msg = it.msg || {};
        evs.forEach(function (x) {
            box.appendChild(row('رسالة ' + O.ALERT_EVENTS_ALL[x].label, textInput(it.msg[x] || O.PART_MSGS[x], 80, function (val) {
                it.msg[x] = val; commit(); rebuildNode(it);
            }), true));
        });
        box.appendChild(el('div', 'ob-hint', 'بالرسالة: {gift} اسم الهدية، {count} العدد، {diamonds} الماس، {name} الاسم.'));
        box.appendChild(button('رجّع للنص البسيط', 'ob-btn ghost', function () { delete it.parts; it.msg = {}; commit(); rebuildNode(it); renderPanel(); }));
    }

    /* أداة التفريغ: معاينة كبيرة + لون/أسود/أبيض/مؤثرات + حماية الشخصية + قطّارة + تلقائي + القوة والنعومة والتقليص والانعكاس */
    function openKeyTool(it, onSave) {
        var draft = O.keyOf(it);
        if (!draft.on) draft.on = true;
        var orig = JSON.stringify(O.keyOf(it));
        var before = false, picking = false, bgMode = 'checker';

        var modal = el('div', 'vk-modal');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', 'أداة تفريغ الأليرت');
        var boxEl = el('div', 'vk-box glass');
        modal.appendChild(boxEl);

        var hd = el('div', 'vk-head');
        var ht = el('div');
        ht.appendChild(el('h2', null, 'أداة تفريغ الأليرت'));
        ht.appendChild(el('p', null, (it.video.name || 'فيديو') + ' — يشيل خلفية الفيديو وتطلع شفافة على البث'));
        hd.appendChild(ht);
        var xb = button('', 'ob-x', function () { close(false); });
        xb.innerHTML = svg(UI.close);
        xb.setAttribute('aria-label', 'إغلاق');
        hd.appendChild(xb);
        boxEl.appendChild(hd);

        var main = el('div', 'vk-main');
        boxEl.appendChild(main);

        // المعاينة
        var viewEl = el('div', 'vk-view');
        var stageEl = el('div', 'vk-stage bg-checker');
        var media2 = el('div', 'vk-media');
        var v = document.createElement('video');
        v.crossOrigin = 'anonymous';
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.preload = 'auto';
        v.src = O.videoSrc(it.video.id);
        media2.appendChild(v);
        var keyer = O.makeKeyer(v, function () { return draft; });
        var warn = null;
        if (keyer) {
            media2.appendChild(keyer.canvas);
            keyer.onfail = function () { paintKeyed(); showWarn('ما قدرنا نقرأ الفيديو للتفريغ (إعدادات السيرفر). التفريغ بيشتغل على البث لو السيرفر يسمح.'); };
        }
        stageEl.appendChild(media2);
        var pickHint = el('div', 'vk-pickhint', 'اضغط على لون الخلفية بالفيديو');
        stageEl.appendChild(pickHint);
        viewEl.appendChild(stageEl);
        function showWarn(t) { if (!warn) { warn = el('div', 'ob-warn'); viewEl.insertBefore(warn, viewEl.firstChild); } warn.textContent = t; }
        if (!keyer) showWarn('متصفحك ما يدعم التفريغ (WebGL). التفريغ بيشتغل بـOBS وTikTok LIVE Studio عادي.');

        // شريط التشغيل
        var bar = el('div', 'vk-bar');
        var playB = button('', 'ob-btn ghost icon', function () { if (v.paused) v.play().catch(function () {}); else v.pause(); });
        playB.setAttribute('aria-label', 'تشغيل / إيقاف');
        var seek = document.createElement('input');
        seek.type = 'range';
        seek.className = 'ob-range vk-seek';
        seek.min = 0; seek.max = 1000; seek.value = 0;
        seek.setAttribute('aria-label', 'مكان التشغيل');
        seek.addEventListener('input', function () { if (v.duration) { v.pause(); v.currentTime = v.duration * seek.value / 1000; } });
        var tm = el('span', 'vk-time', '0:00');
        var cmp = button('قبل / بعد', 'ob-btn ghost', function () {});
        cmp.title = 'اضغط مطوّل تشوف الفيديو الأصلي';
        function setBefore(b) { before = b; cmp.classList.toggle('on', b); paintKeyed(); }
        cmp.addEventListener('pointerdown', function () { setBefore(true); });
        ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (t) { cmp.addEventListener(t, function () { if (before) setBefore(false); }); });
        var bgs = el('div', 'ob-seg vk-bgs');
        var bgList = [['checker', 'شفاف'], ['dark', 'داكن'], ['light', 'فاتح'], ['game', 'لعبة']];
        if (localBg) bgList.push(['mine', 'صورتك']);
        bgList.forEach(function (b) {
            bgs.appendChild(button(b[1], b[0] === bgMode ? 'on' : '', function () {
                bgMode = b[0];
                stageEl.className = 'vk-stage bg-' + bgMode + (picking ? ' picking' : '');
                stageEl.style.backgroundImage = bgMode === 'mine' ? 'url("' + localBg + '")' : '';
                Array.prototype.forEach.call(bgs.children, function (x) { x.classList.toggle('on', x.textContent === b[1]); });
            }));
        });
        bar.appendChild(playB);
        bar.appendChild(seek);
        bar.appendChild(tm);
        bar.appendChild(cmp);
        bar.appendChild(bgs);
        viewEl.appendChild(bar);
        main.appendChild(viewEl);
        function paintPlay() { playB.innerHTML = svg(ic(v.paused ? 'play' : 'pause')); }
        v.addEventListener('play', paintPlay);
        v.addEventListener('pause', paintPlay);
        v.addEventListener('timeupdate', function () {
            if (v.duration) seek.value = Math.round(v.currentTime / v.duration * 1000);
            tm.textContent = fmtDur(v.currentTime) + ' / ' + fmtDur(v.duration);
        });
        paintPlay();
        v.play().catch(function () {});

        // قراءة ألوان من الفريم الحالي (للقطّارة والتلقائي)
        var probe = document.createElement('canvas');
        function frameData() {
            if (!v.videoWidth) return null;
            probe.width = v.videoWidth;
            probe.height = v.videoHeight;
            var cx = probe.getContext('2d', { willReadFrequently: true });
            try { cx.drawImage(v, 0, 0); return cx.getImageData(0, 0, probe.width, probe.height); } catch (e) { return null; }
        }
        function avgAt(img, x, y, r) {
            var s2 = [0, 0, 0], n = 0;
            for (var yy = Math.max(0, y - r); yy <= Math.min(img.height - 1, y + r); yy++) {
                for (var xx = Math.max(0, x - r); xx <= Math.min(img.width - 1, x + r); xx++) {
                    var i = (yy * img.width + xx) * 4;
                    s2[0] += img.data[i]; s2[1] += img.data[i + 1]; s2[2] += img.data[i + 2]; n++;
                }
            }
            return n ? [s2[0] / n, s2[1] / n, s2[2] / n] : [0, 0, 0];
        }
        function hex(rgb) { return '#' + rgb.map(function (c) { return ('0' + Math.round(c).toString(16)).slice(-2); }).join(''); }
        function lum(rgb) { return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255; }
        function sat(rgb) { var mx = Math.max.apply(null, rgb), mn = Math.min.apply(null, rgb); return mx ? (mx - mn) / mx : 0; }

        /**
         * تفريغ تلقائي: يقرأ 5 لحظات من الفيديو (مو بس الفريم الحالي)، ياخذ لون الخلفية من
         * الأطراف، ويقرر: خلفية داكنة + محتوى ملوّن متوهّج (برق، نار، ضوء) = «مؤثرات مضيئة»
         * مع طرح لون الخلفية؛ خلفية داكنة + شخصية = «خلفية سوداء» مع حماية الشخصية؛
         * فاتحة = بيضاء؛ غير كذا = كروما باللون نفسه.
         */
        function autoKey() {
            if (!v.duration || !v.videoWidth) { toast('انتظر الفيديو يحمّل'); return; }
            var wasPaused = v.paused, back = v.currentTime;
            v.pause();
            var times = [0.12, 0.3, 0.5, 0.7, 0.88].map(function (f) { return f * v.duration; });
            var corners = [], glowSat = 0, glowN = 0, brightN = 0, allN = 0;
            toast('يحلّل الفيديو…');
            (function next(i) {
                if (i >= times.length) return finish();
                v.addEventListener('seeked', function () {
                    var img = frameData();
                    if (img) {
                        var W = img.width, H = img.height, cw = Math.round(W / 6), ch = Math.round(H / 6), st = Math.max(1, Math.round(W / 320));
                        [[0, 0], [W - cw, 0], [0, H - ch], [W - cw, H - ch]].forEach(function (o) {
                            for (var y = o[1]; y < o[1] + ch; y += st) for (var x = o[0]; x < o[0] + cw; x += st) {
                                var j = (y * W + x) * 4; corners.push([img.data[j], img.data[j + 1], img.data[j + 2]]);
                            }
                        });
                        for (var y2 = 0; y2 < H; y2 += st * 3) for (var x2 = 0; x2 < W; x2 += st * 3) {
                            var k2 = (y2 * W + x2) * 4, px = [img.data[k2], img.data[k2 + 1], img.data[k2 + 2]];
                            allN++;
                            var L = lum(px);
                            if (L > 0.18) { glowN++; glowSat += sat(px); }
                            if (L > 0.92 && sat(px) < 0.15) brightN++;
                        }
                    }
                    next(i + 1);
                }, { once: true });
                v.currentTime = times[i];
            }(0));
            function pct(arr, c, q) { var a2 = arr.map(function (x) { return x[c]; }).sort(function (p2, q2) { return p2 - q2; }); return a2.length ? a2[Math.min(a2.length - 1, Math.floor(q * a2.length))] : 0; }
            function finish() {
                v.currentTime = back;
                if (!wasPaused) v.play().catch(function () {});
                if (!corners.length) { toast('ما قدرنا نقرأ الفيديو'); return; }
                var med = [pct(corners, 0, 0.5), pct(corners, 1, 0.5), pct(corners, 2, 0.5)];
                var p90 = [pct(corners, 0, 0.9), pct(corners, 1, 0.9), pct(corners, 2, 0.9)];
                draft.on = true;
                draft.keepBg = 0;
                if (lum(med) < 0.16) {
                    var glowy = glowN && (glowSat / glowN) > 0.42;
                    if (glowy) {
                        // مؤثرات: نطرح لون الخلفية (أعلى 90% من الأطراف عشان الضباب الخفيف يروح)
                        draft.mode = 'screen'; draft.floor = hex(p90); draft.sim = 0.06; draft.smooth = 0.12; draft.choke = 0;
                        toast('مؤثرات مضيئة على خلفية ' + draft.floor + ' ✓');
                    } else {
                        draft.mode = 'black'; draft.sim = 0.22; draft.smooth = 0.12; draft.protect = true; draft.choke = 0.1;
                        toast('الخلفية سوداء — الشخصية محمية ✓');
                    }
                } else if (lum(med) > 0.88 && sat(med) < 0.12) {
                    draft.mode = 'white'; draft.sim = 0.2; draft.smooth = 0.1; draft.protect = true; draft.choke = 0.1;
                    toast('الخلفية بيضاء ✓');
                } else {
                    draft.mode = 'color'; draft.color = hex(med); draft.sim = 0.4; draft.smooth = 0.08; draft.spill = 0.1; draft.protect = true; draft.choke = 0;
                    toast('لقينا لون الخلفية ' + draft.color + ' ✓');
                }
                paintControls();
            }
        }

        function setPicking(on) {
            picking = on;
            stageEl.classList.toggle('picking', on);
            pickBtn.classList.toggle('on', on);
        }
        media2.addEventListener('click', function (e) {
            if (!picking) return;
            var img = frameData();
            if (!img) { toast('ما قدرنا نقرأ الفيديو'); setPicking(false); return; }
            // مكان الضغطة داخل الفيديو (object-fit: contain)
            var rc = media2.getBoundingClientRect();
            var k2 = Math.min(rc.width / img.width, rc.height / img.height);
            var ox = rc.left + (rc.width - img.width * k2) / 2, oy = rc.top + (rc.height - img.height * k2) / 2;
            var x = Math.round((e.clientX - ox) / k2), y = Math.round((e.clientY - oy) / k2);
            if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
            var c = avgAt(img, x, y, 3);
            draft.on = true;
            if (draft.mode === 'screen') draft.floor = hex(c);
            else { draft.mode = 'color'; draft.color = hex(c); }
            setPicking(false);
            paintControls();
        });

        // التحكم (العنوان يمين والتحكم يسار — قاعدة CLAUDE.md)
        var side = el('div', 'vk-side');
        main.appendChild(side);
        var pickBtn = iconBtn('قطّارة', 'drop', 'ghost', function () { setPicking(!picking); });
        var ctrls = el('div', 'vk-ctrls');
        side.appendChild(ctrls);

        /** «قبل/بعد» أو التفريغ مطفي: نعرض الفيديو الأصلي بدل الـcanvas. */
        function paintKeyed() { media2.classList.toggle('keyed', Boolean(keyer && !keyer.failed && draft.on && !before)); if (keyer) keyer.draw(); }
        function setK(k2, v2) { draft[k2] = v2; paintKeyed(); }
        function paintControls() {
            var top = ctrls.scrollTop; // نرجّع مكان التمرير بعد إعادة الرسم
            requestAnimationFrame(function () { ctrls.scrollTop = top; });
            ctrls.textContent = '';
            ctrls.appendChild(iconBtn('تفريغ تلقائي', 'wand', 'primary lg vk-auto', autoKey));
            ctrls.appendChild(el('div', 'ob-hint', 'يقرأ أطراف الفيديو ويعرف لون الخلفية لحاله. بعدها ظبّط القوة والنعومة.'));
            ctrls.appendChild(row('تفريغ الخلفية', toggle(draft.on, function (x) { setK('on', x); paintControls(); })));
            ctrls.appendChild(row('الطريقة', pills(KEY_MODES, draft.mode, function (x) { setK('mode', x); paintControls(); }), true));
            // درجة التفريغ: كم تنشال الخلفية (100٪ = كلها) — الشخصية والمؤثرات ما يتغيّر فيها شي
            var amt = el('div', 'va-dur');
            var amtLab = el('b', 'va-durv', Math.round((1 - (draft.keepBg || 0)) * 100) + '٪');
            amt.appendChild(slider(0, 100, 1, Math.round((1 - (draft.keepBg || 0)) * 100), function (x) { amtLab.textContent = x + '٪'; setK('keepBg', Math.round((100 - x)) / 100); }));
            amt.appendChild(amtLab);
            ctrls.appendChild(row('درجة تفريغ الخلفية', amt, true, '100٪ = الخلفية ' + (draft.mode === 'white' ? 'البيضاء' : draft.mode === 'color' ? 'الملوّنة' : 'السوداء') + ' تنشال كلها، 50٪ = تصير نص شفافة — والباقي بالفيديو ما يتغيّر لونه ولا شكله'));
            if (draft.mode === 'color') {
                var cw = el('div', 'ob-sw');
                [['#00ff00', 'أخضر'], ['#00b140', 'أخضر كروما'], ['#0047bb', 'أزرق'], ['#ff00ff', 'وردي']].forEach(function (c) {
                    var b = button('', String(draft.color).toLowerCase() === c[0] ? 'on' : '', function () { setK('color', c[0]); setK('on', true); paintControls(); });
                    b.style.background = c[0];
                    b.title = c[1];
                    b.setAttribute('aria-label', c[1]);
                    cw.appendChild(b);
                });
                var pk = document.createElement('input');
                pk.type = 'color';
                pk.value = /^#[0-9a-f]{6}$/i.test(draft.color) ? draft.color : '#00ff00';
                pk.title = 'لون مخصص';
                pk.addEventListener('input', function () { setK('color', pk.value); });
                cw.appendChild(pk);
                cw.appendChild(pickBtn);
                ctrls.appendChild(row('لون الخلفية', cw, true, 'أو اضغط «قطّارة» واختر اللون من الفيديو'));
            }
            if (draft.mode === 'screen') {
                ctrls.appendChild(el('div', 'ob-hint', 'للبرق والنار والضوء والشرار على خلفية داكنة: الخلفية تختفي والضوء يبقى شفاف ومتوهّج.'));
                var fw2 = el('div', 'ob-sw');
                var fp2 = document.createElement('input');
                fp2.type = 'color';
                fp2.value = /^#[0-9a-f]{6}$/i.test(draft.floor || '') ? draft.floor : '#000000';
                fp2.title = 'لون الخلفية';
                fp2.addEventListener('input', function () { setK('floor', fp2.value); });
                fw2.appendChild(fp2);
                fw2.appendChild(button('أسود', 'ob-btn ghost', function () { setK('floor', '#000000'); paintControls(); }));
                fw2.appendChild(pickBtn);
                ctrls.appendChild(row('لون الخلفية', fw2, true, 'لو الخلفية كحلي أو رمادي داكن مو أسود — «قطّارة» واضغط على الخلفية'));
            } else {
                ctrls.appendChild(row('حماية الشخصية', toggle(draft.protect !== false, function (x) { setK('protect', x); }), false, 'يشيل بس الخلفية المتصلة بأطراف الفيديو — الأجزاء ' + (draft.mode === 'white' ? 'البيضاء' : draft.mode === 'black' ? 'الداكنة' : 'اللي بنفس اللون') + ' داخل الشخصية تبقى'));
            }
            ctrls.appendChild(row(draft.mode === 'screen' ? 'قطع السواد' : 'القوة', slider(0, 1, 0.01, draft.sim, function (x) { setK('sim', x); }), false, draft.mode === 'screen' ? 'كم من الأسود ينشال' : 'كم لون قريب ينشال'));
            ctrls.appendChild(row(draft.mode === 'screen' ? 'قوة التوهّج' : 'النعومة', slider(0, 0.5, 0.01, draft.smooth, function (x) { setK('smooth', x); }), false, draft.mode === 'screen' ? 'أعلى = الضوء أوضح' : 'نعومة حواف الشخصية'));
            ctrls.appendChild(row('تقليص الحواف', slider(0, 0.6, 0.01, draft.choke || 0, function (x) { setK('choke', x); }), false, 'يشيل الهالة اللي حول الشخصية'));
            if (draft.mode === 'color') ctrls.appendChild(row('إزالة الانعكاس', slider(0, 1, 0.01, draft.spill, function (x) { setK('spill', x); }), false, 'يشيل اللون الأخضر من الحواف'));
            ctrls.appendChild(el('div', 'ob-gtitle', 'الأليرت كله'));
            ctrls.appendChild(row('شفافية الفيديو', slider(0.1, 1, 0.01, draft.opacity == null ? 1 : draft.opacity, function (x) { setK('opacity', x); }), false, 'هذي تخفف كل شي (الشخصية والخلفية) — للخلفية بس استخدم «درجة تفريغ الخلفية»'));
            paintKeyed();
        }
        paintControls();

        var acts = el('div', 'vk-acts');
        acts.appendChild(button('حفظ التفريغ', 'ob-btn primary lg', function () { close(true); }));
        acts.appendChild(button('إعادة ضبط', 'ob-btn ghost', function () { draft = Object.assign({}, O.KEY_DEFAULT, { on: true }); paintControls(); }));
        acts.appendChild(button('إلغاء', 'ob-btn ghost', function () { close(false); }));
        side.appendChild(acts);

        function onKey(e) {
            if (e.key === 'Escape') { e.stopPropagation(); if (picking) setPicking(false); else close(false); }
            else if (e.key === ' ' && !/^(INPUT|TEXTAREA|BUTTON)$/.test(e.target.tagName)) { e.preventDefault(); if (v.paused) v.play().catch(function () {}); else v.pause(); }
        }
        document.addEventListener('keydown', onKey, true);
        modal.addEventListener('pointerdown', function (e) { if (e.target === modal) close(false); });

        function close(saveIt) {
            document.removeEventListener('keydown', onKey, true);
            v.pause();
            v.removeAttribute('src');
            v.load();
            if (keyer) keyer.destroy();
            modal.remove();
            if (saveIt && JSON.stringify(draft) !== orig) {
                if (onSave) { onSave(Object.assign({}, draft)); return; }
                update(it, 'key', Object.assign({}, draft), true);
                toast(draft.on ? 'انحفظ التفريغ ✓ — وبمكتبتك' : 'انحفظ — بدون تفريغ');
                // المكتبة هي المرجع: نفس التفريغ يتحفظ مع الفيديو
                if (it.video && it.video.id) saveLibKey(it.video.id, Object.assign({}, draft), true);
            }
        }
        document.body.appendChild(modal);
        var first = modal.querySelector('.vk-auto');
        if (first) first.focus();
    }

    function alertProps(it, box) {
        var evs = Array.isArray(it.events) ? it.events : [];
        var demo = el('div', 'ob-actions');
        evs.forEach(function (k) {
            demo.appendChild(button('جرّب ' + O.ALERT_EVENTS_ALL[k].label, 'ob-btn primary', function () { tryAlert(it, k); }));
        });
        box.appendChild(demo);
        triggerRows(it, box);
        box.appendChild(row('التصميم', pills(opts(O.ALERT_DESIGNS), it.design || 'card', function (v) { update(it, 'design', v, true); })));
        box.appendChild(row('الدخول', pills(opts(O.ALERT_ANIMS), it.anim || 'pop', function (v) { update(it, 'anim', v, true); O.alertDemo(it.id, evs[0]); })));
        box.appendChild(row('المدة', pills([3, 5, 8, 12].map(function (n) { return { label: n + ' ث', value: n }; }), Number(it.duration) || 5, function (v) { update(it, 'duration', v, true); })));
        box.appendChild(row('صوت', toggle(it.sound, function (v) { update(it, 'sound', v); }), false, 'نغمة قصيرة مع كل تنبيه'));
        it.msg = it.msg || {};
        evs.forEach(function (k) {
            box.appendChild(row('نص ' + O.ALERT_EVENTS_ALL[k].label, textInput(it.msg[k] || O.ALERT_EVENTS_ALL[k].msg, 80, function (v) {
                it.msg[k] = v; commit(); rebuildNode(it);
            }), true));
        });
        box.appendChild(el('div', 'ob-hint', 'بالنص: {name} اسم المشاهد، {gift} اسم الهدية، {count} العدد، {diamonds} الماس.'));
        sizeColor(it, box, 1.5, 9);
    }

    function iconProps(it, box) {
        if (it.emoji) {
            var ge = el('div', 'ob-igrid');
            O.EMOJIS.forEach(function (em) {
                var b = button(em, 'ob-ibtn emo', function () { update(it, 'emoji', em, true); });
                if (em === it.emoji) b.style.borderColor = 'var(--accent-2)';
                ge.appendChild(b);
            });
            box.appendChild(ge);
            box.appendChild(row('الحجم', slider(2, 30, 0.5, it.size, function (v) { update(it, 'size', v); })));
        } else {
            var g = el('div', 'ob-igrid');
            Object.keys(O.ICON_SET).forEach(function (k) {
                var b = button('', 'ob-ibtn', function () { update(it, 'icon', k, true); });
                b.innerHTML = svg(O.ICON_SET[k].p);
                b.style.color = it.color;
                if (k === it.icon) b.style.borderColor = 'var(--accent-2)';
                b.title = O.ICON_SET[k].label;
                g.appendChild(b);
            });
            box.appendChild(g);
            sizeColor(it, box, 2, 30);
            box.appendChild(row('توهّج', toggle(it.glow, function (v) { update(it, 'glow', v); })));
        }
        animRows(it, box);
    }

    function shapeProps(it, box) {
        box.appendChild(row('الشكل', pills(opts(O.SHAPES), it.shape || 'round', function (v) { update(it, 'shape', v, true); }), true));
        box.appendChild(row('التعبئة', pills(opts(O.SHAPE_FILLS), it.fill || 'glass', function (v) { update(it, 'fill', v, true); }), true));
        box.appendChild(row(it.shape === 'circle' ? 'القطر' : 'العرض', slider(2, 178, 1, it.w, function (v) { update(it, 'w', v); })));
        if (it.shape !== 'circle') box.appendChild(row('الطول', slider(1, 100, 0.5, it.h, function (v) { update(it, 'h', v); })));
        box.appendChild(row('الشفافية', slider(0.1, 1, 0.05, it.opacity, function (v) { update(it, 'opacity', v); })));
        box.appendChild(row('اللون', swatches(it.color, function (c) { update(it, 'color', c, true); }), true));
    }

    /* ---------------- حالة البيانات ---------------- */

    function paintStatus() {
        var ok = O.linkOk();
        statusEl.classList.toggle('ok', ok);
        statusEl.title = O.linkText();
        statusEl.lastChild.textContent = ok ? 'البيانات متصلة' : 'البيانات';
        var hs = document.getElementById('vy-data-stat');
        if (hs) paintDataStat(hs);
    }
    statusEl.addEventListener('click', function () { go('editor', 'screen'); });
    statusEl.style.cursor = 'pointer';

    /* ---------------- الرئيسية ---------------- */

    function svgEl(name) { var w = el('span', 'ic'); w.innerHTML = svg(ic(name)); return w; }
    function iconBtn(label, icon, cls, onClick) {
        var b = button('', 'ob-btn ' + (cls || 'ghost'), onClick);
        b.innerHTML = svg(ic(icon));
        b.appendChild(el('span', null, label));
        return b;
    }
    function firstName() {
        var n = me && (me.display_name || me.tiktok_display_name || me.username);
        return n ? String(n).split(/\s+/)[0] : '';
    }
    function itemsOf(scr) { return scr && scr.design && Array.isArray(scr.design.items) ? scr.design.items : []; }
    function itemsCount(scr) { return scr === cur ? S().items.length : itemsOf(scr).length; }

    /*
     * «اتصل بالبث»: الستريمر يكتب يوزر تيك توك (لازم يكون الموثّق بحسابه) والسيرفر يتصل
     * بالبث ويبقى متصل لين ينتهي البث أو يضغط «قطع» — بدون ما يخلي أي صفحة مفتوحة.
     * كل الأدوات (الأليرتات، التوب، الأهداف، الشات، الأغاني) تشتغل على هالاتصال.
     */
    var conn = { loaded: false, loading: false, username: null, state: 'idle', msg: '', ok: false, busy: false, timer: null };
    var CONN_ERR = {
        not_live: 'حسابك مو في بث الحين — ابدأ البث بتيك توك وجرّب مرة ثانية',
        not_your_account: 'هذا مو حساب تيك توك الموثّق بحسابك',
        invalid_username: 'صيغة اليوزر غلط',
        not_linked: 'حسابك مو مربوط بتيك توك — اربطه من «حسابي» أول',
        not_streamer: 'الاتصال لحسابات الستريمر'
    };

    function loadConnection() {
        if (conn.loading) return;
        conn.loading = true;
        api('GET', '/api/screens/connection').then(function (d) {
            conn.loading = false;
            if (!d || !d.success) return;
            var first = !conn.loaded;
            conn.loaded = true;
            var was = conn.state;
            conn.username = d.username;
            conn.state = d.state || 'idle';
            if (was !== conn.state) conn.msg = '';
            if (was === 'connected' && conn.state === 'idle') { conn.msg = 'انقطع الاتصال — غالباً البث انتهى'; conn.ok = false; }
            if (first || was !== conn.state) paintConnect();
            syncConnTimer();
        }).catch(function () { conn.loading = false; });
    }

    /** نتابع الحالة كل 6 ثواني وهو يتصل أو متصل (عشان نعرف لما يتصل أو ينتهي البث). */
    function syncConnTimer() {
        var want = view === 'home' && (conn.state === 'connecting' || conn.state === 'connected');
        if (want && !conn.timer) conn.timer = setInterval(function () { if (view !== 'home') { syncConnTimer(); return; } loadConnection(); }, 6000);
        else if (!want && conn.timer) { clearInterval(conn.timer); conn.timer = null; }
    }

    function doConnect(raw) {
        var u = String(raw || '').trim().replace(/^@+/, '');
        if (!u) { conn.msg = 'اكتب يوزر تيك توك'; conn.ok = false; paintConnect(); return; }
        conn.busy = true; conn.msg = 'نتأكد إنك تبث ونتصل…'; conn.ok = true;
        paintConnect();
        api('POST', '/api/screens/connect', { username: u }).then(function (d) {
            conn.busy = false;
            if (!d || !d.success) {
                conn.ok = false;
                conn.msg = (d && CONN_ERR[d.error]) || 'ما قدرنا نتصل — جرّب بعد شوي';
                if (d && d.error === 'not_your_account' && d.username) conn.msg += ' (@' + d.username + ')';
                paintConnect();
                return;
            }
            conn.state = d.state || 'connecting';
            conn.msg = conn.state === 'connected' ? 'متصل ✓ — كل أدواتك شغّالة على بثك' : 'يتصل ببثك… ثواني';
            paintConnect();
            syncConnTimer();
        }).catch(function () { conn.busy = false; conn.ok = false; conn.msg = 'تعذّر الوصول للسيرفر'; paintConnect(); });
    }

    function doDisconnect() {
        conn.busy = true;
        paintConnect();
        api('POST', '/api/screens/disconnect', {}).then(function () {
            conn.busy = false; conn.state = 'idle'; conn.msg = 'انقطع الاتصال'; conn.ok = false;
            paintConnect();
            syncConnTimer();
        }).catch(function () { conn.busy = false; paintConnect(); });
    }

    function connectCard() {
        var c = el('div', 'vy-connect glass');
        c.id = 'vy-connect';
        if (!conn.loaded) loadConnection();
        fillConnect(c);
        syncConnTimer();
        return c;
    }

    function paintConnect() {
        var c = document.getElementById('vy-connect');
        if (c) fillConnect(c);
        var ds = document.getElementById('vy-data-stat');
        if (ds) paintDataStat(ds);
    }

    function fillConnect(c) {
        c.textContent = '';
        var st = conn.state;
        c.className = 'vy-connect glass s-' + st;
        var info = el('div', 'ci');
        var dot = el('span', 'dot');
        info.appendChild(dot);
        var tx = el('div');
        tx.appendChild(el('b', null, st === 'connected' ? 'متصل بالبث' : st === 'connecting' ? 'يتصل بالبث…' : 'اتصل بالبث'));
        var note = conn.msg || (conn.loaded && !conn.username ? 'حسابك مو مربوط بتيك توك — اربطه مرة وحدة وبعدها تتصل من هنا' : st === 'connected' ? 'الأليرتات والتوب والأهداف والشات والأغاني كلها شغّالة على بثك — حتى لو سكّرت الصفحة'
            : 'اكتب يوزر تيك توك حقك واتصل — يبقى متصل لين ينتهي البث');
        tx.appendChild(el('small', 'note' + (conn.msg && !conn.ok ? ' bad' : ''), note));
        info.appendChild(tx);
        c.appendChild(info);

        var ctl = el('div', 'cc');
        if (conn.loaded && !conn.username) {
            var lk = el('a', 'ob-btn primary', 'اربط تيك توك من «حسابي»');
            lk.href = '../profile.html';
            ctl.appendChild(lk);
        } else if (st === 'connected' || st === 'connecting') {
            ctl.appendChild(el('span', 'who', '@' + (conn.username || '')));
            var off = button('قطع الاتصال', 'ob-btn ghost', doDisconnect);
            off.disabled = conn.busy;
            ctl.appendChild(off);
        } else {
            var box = el('label', 'uin');
            box.appendChild(el('span', null, '@'));
            var inp = document.createElement('input');
            inp.className = 'ob-input';
            inp.dir = 'ltr';
            inp.placeholder = 'username';
            inp.autocomplete = 'off';
            inp.spellcheck = false;
            inp.value = conn.username || '';
            inp.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !e.isComposing) doConnect(inp.value); });
            box.appendChild(inp);
            ctl.appendChild(box);
            var go2 = button(conn.busy ? 'يتصل…' : 'اتصل', 'ob-btn primary', function () { doConnect(inp.value); });
            go2.disabled = conn.busy;
            ctl.appendChild(go2);
        }
        c.appendChild(ctl);
    }

    function paintDataStat(card) {
        var ok = O.linkOk() || conn.state === 'connected';
        card.className = 'vy-stat glass ' + (ok ? 'ok' : 'warn');
        card.querySelector('b').textContent = ok ? 'متصلة' : 'غير متصلة';
        card.querySelector('.sub').textContent = ok ? 'أرقام البث توصل للروابط' : 'اضغط «اتصل» فوق';
    }

    function stat(icon, value, label, id) {
        var c = el('div', 'vy-stat glass');
        if (id) c.id = id;
        c.appendChild(svgEl(icon));
        c.appendChild(el('b', null, value));
        c.appendChild(el('span', 'sub', label));
        return c;
    }

    /** إعادة رسم الصفحة ما ترجّعها لأولها: نرجّع مكان التمرير بعد الرسم. */
    function keepScroll(box) {
        var top = box.scrollTop;
        if (top) requestAnimationFrame(function () { box.scrollTop = top; });
    }

    function renderHome() {
        dirty.home = false;
        keepScroll(homeBody);
        homeBody.textContent = '';
        var w = el('div', 'vy-wrap');

        // الهيرو
        var hero = el('div', 'vy-hero glass');
        var txt = el('div');
        var k = el('span', 'kicker');
        k.appendChild(el('i'));
        k.appendChild(document.createTextNode(firstName() ? 'أهلاً ' + firstName() + ' — جاهز للبث؟' : 'منصة الأوفرلي لصناع المحتوى'));
        txt.appendChild(k);
        var h1 = el('h1');
        h1.appendChild(el('span', 'ar', 'فيرو '));
        h1.appendChild(el('span', 'en', 'Veyro'));
        txt.appendChild(h1);
        txt.appendChild(el('p', null, 'صمّم شاشات بثك على OBS و TikTok LIVE Studio: أليرتات، توب الداعمين، أهداف، نصوص وأيقونات — وكل شاشة لها رابط تحطه ببرنامج البث.'));
        var acts = el('div', 'acts');
        acts.appendChild(iconBtn(cur ? 'افتح أدوات البث' : 'ابدأ أول شاشة', 'play', 'primary lg', function () { if (cur) go('editor'); else createScreen(''); }));
        acts.appendChild(iconBtn('شاشاتي', 'screens', 'ghost lg', function () { go('screens'); }));
        txt.appendChild(acts);
        hero.appendChild(txt);
        var live = el('div', 'vy-live');
        live.id = 'vy-live';
        var tag = el('span', 'tag'); tag.appendChild(el('i')); tag.appendChild(document.createTextNode('LIVE'));
        live.appendChild(tag);
        var logo = el('img'); logo.src = 'brand/veyro-icon.png'; logo.alt = ''; live.appendChild(logo);
        var st2 = el('div', 'stat');
        st2.appendChild(el('span', null, screens.length + ' شاشة'));
        if (cur) st2.appendChild(el('span', null, cur.name));
        live.appendChild(st2);
        hero.appendChild(live);
        w.appendChild(hero);
        w.appendChild(connectCard());
        var slw = el('div', 'vy-sl-home glass');
        slw.appendChild(streamlabsCard());
        w.appendChild(slw);

        // أرقام سريعة
        var stats = el('div', 'vy-stats');
        stats.appendChild(stat('screens', screens.length + ' / ' + maxScreens, 'شاشاتك'));
        var total = 0, on = 0;
        screens.forEach(function (x) { total += itemsCount(x); if (!(x === cur ? S().enabled === false : x.design && x.design.enabled === false)) on++; });
        stats.appendChild(stat('layers', String(total), 'عنصر بكل الشاشات'));
        stats.appendChild(stat('link', String(on), 'رابط شغّال بالبث'));
        var ds = stat('bolt2', '', '', 'vy-data-stat');
        paintDataStat(ds);
        stats.appendChild(ds);
        w.appendChild(stats);

        // أدوات البث
        w.appendChild(secHead('أدوات البث', 'اختر أداة وتنضاف للشاشة المفتوحة — وبعدها اسحبها لأي مكان.'));
        var tools = el('div', 'vy-tools');
        TOOL_KEYS.forEach(function (key) {
            var sec = secOf(key);
            var c = button('', 'vy-card vy-tool glass', function () { pickSection(key); });
            c.appendChild(svgEl(sec.icon));
            c.appendChild(el('b', null, sec.label));
            c.appendChild(el('small', null, sec.desc));
            tools.appendChild(c);
        });
        w.appendChild(tools);

        // آخر الشاشات
        if (screens.length) {
            var hd = secHead('شاشاتك', 'آخر الشاشات اللي اشتغلت عليها.');
            hd.appendChild(iconBtn('كل الشاشات', 'screens', 'ghost', function () { go('screens'); }));
            w.appendChild(hd);
            var grid = el('div', 'vy-screens');
            screensSorted().slice(0, 3).forEach(function (scr) { grid.appendChild(screenCard(scr)); });
            w.appendChild(grid);
        }

        // طريقة الإضافة
        w.appendChild(secHead('طريقة الإضافة ببرنامج البث', 'انسخ رابط الشاشة وحطه كمصدر متصفح — الخلفية شفافة لحالها.'));
        w.appendChild(guideCard());

        homeBody.appendChild(w);
        thumbsLater(homeBody);
    }

    function secHead(title, sub) {
        var h = el('div', 'vy-sechead');
        var t = el('div');
        t.appendChild(el('h2', null, title));
        if (sub) t.appendChild(el('p', null, sub));
        h.appendChild(t);
        return h;
    }

    function guideCard() {
        var g = el('div', 'vy-guide glass');
        [['OBS Studio', 'PC', ['من «المصادر» اضغط + واختر «Browser» (متصفح).', 'الصق الرابط بخانة URL.', 'العرض 1920 والطول 1080 (للعمودي 1080 × 1920).', 'اضغط OK — والخلفية شفافة لحالها.']],
         ['TikTok LIVE Studio', 'LIVE', ['من «إضافة مصدر» اختر «رابط» أو «Link».', 'الصق الرابط واضبط المقاس على حجم المشهد.', 'لو المشهد عمودي غيّر اتجاه الشاشة لـ«عمودي» من «الرابط والإعدادات».']]
        ].forEach(function (x) {
            var c = el('div');
            var h = el('h3', null, x[0] + ' ');
            h.appendChild(el('span', null, x[1]));
            c.appendChild(h);
            var ol = el('ol', 'ob-steps');
            x[2].forEach(function (t) { ol.appendChild(el('li', null, t)); });
            c.appendChild(ol);
            g.appendChild(c);
        });
        return g;
    }

    /* ---------------- الشاشات ---------------- */

    function screensSorted() {
        return screens.slice().sort(function (a, b) {
            if (a === cur) return -1;
            if (b === cur) return 1;
            return String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''));
        });
    }

    function designOf(scr) { return scr === cur ? S() : (scr.design || {}); }

    function screenCard(scr) {
        var d = designOf(scr);
        var portrait = d.editOrient === 'p';
        var c = el('div', 'vy-card vy-scr glass' + (scr === cur ? ' cur' : ''));
        var th = el('div', 'thumb');
        th.setAttribute('data-thumb', String(scr.id));
        th.title = 'افتح بأدوات البث';
        th.addEventListener('click', function () { openIn(scr); });
        var badge = el('span', 'badge' + (d.enabled === false ? ' off' : ''), d.enabled === false ? 'مخفية بالبث' : (portrait ? 'عمودي' : 'أفقي'));
        th.appendChild(badge);
        c.appendChild(th);
        var info = el('div', 'info');
        info.appendChild(el('b', null, scr.name));
        var n = itemsCount(scr);
        info.appendChild(el('small', null, (n ? n + ' عنصر' : 'فاضية') + (scr === cur ? ' · مفتوحة الحين' : '')));
        c.appendChild(info);
        var a = el('div', 'acts');
        var open = iconBtn('تعديل', 'edit', 'primary grow', function () { openIn(scr); });
        a.appendChild(open);
        var cp = iconBtn('', 'link', 'ghost icon', function () { copyLink(scr); });
        cp.title = 'نسخ الرابط'; cp.setAttribute('aria-label', 'نسخ رابط ' + scr.name);
        a.appendChild(cp);
        var dp = iconBtn('', 'dup', 'ghost icon', function () {
            if (screens.length >= maxScreens) { toast('وصلت للحد: ' + maxScreens + ' شاشة'); return; }
            if (scr === cur) flush();
            createScreen(scr.name + ' (نسخة)', JSON.parse(JSON.stringify(designOf(scr))), true);
        });
        dp.title = 'تكرار'; dp.setAttribute('aria-label', 'تكرار ' + scr.name);
        a.appendChild(dp);
        var rm = iconBtn('', 'trash', 'danger icon', function () { deleteScreen(scr); });
        rm.title = 'حذف'; rm.setAttribute('aria-label', 'حذف ' + scr.name);
        a.appendChild(rm);
        c.appendChild(a);
        return c;
    }

    function openIn(scr) {
        if (scr !== cur) openScreen(scr);
        go('editor');
    }

    function renderScreensView() {
        dirty.screens = false;
        keepScroll(screensBody);
        screensBody.textContent = '';
        var w = el('div', 'vy-wrap');
        var hd = secHead('الشاشات', 'كل شاشة لها تصميم ورابط خاص — تقدر تسوي لين ' + maxScreens + ' شاشة.');
        if (screens.length < maxScreens) hd.appendChild(iconBtn('شاشة جديدة', 'plus', 'primary', function () { createScreen(''); }));
        w.appendChild(hd);
        var grid = el('div', 'vy-screens');
        screensSorted().forEach(function (scr) { grid.appendChild(screenCard(scr)); });
        if (screens.length < maxScreens) {
            var nw = button('', 'vy-card vy-new', function () { createScreen(''); });
            nw.appendChild(el('span', 'plus', '+'));
            nw.appendChild(el('span', null, 'شاشة جديدة'));
            nw.appendChild(el('small', null, (maxScreens - screens.length) + ' متبقية'));
            grid.appendChild(nw);
        }
        w.appendChild(grid);
        screensBody.appendChild(w);
        thumbsLater(screensBody);
    }

    /** معاينة مصغّرة حقيقية لكل شاشة (نفس رسم الرابط) — بعد ما تنقاس البطاقات. */
    function thumbsLater(root) {
        requestAnimationFrame(function () {
            Array.prototype.forEach.call(root.querySelectorAll('[data-thumb]'), function (th) {
                var scr = screens.filter(function (x) { return String(x.id) === th.getAttribute('data-thumb'); })[0];
                if (scr) drawThumb(scr, th);
            });
        });
    }

    function drawThumb(scr, th) {
        var d = designOf(scr);
        var items = (Array.isArray(d.items) ? d.items : []).filter(function (it) { return !it.hidden; });
        var W = th.clientWidth, H = th.clientHeight;
        if (!W || !H) return;
        if (!items.length) { th.appendChild(el('span', 'empty', 'شاشة فاضية')); return; }
        var o = d.editOrient === 'p' ? 'p' : 'l';
        var fw = o === 'l' ? W : Math.round(H * 1080 / 1920), fh = H;
        var tf = el('div', 'tf' + (o === 'p' ? ' p' : ''));
        tf.style.width = fw + 'px';
        var Fs = { w: fw, h: fh };
        th.appendChild(tf);
        var key = O.keyFor(TEMPLATE, o);
        items.forEach(function (it, i) {
            try {
                var copy = JSON.parse(JSON.stringify(it));
                copy.id = 'th-' + scr.id + '-' + i;
                var n = O.buildItem(copy, Fs, { preview: true });
                tf.appendChild(n);
                O.place(n, O.posOf(it, key), Fs);
            } catch (e) { /* معاينة بس — نتجاهل أي عنصر ما انرسم */ }
        });
    }

    /* ---------------- القائمة: طي، درج الجوال، الحساب، تأثيرات الماوس ---------------- */

    var NAV_KEY = 'vy:nav-mini';
    function setMini(on) {
        app.classList.toggle('mini', on);
        try { localStorage.setItem(NAV_KEY, on ? '1' : '0'); } catch (e) { /* ignore */ }
        var cb = document.getElementById('vy-collapse');
        cb.setAttribute('aria-label', on ? 'فتح القائمة' : 'طي القائمة');
        cb.querySelector('.lbl').textContent = on ? 'فتح القائمة' : 'طي القائمة';
        setTimeout(function () { if (view === 'editor' && !drag) renderCanvas(); }, 380);
    }
    try { if (localStorage.getItem(NAV_KEY) === '1') setMini(true); } catch (e) { /* ignore */ }
    document.getElementById('vy-collapse').addEventListener('click', function () { setMini(!app.classList.contains('mini')); });
    document.getElementById('vy-menu').addEventListener('click', function () { app.classList.add('drawer'); });
    document.getElementById('vy-scrim').addEventListener('click', function () { app.classList.remove('drawer'); });
    document.querySelector('.vy-brand').addEventListener('click', function (e) { e.preventDefault(); go('home'); });

    function renderUser() {
        userEl.textContent = '';
        try { me = window.AGPAuth && window.AGPAuth.getCachedUser ? window.AGPAuth.getCachedUser() : null; } catch (e) { me = null; }
        if (!token() || !me) {
            var b = button('', 'ob-btn primary', function () { app.classList.remove('drawer'); showGate('login'); });
            b.innerHTML = svg(ic('login'));
            b.appendChild(el('span', 'lbl', 'تسجيل الدخول'));
            b.setAttribute('data-tip', 'تسجيل الدخول');
            b.style.width = '100%';
            userEl.appendChild(b);
            return;
        }
        var u = el('a', 'vy-user');
        u.href = '../profile.html';
        u.setAttribute('data-tip', 'حسابي');
        var av = el('span', 'av');
        var pic = me.tiktok_avatar_url;
        if (pic) { var im = el('img'); im.src = pic; im.alt = ''; im.referrerPolicy = 'no-referrer'; im.onerror = function () { av.textContent = initial(); }; av.appendChild(im); }
        else av.textContent = initial();
        u.appendChild(av);
        var who = el('span', 'who');
        who.appendChild(el('b', null, me.display_name || me.tiktok_display_name || me.username || 'حسابي'));
        who.appendChild(el('small', null, me.tiktok_username ? '@' + me.tiktok_username : 'حسابي'));
        u.appendChild(who);
        userEl.appendChild(u);
    }
    function initial() { var n = me && (me.display_name || me.username) || 'V'; return String(n).trim().charAt(0).toUpperCase(); }

    // لمعة تتبع الماوس على الأزرار والبطاقات، وتوهّج الخلفية، وميلان بطاقة LIVE
    var glowEl = document.getElementById('vy-glow');
    var gPos = null, gRaf = 0;
    document.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'touch') return;
        var t = e.target.closest && e.target.closest('.ob-btn, .vy-item, .vy-card, .ob-tool, .ob-chip');
        if (t) {
            var r = t.getBoundingClientRect();
            t.style.setProperty('--mx', (e.clientX - r.left) + 'px');
            t.style.setProperty('--my', (e.clientY - r.top) + 'px');
        }
        gPos = [e.clientX, e.clientY];
        if (!gRaf) gRaf = requestAnimationFrame(function () {
            gRaf = 0;
            glowEl.style.setProperty('--gx', gPos[0] + 'px');
            glowEl.style.setProperty('--gy', gPos[1] + 'px');
            var lv = view === 'home' && document.getElementById('vy-live');
            if (lv) {
                var rr = lv.getBoundingClientRect();
                var dx = clamp((gPos[0] - (rr.left + rr.width / 2)) / rr.width, -1, 1);
                var dy = clamp((gPos[1] - (rr.top + rr.height / 2)) / rr.height, -1, 1);
                lv.style.setProperty('--ry', (-8 + dx * 10) + 'deg');
                lv.style.setProperty('--rx', (4 - dy * 8) + 'deg');
            }
        });
    }, { passive: true });

    // اسم القسم كتلميح لما القائمة مطوية
    document.getElementById('vy-side').addEventListener('pointerover', function (e) {
        var t = e.target.closest && e.target.closest('[data-tip]');
        if (!t || !app.classList.contains('mini') || window.innerWidth <= 900) { tipEl.classList.remove('show'); return; }
        var r = t.getBoundingClientRect();
        tipEl.textContent = t.getAttribute('data-tip');
        tipEl.style.left = (r.right + 12) + 'px';
        tipEl.style.top = (r.top + r.height / 2 - 16) + 'px';
        tipEl.classList.add('show');
    });
    document.getElementById('vy-side').addEventListener('pointerleave', function () { tipEl.classList.remove('show'); });

    /* ---------------- تشغيل ---------------- */

    function showGate(kind) {
        gbox.textContent = '';
        // يسار: هوية Veyro ومزاياها — يمين: الرسالة والأزرار
        var br = el('div', 'ob-gbrand');
        var logo = el('img', 'ob-glogo');
        logo.src = 'brand/veyro-logo.webp';
        logo.alt = 'Veyro فيرو';
        logo.width = 260; logo.height = 128;
        br.appendChild(logo);
        var ul = el('ul');
        ['شاشات برابط لكل وحدة على OBS و TikTok LIVE Studio', 'أليرتات الهدايا والمتابعين والشير', 'توب الداعمين والأهداف والعدّادات', 'كل تعديل ينحفظ ويوصل للبث خلال ثواني'].forEach(function (t) {
            var li = el('li');
            li.innerHTML = svg(ic('check'));
            li.appendChild(el('span', null, t));
            ul.appendChild(li);
        });
        br.appendChild(ul);
        var f = el('div', 'ob-gform');
        if (kind === 'login') {
            buildLoginForm(f);
        } else if (kind === 'preview') {
            f.appendChild(el('h2', null, 'قريباً'));
            f.appendChild(el('p', null, 'Veyro بمرحلة التجربة الحين ومتاح للإدارة بس. شاشات البث الحالية شغّالة زي ما هي من حسابك.'));
            var c = el('a', 'ob-btn primary lg', 'شاشات البث الحالية');
            c.href = '../overlay/index.html';
            f.appendChild(c);
        } else if (kind === 'streamer') {
            f.appendChild(el('h2', null, 'لحسابات الستريمر'));
            f.appendChild(el('p', null, 'أدوات Veyro لحسابات الستريمر بس. لو تبث على تيك توك، تواصل مع الإدارة لتحويل حسابك.'));
            var b = el('a', 'ob-btn primary lg', 'رجوع لحسابي');
            b.href = '../profile.html';
            f.appendChild(b);
        } else {
            f.appendChild(el('h2', null, 'ما قدرنا نفتح شاشاتك'));
            f.appendChild(el('p', null, 'تأكد من الاتصال بالإنترنت وحدّث الصفحة.'));
            f.appendChild(button('حدّث الصفحة', 'ob-btn primary lg', function () { location.reload(); }));
        }
        f.appendChild(el('div', 'fine', 'Veyro — من منظومة ألعاب أيمن'));
        gbox.appendChild(br);
        gbox.appendChild(f);
        gate.hidden = false;
    }

    /**
     * الدخول داخل Veyro نفسه بنفس حساب ألعاب أيمن (نفس السيرفر و AGPAuth) — بدون تحويل لصفحة login.html.
     * الإيميل/اليوزر + كلمة المرور، وجوجل. تيك توك يمر على صفحة موافقة تيك توك ويرجع هنا تلقائياً.
     * ولو المستخدم داخل أصلاً بموقع ألعاب أيمن، الجلسة نفسها تنقرى هنا وما تطلع البوابة.
     */
    var GOOGLE_CLIENT_ID = '777683353907-hkemaaft5t7mktgtjvlf47ptuqk93qbg.apps.googleusercontent.com'; // نفس login.html
    var LOGIN_ERRORS = {
        invalid_credentials: 'البيانات غلط — تأكد من الإيميل أو اليوزر وكلمة المرور',
        device_locked: 'هذا الحساب وصل للحد الأقصى من الأجهزة (3 أجهزة). تواصل مع الإدارة للسماح بجهاز جديد.'
    };

    function buildLoginForm(f) {
        f.appendChild(el('h2', null, 'سجّل دخولك'));
        f.appendChild(el('p', null, 'ادخل بنفس حسابك في ألعاب أيمن، وتنفتح شاشاتك على طول.'));
        var form = el('form', 'ob-glogin');
        form.noValidate = true;

        function field(label, type, auto, ph, ltr) {
            var w = el('label', 'ob-field');
            w.appendChild(el('span', null, label));
            var inp = el('input', 'ob-input' + (ltr ? ' ltr' : ''));
            inp.type = type; inp.autocomplete = auto; inp.placeholder = ph; inp.spellcheck = false;
            inp.setAttribute('autocapitalize', 'off');
            w.appendChild(inp);
            form.appendChild(w);
            return { wrap: w, input: inp };
        }
        var idF = field('البريد الإلكتروني أو اسم المستخدم', 'text', 'username', 'name@mail.com أو username', true);
        var pwF = field('كلمة المرور', 'password', 'current-password', '••••••••', true);
        // زر إظهار/إخفاء كلمة المرور
        var pwBox = el('div', 'ob-pw');
        pwF.wrap.insertBefore(pwBox, pwF.input);
        pwBox.appendChild(pwF.input);
        var eye = button('إظهار', null, function () {
            var show = pwF.input.type === 'password';
            pwF.input.type = show ? 'text' : 'password';
            eye.textContent = show ? 'إخفاء' : 'إظهار';
        });
        pwBox.appendChild(eye);

        var links = el('div', 'ob-glinks');
        var forgot = el('a', null, 'نسيت كلمة المرور؟');
        forgot.href = '../login.html';
        links.appendChild(forgot);
        form.appendChild(links);

        var submit = el('button', 'ob-btn primary lg');
        submit.type = 'submit';
        submit.innerHTML = svg(ic('login'));
        submit.appendChild(el('span', null, 'دخول'));
        form.appendChild(submit);
        var note = el('div', 'ob-gnote');
        note.setAttribute('role', 'status');
        form.appendChild(note);
        function say(msg, ok) { note.textContent = msg || ''; note.classList.toggle('ok', !!ok); }

        var busy = false;
        function setBusy(on) { busy = on; submit.disabled = on; }
        function finish(r) {
            setBusy(false);
            if (r && r.success) { say('أهلاً فيك ✓', true); gate.hidden = true; start(); return; }
            say(LOGIN_ERRORS[r && r.error] || (r && r.message) || 'تعذّر تسجيل الدخول، حاول مرة ثانية', false);
        }
        function failNet() { setBusy(false); say('تعذّر الوصول للخادم — تأكد من الاتصال بالإنترنت', false); }

        form.addEventListener('submit', function (e) {
            e.preventDefault();
            if (busy) return;
            var id = idF.input.value.trim().replace(/^@+/, '');
            var pw = pwF.input.value;
            if (!id) { say('اكتب الإيميل أو اسم المستخدم', false); idF.input.focus(); return; }
            if (!pw) { say('اكتب كلمة المرور', false); pwF.input.focus(); return; }
            if (!window.AGPAuth || !window.AGPAuth.login) { say('تعذّر تحميل نظام الحسابات — حدّث الصفحة', false); return; }
            setBusy(true);
            say('جارٍ تسجيل الدخول…', true);
            window.AGPAuth.login(id, pw).then(finish, failNet);
        });

        form.appendChild(el('div', 'or', 'أو'));
        var gbtn = el('div', 'ob-google');
        form.appendChild(gbtn);
        // تيك توك: صفحة موافقة تيك توك ثم يرجع لـVeyro تلقائياً (?next=)
        if (window.AGPAuth && window.AGPAuth.tiktokLoginUrl) {
            var tt = el('a', 'ob-btn ghost lg tt');
            tt.href = window.AGPAuth.tiktokLoginUrl('veyro/index.html');
            tt.innerHTML = svg('<path d="M16.6 5.82A4.28 4.28 0 0115.54 3h-3.09v12.4a2.59 2.59 0 01-2.59 2.5 2.6 2.6 0 01-2.59-2.6 2.6 2.6 0 013.37-2.48V9.66a5.73 5.73 0 00-.78-.05A5.68 5.68 0 004.18 15.3 5.68 5.68 0 009.86 21a5.68 5.68 0 005.68-5.7V9.01a7.35 7.35 0 004.3 1.38V7.3a4.29 4.29 0 01-3.24-1.48z"/>');
            tt.appendChild(el('span', null, 'الدخول بتيك توك'));
            form.appendChild(tt);
        }
        var sg = el('div', 'ob-gsignup', 'ما عندك حساب؟ ');
        var sgA = el('a', null, 'أنشئ حساب جديد');
        sgA.href = '../signup.html';
        sg.appendChild(sgA);
        form.appendChild(sg);
        f.appendChild(form);

        // بعد ما تنعرض البوابة: زر جوجل (يحتاج عرض العنصر) والتركيز على أول خانة
        setTimeout(function () {
            mountGoogle(gbtn, function (resp) {
                if (busy || !resp || !resp.credential || !window.AGPAuth || !window.AGPAuth.loginWithGoogle) return;
                setBusy(true);
                say('جارٍ الدخول بحساب جوجل…', true);
                window.AGPAuth.loginWithGoogle(resp.credential).then(finish, failNet);
            });
            if (window.innerWidth > 900) idF.input.focus();
        }, 0);
    }

    function mountGoogle(box, onCredential) {
        function render() {
            try {
                window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: onCredential });
                window.google.accounts.id.renderButton(box, { type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'ar', width: Math.max(220, Math.min(box.offsetWidth || 320, 400)) });
            } catch (e) { box.textContent = ''; }
        }
        if (window.google && window.google.accounts && window.google.accounts.id) { render(); return; }
        var s = document.querySelector('script[data-vy-gsi]');
        if (!s) {
            s = document.createElement('script');
            s.src = 'https://accounts.google.com/gsi/client';
            s.async = true;
            s.setAttribute('data-vy-gsi', '1');
            document.head.appendChild(s);
        }
        s.addEventListener('load', render);
    }

    /** الصفحة من الرابط: #home، #screens، #tools/<قسم> (أو ?s=<شاشة> = المحرر). */
    function viewFromUrl() {
        var h = (location.hash || '').replace(/^#/, '');
        var m = /^tools\/(\w+)$/.exec(h);
        if (m && secOf(m[1])) return { view: 'editor', sec: m[1] };
        if (h === 'screens') return { view: 'screens' };
        if (h === 'stats') return { view: 'stats' };
        if (h === 'tools') return { view: 'editor' };
        if (new URLSearchParams(location.search).get('s')) return { view: 'editor' };
        return { view: 'home' };
    }

    /**
     * مرحلة التجربة: Veyro للإدارة (role = admin) ولحسابات «تجربة Veyro» (permissions.veyro_tester). من السيرفر (/api/auth/me)
     * مو من الكاش. لفتحه للستريمرز: خلّ PREVIEW_ADMIN_ONLY = false.
     */
    var PREVIEW_ADMIN_ONLY = true;

    function start() {
        renderUser();
        if (!token()) { renderHome(); showGate('login'); return; }
        var gateCheck = PREVIEW_ADMIN_ONLY ? api('GET', '/api/auth/me') : Promise.resolve(null);
        gateCheck.then(function (m) {
            if (!m) return loadScreens();
            if (m._status === 401) { renderHome(); showGate('login'); return; }
            // الأدمن، أو حساب عنده صلاحية «تجربة Veyro» (veyro_tester من لوحة الأدمن)
            var okUser = m.success && m.user && (m.user.role === 'admin' || (m.user.permissions && m.user.permissions.veyro_tester));
            if (!okUser) { renderHome(); showGate(m.success ? 'preview' : 'error'); return; }
            loadScreens();
        }).catch(function () { renderHome(); showGate('error'); });
    }

    function loadScreens() {
        api('GET', '/api/screens').then(function (d) {
            if (d._status === 401) { renderHome(); showGate('login'); return; }
            if (d._status === 403) { renderHome(); showGate('streamer'); return; }
            if (!d.success) { renderHome(); showGate('error'); return; }
            screens = d.screens || [];
            maxScreens = d.max || maxScreens;
            tiktokLinked = d.tiktokLinked !== false;
            renderUser();
            var want = Number(new URLSearchParams(location.search).get('s'));
            if (!want) { try { want = Number(localStorage.getItem(LAST_KEY)); } catch (e) { want = 0; } }
            var first = screens.filter(function (x) { return x.id === want; })[0] || screens[0];
            if (first) openScreen(first);
            var v = viewFromUrl();
            // حساب جديد: أول شاشة تنسوى، وبعدها يفتح القسم اللي بالرابط
            if (!screens.length) { go('home'); createScreen('شاشتي الأولى', null, true, function () { go(v.view, v.sec); }); }
            else go(v.view, v.sec);
        }).catch(function () { renderHome(); showGate('error'); });
    }

    // بيانات جديدة: نعيد رسم أدوات البيانات بس (الأليرت والنصوص وحركتها ما تنلمس)
    O.onStats(function () {
        if (!drag && !resize && F) S().items.forEach(function (it) { if (O.isDataItem(it) && !O.refreshItem(nodes[it.id], it)) rebuildNode(it); });
        paintStatus();
    });
    O.onLink(paintStatus);
    window.addEventListener('resize', function () { if (!drag) renderCanvas(); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (!drag) renderCanvas(); });

    window.addEventListener('resize', function () { if (window.innerWidth > 900) app.classList.remove('drawer'); });
    // تغيّر الرابط (#home / #screens / #tools/<قسم>) من زر الرجوع أو رابط مباشر
    window.addEventListener('hashchange', function () {
        if (!screens.length && !cur) return;
        var v = viewFromUrl();
        if (v.view !== view || (v.sec && v.sec !== section)) go(v.view, v.sec);
    });
    renderRail();
    paintStatus();
    start();
}());
