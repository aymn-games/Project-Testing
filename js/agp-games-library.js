/**
 * ألعاب أيمن — مكتبة ألعاب البثوث (التصميم الجديد).
 *
 * منقول من games.html: قائمة الألعاب الحقيقية (REAL_GAMES وCARD_INFO)،
 * سجل التحديثات (GAME_UPDATES)، وقيود فتح الألعاب (حساب ستريمر + ربط
 * تيك توك أو كيك + الاشتراك + الصيانة ومرحلة الاختبار) ونافذة سبب القفل.
 * لإضافة لعبة: REAL_GAMES وCARD_INFO هنا بنفس الطريقة اللي كانت بـgames.html.
 *
 * الجديد: التصنيفات والبحث، وقسم آخر التحديثات ينفتح من زره.
 */
(function(){
  function $(s){ return document.querySelector(s); }
  function norm(t){ return String(t || '').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/ى/g,'ي').replace(/[ًٌٍَُِّْ]/g,'').toLowerCase(); }
  var REAL_GAMES = [{"id": "arena", "title": "🥊 الحلبة", "desc": "قتال بالدور: المشاهد يكتب كلمة الدخول ويدخل الحلبة بدوره، والتكبيس يضرب لكمات وكل 50 تكبيسة متتالية ركلة، والدعم يعطي ضربة الوردة والضربة الطائرة والشفاء والضربة القاضية. الخاسر يطلع ويدخل التالي ضد الفايز بنفس صحته.", "cover": "", "href": "games/arena/index.html"}, {"id": "hasila", "title": "🏆 حصيلة", "desc": "لعبة فريقين بلوحة فئات: كل فئة فيها أسئلة بـ200 و400 و600. الفريق صاحب الدور يختار سؤال ويجاوب بالشات، ولو خلص وقته ينفتح السؤال للفريقين. فئات السعودية والأمثال والألغاز والإيموجي، وأكثر من 1200 سؤال.", "cover": "", "href": "games/hasila/index.html"}, {"id": "cowboy-duel", "title": "🤠 بلدة الكاوبوي", "desc": "مبارزات ثلاثية الأبعاد بسوق الغرب: أي مشاهد يكتب كلمة الدخول بالشات ويدخل البلدة بشخصية كاوبوي. القرعة توزّع اللاعبين مبارزات، وعند الجرس يطلع رقم أو كلمة ذهبية، وأول من يكتبها بالشات يطلق ويُسقط خصمه ويتأهل. قرعة جديدة كل جولة لين النهائي، والفائز بطل البلدة.", "cover": "", "href": "games/cowboy-duel/index.html"}, {"id": "tug-of-war", "title": "🪢 شد الحبل", "desc": "فريقين على حبل واحد بساحة ثلاثية الأبعاد، وكل مشاهد ينضم بكلمة فريقه. كل تكبيسة أو رسالة بالشات تسحب الحبل لفريقك، واللي يتعدى خط النص ينقصى. والهدايا تقلب الموازين: تجميد خصم، قوة الفريق ×2، وخطاف الاندفاع. والفريق اللي يقصي كل لاعبين الخصم يفوز.", "cover": "", "href": "games/tug-of-war/index.html"}, {"id": "lamha", "title": "🧠 محِك العقول", "desc": "لعبة أسئلة سريعة: كل جولة 3 لاعبين بنفس الوقت، ولكل واحد سؤاله بالشات. الجواب الصح نقطة وسؤال جديد، واللي ما يعرفه يكتب «سكب» ويخسر نص نقطة. نمط سريع (الكل يلعب مرة والأعلى يفوز) أو بطولة بتصفيات لين النهائي.", "cover": "", "href": "games/lamha/index.html"}, {"id": "formula-race", "title": "🏎️ فورمولا ون", "desc": "سباق سيارات ثلاثي الأبعاد: المشاهد يكتب كلمة الدخول بالشات وياخذ سيارة بالشبكة. التكبيس يزيد سرعة سيارته وكل 50 تكبيسة نيترو، والدعم يعطيه درع وبوابة ومكوك وصاروخ وصاعقة. والأوائل يطلعون على منصة التتويج.", "cover": "", "href": "games/formula-race/index.html"}, {"id": "abyss", "title": "🏔️ الهاوية", "desc": "جسر زجاجي معلّق بين الجبال فوق هاوية، وكل خطوة صف فيه مربعين. يطلع سؤال (خيارين أو صح وخطأ)، وكل لاعب يكتب جوابه بالشات وشخصيته تنط على المربع. الجواب الغلط يكسر الزجاجة ويطيح اللي فوقه. نمطين: عدد خطوات (10 أو 15 أو 20) أو آخر ناجي.", "cover": "", "href": "games/abyss/index.html"}, {"id": "rock-paper-scissors", "title": "✊ حجرة ورقة مقص", "desc": "بطولة لكل جمهورك بساحة ثلاثية الأبعاد: أي مشاهد يكتب 1 أو 2 أو 3 بالشات يدخل وتطلع له شخصية. كل دور مواجهات ثنائية، وكل لاعب يكتب 1 حجرة أو 2 ورقة أو 3 مقص، والفائز يتأهل والخاسر يطلع للمتفرجين لين يبقى بطل واحد.", "cover": "", "href": "games/rock-paper-scissors/index.html"}, {"id": "mafia", "title": "🔪 المافيا", "desc": "مافيا وطبيب ومحقق ومواطنين، كل لاعب يدخل من جواله بالباركود أو رقم الغرفة ويوصله دوره بالسر. بالليل المافيا يختارون ضحيتهم والطبيب يحمي والمحقق يفحص، وكل شي يطلع على البث بمشاهد ثلاثية الأبعاد. بالنهار نقاش وتصويت، وللمافيا كروت سرية تقلب اللعبة.", "cover": "", "href": "games/mafia/index.html"}, {"id": "word-chain", "title": "🔗 سلسلة الكلمات", "desc": "النظام يعطي كلمة من فئة (حيوانات، أسماء، أكلات، أشياء بالبيت، دول، مدن، فواكه وخضار، وغيرها)، وأول لاعب يكتب بالشات كلمة من نفس الفئة تبدأ بآخر حرف فيها ياخذ نقطتين، ولو تأخرتوا يطلع لكم تلميح. واللي ما يقدر أحد يكمّل بعده يقفلها على الكل وياخذ 4 نقاط، وأول من يوصل لنقاط الفوز يكسب.", "cover": "", "href": "games/word-chain/index.html"}, {"id": "penalty", "title": "⚽ بلنتي", "desc": "العبها في بثك (جمهورك ينقسم فريقين) أو ضد بث آخر (جمهور كل ستريمر فريق). صاحب الدور يكتب رقم الزاوية من 1 إلى 4 بشات بثه، والحارس يرتمي لزاوية عشوائية. 3 جولات بوقت محدد، والفريق اللي يكسب جولتين يفوز.", "cover": "", "href": "games/penalty/index.html"}, {"id": "word-hive", "title": "🐝 كوّن كلمة", "desc": "خلية سداسية من سبعة أحرف وحرف أساسي في الوسط. المتابعون يكتبون كلمات عربية بالشات من أحرف الخلية بشرط وجود حرف الوسط، وأول من يرسل الكلمة الصحيحة ياخذ نقاطها، والكلمة اللي تجمع الأحرف السبعة ذهبية بمكافأة إضافية.", "cover": "", "href": "games/word-hive/index.html"}, {"id": "greed", "title": "🎰 الطمع", "desc": "صاحب الدور يقف على المنصة أمام ماكينة رقم الحظ، ويكتب لف بالشات لرقم من 1 إلى 6 يُضاف لنقاط دوره، أو توقف ليحفظها في رصيده. رقم 1 يضيّع نقاط الدور، وأول من يوصل الهدف يفوز.", "cover": "", "href": "games/greed/index.html"}, {"id": "dots", "title": "🔵 توصيل النقاط", "desc": "فريقين ولوحة نقاط مرقّمة. كل لاعب بدوره يوصّل خط بين نقطتين متجاورتين بكتابة رقمين بينهم شرطة بالشات (مثل 2-3)، واللي يكمّل مربع ياخذه ويلعب مرة ثانية. الفريق صاحب المربعات الأكثر يفوز.", "cover": "", "href": "games/dots/index.html"}, {"id": "survival-ship", "title": "🚢 سفينة النجاة", "desc": "اللاعبين على سطح سفينة بالبحر، وكل دور يطلع حرف وفئة (اسم، نبات، جماد، بلاد) لصاحب الدور. يكتب إجابته بالشات قبل ما يخلص الوقت، والستريمر يقبل أو يرفض: الغلط أو التأخير ينرمي في البحر، وهدية طوق النجاة تنقذه مرة. آخر واحد على السفينة يفوز.", "cover": "", "href": "games/survival-ship/index.html"}, {"id": "intruder", "title": "🛰️ محطة سهيل", "desc": "مواطنين وامبوسترز مخفيين على محطة فضائية. كل لاعب يدخل من جواله بالباركود: المواطنين يخلّصون المهام ويكشفون الامبوستر بالتصويت، والامبوسترز يقتلون ويخرّبون بدون ما ينكشفون.", "cover": "", "href": "games/intruder/index.html"}, {"id": "luck-color", "title": "🎨 حظ و لون", "desc": "القرعة تختار لاعب، ويختار لون من 15 بكتابة رقمه بالشات: كل لون يخفي تحدي أو مفاجأة تكسّبك أو تخسّرك نقاط. كل كم جولة يفتح المتجر لشراء بطاقات زي الملك والسرقة والتجميد، وصاحب أعلى نقاط بنهاية الجولات يفوز.", "cover": "", "href": "games/luck-color/index.html"}, {"id": "bomb", "title": "💣 القنبلة", "desc": "كل جولة تبدأ القنبلة عند لاعب عشوائي ويبدأ العد التنازلي. اللي ماسكها يرميها على لاعب ثاني بكتابة رقمه بالشات، واللي تنفجر عنده يطلع. آخر لاعب يبقى يفوز.", "cover": "", "href": "games/bomb/index.html"}, {"id": "vocab", "title": "🔤 تحدي المفردات", "desc": "فريقين بالتناوب، وكل لاعب بدوره يبدّل حرف واحد من الكلمة بحرف من حروف فريقه ويكتب الكلمة الجديدة بالشات. أول فريق يخلّص حروفه قبل ما يخلص وقته يفوز.", "cover": "", "href": "games/vocab/index.html"}, {"id": "draw", "title": "✏️ شخبليطة", "desc": "الستريمر يكتب كلمة سرية ويرسمها على اللوحة، واللاعبين المنضمين يخمّنونها بالشات. أول تخمين صحيح ياخذ النقاط، وأول من يوصل لنقاط الفوز يكسب.", "cover": "", "href": "games/draw/index.html"}, {"id": "xo", "title": "❌⭕ إكس أو", "desc": "فريقين أو فردي: التحريك يختار لاعبين والقرعة تحدد مين X ومين O، وكل لاعب بدوره يكتب رقم المربع بالشات. فوز بعدد الجولات أو بالإقصاء.", "cover": "", "href": "games/xo/index.html"}, {"id": "fastest-answer", "title": "⚡ أسرع إجابة", "desc": "فريقان، وكل جولة يختار التحريك لاعب من كل فريق وفئة سؤال. أول إجابة صحيحة بالشات تكسب فريقها نقطتين، وأول فريق يوصل لنقاط الفوز يكسب.", "cover": "", "href": "games/fastest-answer/index.html"}, {"id": "memory-challenge", "title": "🧠 تحدي الذاكرة", "desc": "شبكة إيموجيز تظهر لثواني ثم تتغطى، ويطلع سؤال عن مكان إيموجي. اكتب رقم المربع بالشات؛ الغلط يطلع، و10 جولات كحد أقصى أو حتى يبقى لاعب واحد.", "cover": "", "href": "games/memory-challenge/index.html"}, {"id": "snakes-ladders", "title": "🐍 السلم والثعبان", "desc": "لوحة من 1 إلى 100 والكأس في المربع 100. كل لاعب بدوره يكتب دور أو roll بالشات فيرمي النرد، السلم يطلّعه والثعبان ينزّله، وأول من يوصل للكأس يفوز.", "cover": "", "href": "games/snakes-ladders/index.html"}, {"id": "letters-cell", "title": "🐝 خلية الحروف", "desc": "خلية سداسية بها 25 حرفاً من أصل 28 حرفاً عربياً موزعة على فريقين. كل حرف له سؤال وإجابة، والمتابعون يجاوبون بالشات خلال وقت محدد لكل سؤال.", "cover": "letters-cell-cover.png", "href": "games/letters-cell/index.html"}, {"id": "codenames", "title": "🕵️ كود نيمز (Codenames)", "desc": "فريقان (أحمر وأزرق) وسباي ماستر لكل فريق يشوف خريطة الكلمات السرية عبر رابط QR خاص بجواله. يعطي السباي ماستر تلميحًا بكلمة واحدة ورقم، والفريق يخمّن الكلمات.", "cover": "codenames-cover.png", "href": "games/codenames/index.html"}, {"id": "photo-challenge", "title": "🖼️ تحدي الصور (Photo Challenge)", "desc": "فريقان يتنافسان بكلمة مفتاحية منفصلة لكل فريق. كل جولة تظهر صورة تحدي، وأول لاعب يكتب الإجابة الصحيحة بالشات يسجّل نقطة لفريقه.", "cover": "photo-challenge-cover.png", "href": "games/photo-challenge/index.html"}, {"id": "khazna", "title": "🔐 الخزنة (Khazna)", "desc": "كل جولة تدور عجلة وتحدد لاعب مستهدف، وتطلع ساعات مرقّمة من الخزنة. اكتب أرقام الساعات بالترتيب بالشات برسالة وحدة.", "cover": "khazna-cover.png", "href": "games/khazna/index.html"}, {"id": "team-war", "title": "⚔️ حرب الفريقين (Team War)", "desc": "فريقان (أزرق وأحمر) يتنافسان بالنقاط. المشاهدين ينضمون بكومنت مباشر بكلمة فريقهم، وكل لاعب بدوره يكتب رقم مربع بالشات ليفتحه.", "cover": "team-war-cover.png", "href": "games/team-war/index.html"}, {"id": "elimination-roulette", "title": "🎡 روليت الإقصاء (Elimination Roulette)", "desc": "عجلة تدور وتتوقف عند أحد اللاعبين، فيختار رقم لاعب آخر يقصيه من شات البث.", "cover": "elimination-roulette-cover.png", "href": "games/elimination-roulette/index.html"}, {"id": "tribe-roulette", "title": "🏹 روليت مخفي (Hidden Roulette)", "desc": "عجلة تختار لاعباً يدوّر عليه الدور، فتظهر له بطاقات تخفي خلفها بقية اللاعبين — يختار رقم بطاقة من الشات ليقصي من خلفها.", "cover": "tribe-roulette-cover.png", "href": "games/tribe-roulette/index.html"}, {"id": "russian-roulette", "title": "🔫 روليت الروسي (Russian Roulette)", "desc": "عجلة أو بكرة سكرول تختار لاعباً يدوّر عليه الدور، فيختار رقم لاعب آخر من شات البث يستهدفه.", "cover": "russian-roulette-cover.png", "href": "games/russian-roulette/index.html"}, {"id": "fruit-roulette", "title": "🍉 روليت الفواكه (Fruit Roulette)", "desc": "عجلة تدور وتتوقف عند أحد اللاعبين، فيفتح صندوقاً من أربعة بكتابة رقمه في شات البث. ثلاثة صناديق آمنة تحتوي فاكهة، وواحد أو أكثر يخفي مفاجأة.", "cover": "fruit-roulette-cover.png", "href": "games/fruit-roulette/index.html"}, {"id": "musical-chairs", "title": "🎵 الكراسي الموسيقية (Musical Chairs)", "desc": "تدور الأفاتارات حول حلقة الكراسي، وفجأة تتوقف الموسيقى وتظهر أرقام على كل كرسي. أول وحد يكتب الرقم الصحيح يفوز.", "cover": "musical-chairs-cover.png", "href": "games/musical-chairs/index.html"}, {"id": "word-categories", "title": "🔤 اسم و حيوان و نبات و جماد و بلاد", "desc": "حرف عربي عشوائي كل جولة، واللاعبون يكتبون إجاباتهم بشات البث خلال وقت محدد. بعد انتهاء الوقت يراجع المضيف كل إجابة ويقبلها.", "cover": "word-categories-cover.png", "href": "games/word-categories/index.html"}, {"id": "top-ten", "title": "🏆 خمّن العشرة", "desc": "سؤال واحد كل جولة وعشرة صناديق مرتبة من الأهم للأقل أهمية — الصندوق رقم 1 يساوي 10 نقاط وينزل تدريجياً.", "cover": "top-ten-cover.png", "href": "games/top-ten/index.html"}];
  var REAL_HREFS = REAL_GAMES.map(function(g){ return g.href; });

  // بطاقات مكتبة الألعاب — نفس تصميم ملف "مكتبة الألعاب" المعتمد:
  // أيقونة بمربع ملوّن + رقم اللعبة + التصنيف (+ شارة) + الاسم + وصف
  // مختصر + زر "العب الآن" متدرّج، مع أيقونة كبيرة باهتة بالخلفية وإضاءة
  // تتبع الماوس. لون كل بطاقة حسب تصنيفها (hue بنظام oklch).
  // الترتيب نفسه ترتيب REAL_GAMES الحالي بالمنصة.
  var CARD_INFO = {
    'arena':                { name: 'الحلبة', cat: 'c', icon: 'sports_mma', badge: 'جديد', desc: 'قتال بالدور: اكتب كلمة الدخول وادخل الحلبة، والتكبيس يضرب لكمات وكل 50 تكبيسة ركلة.. والدعم يطيّر خصمك، والدونات ضربة قاضية.' },
    'hasila':               { name: 'حصيلة', cat: 'q', icon: 'emoji_events', badge: 'جديد', desc: 'فريقين ولوحة فئات بأسئلة 200 و400 و600.. الفريق صاحب الدور يختار ويجاوب بالشات، وأعلى حصيلة نقاط تفوز.' },
    'lamha':                { name: 'محِك العقول', cat: 'q', icon: 'quiz', badge: 'جديد', desc: 'كل جولة 3 لاعبين، وكل واحد يجاوب سؤاله بالشات.. الصح نقطة، واللي ما تعرفه اكتب «سكب»، والأعلى نقاط يفوز.' },
    'cowboy-duel':          { name: 'بلدة الكاوبوي', cat: 'c', icon: 'target', badge: 'جديد', desc: 'اكتب كلمة الدخول وادخل البلدة، والقرعة توزّع المبارزات.. عند الجرس أول من يكتب الرقم الذهبي بالشات يطلق ويتأهل لين يبقى بطل واحد.' },
    'tug-of-war':           { name: 'شد الحبل', cat: 'c', icon: 'fitness_center', badge: 'جديد', desc: 'كبّس أو اكتب بالشات عشان تسحب الحبل لفريقك، والهدايا تجمّد الخصم وتضاعف القوة.. والفريق اللي يقصي كل الخصم يفوز.' },
    'word-chain':           { name: 'سلسلة الكلمات', cat: 'q', icon: 'link', badge: 'رائج', desc: 'اكتب كلمة من نفس الفئة تبدأ بآخر حرف من الكلمة اللي قبلها، واللي يقفلها على الكل ياخذ 4 نقاط.' },
    'formula-race':         { name: 'فورمولا ون', cat: 'c', icon: 'sports_motorsports', badge: 'جديد', desc: 'سباق ثلاثي الأبعاد: اكتب كلمة الدخول وخذ سيارة، كبّس لتزيد سرعتك وكل 50 تكبيسة نيترو، والدعم يعطيك درع وصاروخ وصاعقة.' },
    'rock-paper-scissors':  { name: 'حجرة ورقة مقص', cat: 'c', icon: 'back_hand', badge: 'جديد', desc: 'بطولة بساحة ثلاثية الأبعاد: اكتب 1 حجرة أو 2 ورقة أو 3 مقص بالشات، والفائز بكل مواجهة يتأهل لين يبقى بطل واحد.' },
    'penalty':              { name: 'بلنتي', cat: 'c', icon: 'sports_soccer', badge: 'رائج', desc: 'العبها في بثك بفريقين من جمهورك، أو ادعُ ستريمر وجمهور كل بث يسدد على مرماه بكتابة رقم الزاوية بالشات.' },
    'mafia':                { name: 'المافيا', cat: 'c', icon: 'theater_comedy', badge: 'جديد', desc: 'العب من جوالك: مافيا وطبيب ومحقق ومواطنين.. بالليل مشاهد ثلاثية الأبعاد على البث، وبالنهار نقاش وتصويت وكروت سرية للمافيا.' },
    'word-hive':            { name: 'كوّن كلمة', cat: 'q', icon: 'hive', badge: 'الأكثر انتشاراً', desc: 'كوّن كلمات من أحرف الخلية بالشات، وكل كلمة لازم فيها حرف الوسط.. أول من يرسلها ياخذ نقاطها.' },
    'greed':                { name: 'الطمع', cat: 'c', icon: 'savings', badge: 'رائج', desc: 'اكتب لف لرقم حظ يُضاف لنقاط دورك، أو توقف لتحفظها.. ورقم 1 يضيّع كل نقاط الدور، وأول من يوصل الهدف يفوز.' },
    'dots':                 { name: 'توصيل النقاط', cat: 'c', icon: 'grid_on', badge: 'رائج', desc: 'وصّل خط بين نقطتين بكتابة رقمين بالشات مثل 2-3، واللي يكمّل مربع ياخذه.. والفريق صاحب المربعات الأكثر يفوز.' },
    'survival-ship':        { name: 'سفينة النجاة', cat: 'q', icon: 'sailing', badge: 'الأكثر انتشاراً', desc: 'حرف وفئة لصاحب الدور، يجاوب بالشات قبل ما يخلص الوقت.. والغلط ينرمي في البحر، وآخر واحد على السفينة يفوز.' },
    'intruder':             { name: 'محطة سهيل', cat: 'c', icon: 'rocket_launch', badge: 'نسخة تجريبية', desc: 'العب من جوالك على محطة فضائية: خلّص مهامك واكشف الامبوستر قبل ما يقضي على المواطنين.' },
    'luck-color':           { name: 'حظ و لون', cat: 'c', icon: 'palette', badge: 'مرحلة اختبار', adminOnly: true, desc: 'القرعة تختار لاعب، يختار لون بالشات ويطلع له تحدي أو مفاجأة.. واشترِ بطاقات من المتجر، وأعلى نقاط يفوز.' },
    'bomb':                 { name: 'القنبلة', cat: 'c', icon: 'local_fire_department', badge: 'رائج', desc: 'القنبلة عند لاعب والوقت يخلص، يرميها على غيره بكتابة رقمه بالشات.. واللي تنفجر عنده يطلع.' },
    'vocab':                { name: 'تحدي المفردات', cat: 'q', icon: 'spellcheck', badge: 'رائج', desc: 'بدّل حرف واحد من الكلمة بحرف من حروف فريقك، وأول فريق يخلّص حروفه يفوز.' },
    'draw':                 { name: 'شخبليطة', cat: 'q', icon: 'brush', badge: 'رائج', desc: 'اكتب كلمة سرية وارسمها، وأول لاعب يخمّنها صح بالشات ياخذ النقاط.' },
    'xo':                   { name: 'إكس أو', cat: 'c', icon: 'grid_3x3', badge: 'رائج', desc: 'لاعبين بالقرعة، X ضد O، وكل واحد بدوره يكتب رقم المربع بالشات.. أول من يكمّل خط يفوز.' },
    'memory-challenge':     { name: 'تحدي الذاكرة', cat: 'c', icon: 'psychology', badge: 'رائج', desc: 'احفظ مكان الإيموجيز، وبعد ما تتغطى اكتب رقم المربع الصحيح بالشات.. الغلط يطلع من اللعبة.' },
    'snakes-ladders':       { name: 'السلم والثعبان', cat: 'c', icon: 'stairs', badge: 'رائج', desc: 'ارمِ النرد بأمر من الشات، اطلع مع السلالم وانتبه للثعابين، وأول من يوصل للكأس يفوز.' },
    'letters-cell':         { name: 'خلية الحروف', cat: 'q', icon: 'hexagon', desc: 'فريقان على خلية الحروف، جاوب سؤال كل حرف بالشات قبل خصمك.' },
    'codenames':            { name: 'كود نيمز', cat: 'q', icon: 'key', badge: 'الأكثر انتشاراً', desc: 'السباي ماستر يلمّح بكلمة ورقم، وفريقه يخمّن الكلمات السرية.' },
    'photo-challenge':      { name: 'تحدي الصور', cat: 'c', icon: 'image_search', badge: 'رائج', desc: 'صورة كل جولة، وأول من يكتب الإجابة يسجّل نقطة لفريقه.' },
    'khazna':               { name: 'الخزنة', cat: 'c', icon: 'lock', badge: 'رائج', desc: 'العجلة تختار لاعب، ويكتب أرقام ساعات الخزنة بالترتيب برسالة وحدة.' },
    'team-war':             { name: 'حرب الفريقين', cat: 'c', icon: 'swords', desc: 'فريق أزرق وفريق أحمر، وكل لاعب بدوره يفتح مربع برقمه من الشات.' },
    'elimination-roulette': { name: 'روليت الإقصاء', cat: 'r', icon: 'person_remove', desc: 'العجلة تختار لاعب، وهو يقصي لاعب ثاني برقمه من الشات.' },
    'tribe-roulette':       { name: 'روليت مخفي', cat: 'r', icon: 'groups', desc: 'العجلة تختار لاعب، واللاعبين مختبين خلف بطاقات.. يختار رقم بطاقة بالشات ويقصي اللي خلفها.' },
    'russian-roulette':     { name: 'الروليت الروسي', cat: 'r', icon: 'casino', desc: 'عجلة أو سكرول يختار لاعب، ويستهدف لاعب ثاني برقمه من الشات.' },
    'fruit-roulette':       { name: 'روليت الفواكه', cat: 'r', icon: 'nutrition', desc: 'العجلة تختار لاعب، لكن بدل ما يقصي غيره يفتح صندوق برقمه بالشات.. الفاكهة تنجّيه، والشخصية الخفية تقصيه هو.' },
    'musical-chairs':       { name: 'الكراسي الموسيقية', cat: 'c', icon: 'chair', desc: 'تتوقف الموسيقى فجأة، وأول من يكتب رقم الكرسي يثبت مكانه.' },
    'word-categories':      { name: 'اسم حيوان نبات جماد بلاد', cat: 'q', icon: 'pets', desc: 'حرف عشوائي كل جولة، واكتب إجاباتك بالشات قبل انتهاء الوقت.' },
    'top-ten':              { name: 'خمّن العشرة', cat: 'q', icon: 'format_list_numbered', badge: 'الأكثر انتشاراً', desc: 'سؤال وعشر إجابات مرتبة، وكل إجابة صحيحة لها نقاطها.' },
    'fastest-answer':       { name: 'أسرع إجابة', cat: 'q', icon: 'bolt', badge: 'الأكثر انتشاراً', desc: 'لاعب من كل فريق وسؤال سريع، وأول إجابة صحيحة بالشات تكسب فريقها النقاط.' },
    'abyss':                { name: 'الهاوية', cat: 'q', icon: 'landscape', badge: 'جديد', desc: 'جسر زجاج فوق الهاوية: جاوب بالشات وشخصيتك تنط على المربع.. والجواب الغلط يكسر الزجاجة ويطيحك.' }
  };
  var CARD_CATS = {
    r: { label: 'روليت', hue: 25 },
    c: { label: 'تحديات', hue: 150 },
    q: { label: 'أسئلة وكلمات', hue: 255 }
  };

  // [آخر التحديثات] سجل تحديثات الألعاب — الأحدث أولاً. كل ما تتعدل لعبة
  // نضيف لها سطر هنا بأعلى القائمة: قسم "آخر التحديثات" فوق الشبكة يعرض
  // آخر 4 تلقائياً، وشارة "تم التحديث" تظهر على بطاقاتها فقط (وتنشال عن
  // الأقدم)، وزر الجرس يضيء بنقطة حمراء لأي تحديث ما شافه المستخدم.
  // isNewGame: لعبة جديدة (مو تحديث) — تطلع بشارة "لعبة جديدة" وتبقى بطاقتها بشارة "جديد".
  var GAME_UPDATES = [
    { id: 'arena', date: '2026-11-17', isNewGame: true, notes: [
      'لعبة قتال جديدة: اكتب كلمة الدخول وادخل الحلبة بالدور، الخاسر يطلع ويدخل اللي بعده ضد الفايز بنفس صحته لين يبقى بطل واحد.',
      'التكبيس يضرب لكمات سريعة وكل 50 تكبيسة ركلة، والهدايا قوى: وردة ضربة قوية، ضربة طائرة، تيك توك يشفي +30، والدونات ضربة قاضية.',
      'شخصيات أنمي بنات وأولاد بأزياء متنوعة، والإطارات وبطاقات الفوز تطلع للي يملكها.'
    ] },
    { id: 'abyss', date: '2026-11-17', notes: [
      'بنك أسئلة جديد: أكثر من 900 سؤال بجغرافيا ولغة وعلوم وثقافة إسلامية وغيرها، وبدون أسئلة حساب أو أرقام.',
      'الإجابة تنقبل بصيغ أكثر: 2 أو 22 أو ٢ أو «رقم 2» أو «اثنين»، عشان ما يضيع جوابك لو تيك توك منع تكرار رسالتك.',
      'طوق النجاة: اللي طاح يرجع للجسر بالهدية اللي يحددها الستريمر، وزر «ابدأ المباراة» بعد اللوبي.'
    ] },
    { id: 'top-ten', date: '2026-11-17', notes: [
      'أسئلة جديدة: 89 سؤال جديد، وصار البنك 209 أسئلة بمواضيع أكثر (محلات، أكلات، أماكن، أسماء، وغيرها).',
      'الأسئلة المتشابهة ما تطلع ورا بعض بنفس المباراة.',
      'سويتش «الدخول التلقائي» بالهيدر للاعبين الجدد أثناء المباراة، مع إشعار صغير لكل لاعب يدخل.'
    ] },
    { id: 'fruit-roulette', date: '2026-11-16', notes: [
      'تصميم جديد كامل بشكل روليت الإقصاء: إعدادات ولوبي وشاشة لعب وشاشة فوز جديدة.',
      'العجلة أو السكرول تختار لاعب، ويفتح صندوق برقمه بالشات: الفاكهة تنجّيه والشخصية الخفية تقصيه هو.',
      'جديد: اللعب التلقائي، الدخول التلقائي للاعبين الجدد، زر إيقاف اللعب، وبطاقات الإقصاء والفوز المملوكة.'
    ] }
  ];
  var RECENT_UPDATES = GAME_UPDATES.slice(0, 4);
  var UPDATED_IDS = RECENT_UPDATES.filter(function(u){ return !u.isNewGame; }).map(function(u){ return u.id; });
  var UPD_SEEN_KEY = 'agp:updates-seen';
  function updKey(u){ return u.id + '@' + u.date; }
  function getSeenUpdates(){
    try { var v = JSON.parse(localStorage.getItem(UPD_SEEN_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
  }
  function unseenUpdates(){
    var seen = getSeenUpdates();
    return RECENT_UPDATES.filter(function(u){ return seen.indexOf(updKey(u)) === -1; });
  }
  function markUpdatesSeen(){
    try { localStorage.setItem(UPD_SEEN_KEY, JSON.stringify(RECENT_UPDATES.map(updKey))); } catch (e) {}
    var bell = document.getElementById('gl-upd-bell');
    if (bell) bell.classList.remove('gl-upd-has');
    Array.prototype.forEach.call(document.querySelectorAll('.gl-upd-card.gl-upd-unseen'), function(c){ c.classList.remove('gl-upd-unseen'); });
  }
  function updTimeAgo(date){
    var d = new Date(date + 'T00:00:00'), now = new Date();
    var days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - d) / 86400000);
    if (days <= 0) return 'اليوم';
    if (days === 1) return 'أمس';
    if (days === 2) return 'قبل يومين';
    if (days <= 10) return 'قبل ' + days + ' أيام';
    if (days < 30) return 'قبل ' + Math.round(days / 7) + ' أسابيع';
    return d.toLocaleDateString('ar', { day: 'numeric', month: 'long' });
  }

  // [قيد فتح الألعاب] اللعب يحتاج: حساب ستريمر مسجَّل (اختاره بالتسجيل أو
  // حوّله الأدمن) + حساب تيك توك موثَّق عليه (الأدمن مستثنى). زر "العب الآن" يظهر مطفي،
  // والضغط عليه يشرح السبب مع زر للخطوة المطلوبة. (القيد الفعلي على
  // الاتصال بالبث نفسه بالخادم: ws-server.js checkStreamConnectAllowed.)
  function getGameAccessBlock(){
    var auth = window.AGPAuth;
    if (!auth || !auth.getToken || !auth.getToken()) return 'login';
    var user = auth.getCachedUser ? auth.getCachedUser() : null;
    if (auth.canPlayGames && auth.canPlayGames(user)) return null;
    // اشتراك منتهي (بعد بدء القفل 1 ديسمبر) لحساب مستوفي باقي الشروط
    if (auth.hasSubscriptionAccess && !auth.hasSubscriptionAccess(user) && user &&
        ((user.permissions && user.permissions.full_game_access) ||
         (auth.isStreamerAccount && auth.isStreamerAccount(user) && (user.tiktok_verified || user.kick_verified || user.twitch_verified)))) return 'subscription';
    if (auth.isStreamerAccount && !auth.isStreamerAccount(user)) return 'not_streamer';
    return 'tiktok';
  }
  // لعبة بمرحلة اختبار (adminOnly بـCARD_INFO): تفتح لحساب الأدمن فقط.
  // (القيد الفعلي بالخادم: backend/station/station-server.js ADMIN_ONLY.)
  function isAdminUser(){
    var auth = window.AGPAuth, u = auth && auth.getCachedUser ? auth.getCachedUser() : null;
    return Boolean(u && u.role === 'admin');
  }
  // لعبة بمرحلة اختبار (adminOnly): تفتح للأدمن، ولأي حساب عنده صلاحية اختبارها (testPerm بالبطاقة، مثل arena_tester من لوحة الأدمن)
  function canTest(perm){
    if (isAdminUser()) return true;
    var auth = window.AGPAuth, u = auth && auth.getCachedUser ? auth.getCachedUser() : null;
    return Boolean(perm && u && u.permissions && u.permissions[perm]);
  }
  function applyGameLock(card){
    var testing = card.classList.contains('gl-admin') && !canTest(card.dataset.testPerm);
    var play = card.querySelector('.gl-play');
    if (play && card.classList.contains('gl-admin')) play.firstChild.textContent = testing ? 'مرحلة اختبار' : 'العب الآن';
    var locked = testing || card.classList.contains('gl-maint') || Boolean(getGameAccessBlock());
    card.classList.toggle('gl-locked', locked);
    var icon = card.querySelector('.gl-play .gl-ms');
    if (icon) icon.textContent = locked ? 'lock' : 'arrow_back';
  }
  function refreshGameLocks(){
    Array.prototype.forEach.call(document.querySelectorAll('.gl-card'), applyGameLock);
  }
  function closeGameLockModal(){
    var m = document.getElementById('gl-lock-modal');
    if (m) m.remove();
  }
  function showGameLockModal(reason){
    closeGameLockModal();
    var user = window.AGPAuth && window.AGPAuth.getCachedUser ? window.AGPAuth.getCachedUser() : null;
    var profileHref = user && user.custom_id ? 'profile.html?id=' + encodeURIComponent(user.custom_id) : 'profile.html';
    var msg, btnLabel, btnHref;
    if (reason === 'soon') {
      msg = 'هذي اللعبة بتنزل خلال دقايق إن شاء الله، ترقّبوها!';
    } else if (reason === 'redesign') {
      msg = 'هذي اللعبة مقفلة حالياً لإعادة تصميمها، وبترجع بشكل جديد قريب إن شاء الله.';
    } else if (reason === 'fixing') {
      msg = 'هذي اللعبة مقفلة حالياً للإصلاح، وبترجع قريب إن شاء الله.';
    } else if (reason === 'maintenance') {
      msg = 'هذي اللعبة تحت الصيانة حالياً، وبترجع قريب إن شاء الله.';
    } else if (reason === 'testing') {
      msg = 'هذي اللعبة بمرحلة اختبار ومتاحة حالياً لحساب الأدمن فقط، وبتنفتح للكل قريب إن شاء الله.';
    } else if (reason === 'login') {
      msg = 'لازم تسجّل دخول وتربط حساب تيك توك أو كيك بحسابك عشان تفتح الألعاب.';
      btnLabel = 'تسجيل الدخول'; btnHref = 'login.html?next=games.html';
    } else if (reason === 'subscription') {
      msg = 'اشتراكك منتهي أو ما عندك اشتراك. فعّل كود الاشتراك أو اشترك من قسم «الاشتراك» بحسابك عشان تفتح الألعاب.';
      btnLabel = 'الاشتراك'; btnHref = profileHref + '#subscription';
    } else if (reason === 'not_streamer') {
      msg = 'تشغيل الألعاب لحسابات الستريمر فقط — حسابك حساب لاعب. تواصل مع الإدارة لتحويله لحساب ستريمر.';
      btnLabel = 'تواصل معنا'; btnHref = 'support.html';
    } else {
      msg = 'لازم تربط حساب تيك توك أو كيك بحسابك عشان تفتح الألعاب.';
      btnLabel = 'اربط حسابك'; btnHref = profileHref;
    }
    var m = document.createElement('div');
    m.id = 'gl-lock-modal';
    m.className = 'gl-lock';
    m.setAttribute('role', 'dialog');
    m.setAttribute('aria-modal', 'true');
    m.setAttribute('aria-labelledby', 'gl-lock-msg');
    m.innerHTML =
      '<div class="gl-lock-box">' +
        '<span class="gl-lock-ic" aria-hidden="true"><svg viewBox="0 0 256 256" fill="currentColor"><path d="M208,88H48a8,8,0,0,0-8,8V208a8,8,0,0,0,8,8H208a8,8,0,0,0,8-8V96A8,8,0,0,0,208,88Z" opacity=".2"/><path d="M208,80H176V56a48,48,0,0,0-96,0V80H48A16,16,0,0,0,32,96V208a16,16,0,0,0,16,16H208a16,16,0,0,0,16-16V96A16,16,0,0,0,208,80ZM96,56a32,32,0,0,1,64,0V80H96ZM208,208H48V96H208V208Z"/></svg></span>' +
        '<p data-gl-lock-msg id="gl-lock-msg"></p>' +
        '<a class="btn btn-primary" data-gl-lock-go></a>' +
        '<button type="button" class="btn btn-secondary" data-gl-lock-close>إغلاق</button>' +
      '</div>';
    m.querySelector('[data-gl-lock-msg]').textContent = msg;
    var go = m.querySelector('[data-gl-lock-go]');
    if (btnHref) { go.textContent = btnLabel; go.setAttribute('href', btnHref); } else go.remove();
    if (reason === 'login' && window.AGPSite) go.addEventListener('click', function(e){ e.preventDefault(); closeGameLockModal(); window.AGPSite.openAuth(); });
    m.querySelector('[data-gl-lock-close]').addEventListener('click', closeGameLockModal);
    m.addEventListener('click', function(e){ if (e.target === m) closeGameLockModal(); });
    document.body.appendChild(m);
  }

  // مستمع واحد (capture) على الصفحة: يلتقط الضغط على أي بطاقة حتى لو
  // انعاد بناؤها، ويمنع فتح اللعبة قبل أي مستمع آخر.
  document.addEventListener('click', function(e){
    var card = e.target && e.target.closest ? e.target.closest('.gl-card') : null;
    if (!card) return;
    var block = card.classList.contains('gl-soon') ? 'soon' : card.classList.contains('gl-redesign') ? 'redesign' : card.classList.contains('gl-fixing') ? 'fixing' : card.classList.contains('gl-maint') ? 'maintenance' : (card.classList.contains('gl-admin') && !canTest(card.dataset.testPerm)) ? 'testing' : getGameAccessBlock();
    if (!block) return;
    e.preventDefault();
    e.stopPropagation();
    showGameLockModal(block);
  }, true);
  document.addEventListener('keydown', function(e){ if (e.key === 'Escape') closeGameLockModal(); });
  // صفحة لعبة رجّعت المستخدم هنا لأنه غير مسموح له (auth/game-access-guard.js) — نعرض سبب القفل
  (function(){
    var m = /[?&]locked=(login|not_streamer|tiktok|testing|subscription)\b/.exec(window.location.search);
    if (!m) return;
    // بعد ما يكتمل بناء الصفحة (القالب يعيد رسم المحتوى) — ننتظر ظهور بطاقات الألعاب
    var tries = 0;
    var show = function(){ if (document.querySelector('.gl-card') || ++tries > 60) showGameLockModal(m[1]); else setTimeout(show, 150); };
    show();
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.hash);
  })();
  // الحالة الفعلية (توثيق تيك توك) تجي من الخادم عبر refreshUser —
  // نحدّث الأقفال لما تتغير البيانات المحفوظة (هنا أو من تبويب ثاني).
  if (window.AGPAuth && window.AGPAuth.refreshUser) window.AGPAuth.refreshUser().then(refreshGameLocks);
  window.addEventListener('storage', function(e){ if (e.key === 'agp_auth_token' || e.key === 'agp_auth_user') refreshGameLocks(); });

  function buildCard(g, i){
    var info = CARD_INFO[g.id] || { name: g.title, cat: 'c', icon: 'sports_esports', desc: g.desc };
    var cat = CARD_CATS[info.cat];
    // شارة "تم التحديث" محسوبة من GAME_UPDATES (آخر 4) — تحل محل "جديد"/"رائج"/"الأكثر انتشاراً"
    // بس ما تغطي شارات الحالة (صيانة / تجريبية / مرحلة اختبار).
    var badge = info.badge;
    if (UPDATED_IDS.indexOf(g.id) !== -1 && (!badge || ['جديد', 'رائج', 'الأكثر انتشاراً'].indexOf(badge) !== -1)) badge = 'تم التحديث';
    var card = document.createElement('article');
    card.className = 'gl-card' + (info.maintenance || info.redesign || info.soon || info.fixing ? ' gl-maint' : '') + (info.redesign ? ' gl-redesign' : '') + (info.fixing ? ' gl-fixing' : '') + (info.soon ? ' gl-soon' : '') + (info.adminOnly ? ' gl-admin' : '');
    if (info.testPerm) card.dataset.testPerm = info.testPerm;
    // لون البطاقة من هوية ألعاب أيمن (بنفسجي ثابت بالـCSS)، ولون التصنيف
    // يظهر بس على شارة التصنيف.
    card.style.setProperty('--cat-hue', cat.hue);
    card.dataset.cat = info.cat;
    card.dataset.search = norm(info.name + ' ' + info.desc + ' ' + cat.label);
    card.innerHTML =
      '<span class="gl-glow"></span>' +
      '<span class="gl-bgicon gl-ms">' + info.icon + '</span>' +
      '<div class="gl-top"><span class="gl-tile"><span class="gl-ms">' + info.icon + '</span></span>' +
      '<span class="gl-num" dir="ltr">' + (i + 1 < 10 ? '0' : '') + (i + 1) + '</span></div>' +
      '<div class="gl-meta"><span class="gl-cat">' + cat.label + '</span>' +
      (badge ? '<span class="gl-badge' + (badge === 'تم التحديث' ? ' gl-badge-upd' : '') + '">' + badge + '</span>' : '') + '</div>' +
      '<h3 class="gl-title"></h3><p class="gl-desc"></p>' +
      '<a class="gl-play" href="' + g.href + '">العب الآن<span class="gl-ms">arrow_back</span></a>';
    card.querySelector('.gl-title').textContent = info.name;
    card.querySelector('.gl-desc').textContent = info.desc;
    // لعبة تحت الصيانة: الزر مقفول دائماً، والضغط يعرض نافذة الصيانة (مستمع الـcapture أعلاه)
    if (info.maintenance) card.querySelector('.gl-play').firstChild.textContent = 'تحت الصيانة';
    // لعبة مقفلة لإعادة التصميم (redesign بـCARD_INFO): نفس قفل الصيانة بنص مختلف
    if (info.redesign) card.querySelector('.gl-play').firstChild.textContent = 'إعادة تصميم';
    // لعبة جاهزة بتنزل قريب (soon بـCARD_INFO): نفس قفل الصيانة بنص «دقايق وتنزل»
    if (info.soon) card.querySelector('.gl-play').firstChild.textContent = 'دقايق وتنزل';
    // لعبة مقفلة للإصلاح (fixing بـCARD_INFO): نفس قفل الصيانة بنص «إصلاح»
    if (info.fixing) card.querySelector('.gl-play').firstChild.textContent = 'إصلاح';
    applyGameLock(card);
    card.addEventListener('click', function(e){
      if (e.target.closest('a') || card.classList.contains('gl-maint') || (card.classList.contains('gl-admin') && !canTest(card.dataset.testPerm)) || getGameAccessBlock()) return;
      window.location.href = g.href;
    });
    return card;
  }


  /* ---------- الشبكة والتصنيفات والبحث ---------- */
  var grid = $('#lib-grid');
  var CATS = [['all', 'كل الألعاب'], ['r', CARD_CATS.r.label], ['q', CARD_CATS.q.label], ['c', CARD_CATS.c.label]];
  var cat = 'all', query = '';
  function counts(){
    var n = { all: REAL_GAMES.length, r: 0, q: 0, c: 0 };
    REAL_GAMES.forEach(function(g){ var i = CARD_INFO[g.id]; n[i ? i.cat : 'c']++; });
    return n;
  }
  function renderCats(){
    var n = counts(), box = $('#lib-cats');
    if (!box) return;
    box.innerHTML = CATS.map(function(c){
      return '<button class="lib-cat" role="tab" type="button" data-cat="' + c[0] + '" aria-selected="' + (c[0] === cat) + '">' + c[1] + '<small class="num">' + n[c[0]] + '</small></button>';
    }).join('');
  }
  function filter(){
    var q = norm(query.trim()), shown = 0;
    Array.prototype.forEach.call(grid.querySelectorAll('.gl-card'), function(card){
      var on = (cat === 'all' || card.dataset.cat === cat) && (!q || card.dataset.search.indexOf(q) > -1);
      card.hidden = !on;
      if (on) { card.style.setProperty('--i', Math.min(shown, 16)); shown++; }
    });
    $('#gl-n').textContent = shown;
    $('#lib-empty').hidden = shown > 0;
  }
  function render(){
    grid.innerHTML = '';
    REAL_GAMES.forEach(function(g, i){ grid.appendChild(buildCard(g, i)); });
    filter();
  }
  if (grid) {
    render();
    renderCats();
    $('#lib-cats').addEventListener('click', function(e){
      var b = e.target.closest('.lib-cat');
      if (!b) return;
      cat = b.dataset.cat;
      Array.prototype.forEach.call(this.children, function(x){ x.setAttribute('aria-selected', String(x === b)); });
      b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' });
      filter();
    });
    $('#gl-q').addEventListener('input', function(){ query = this.value; filter(); });
    grid.addEventListener('pointermove', function(e){
      var c = e.target.closest('.gl-card');
      if (!c) return;
      var r = c.getBoundingClientRect();
      c.style.setProperty('--x', (e.clientX - r.left) + 'px');
      c.style.setProperty('--y', (e.clientY - r.top) + 'px');
    });
  }

  /* ---------- آخر التحديثات: نفس GAME_UPDATES، ينفتح من زره ---------- */
  var updBtn = $('#upd-btn'), updWrap = $('#upd-wrap'), updDot = $('#upd-dot'), updList = $('#upd-list');
  function esc(t){ return String(t == null ? '' : t).replace(/[&<>"']/g, function(c){ return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function paintUpdDot(){
    if (!updDot) return;
    var n = unseenUpdates().length;
    updDot.hidden = !n;
    updDot.textContent = n;
    updBtn.classList.toggle('has', !!n);
  }
  function renderUpdates(){
    var un = unseenUpdates().map(updKey);
    updList.innerHTML = RECENT_UPDATES.map(function(u, i){
      var g = REAL_GAMES.filter(function(x){ return x.id === u.id; })[0], info = CARD_INFO[u.id];
      if (!g || !info) return '';
      var c = CARD_CATS[info.cat];
      return '<article class="gl-upd-card' + (i === 0 ? ' gl-upd-top' : '') + (un.indexOf(updKey(u)) > -1 ? ' gl-upd-unseen' : '') + '" style="--hue:' + c.hue + ';--i:' + i + '">' +
        '<span class="gl-upd-bg gl-ms" aria-hidden="true">' + info.icon + '</span><div class="gl-upd-top-row"><span class="gl-tile"><span class="gl-ms" aria-hidden="true">' + info.icon + '</span></span>' +
        '<div><h3 class="gl-upd-name">' + esc(info.name) + '</h3><div class="gl-upd-meta"><b>' + esc(c.label) + '</b><span class="gl-ms" aria-hidden="true">schedule</span><span>' + esc(updTimeAgo(u.date)) + '</span></div></div>' +
        '<div class="gl-upd-chips"><span class="gl-upd-chip">' + (u.isNewGame ? 'لعبة جديدة' : i === 0 ? 'الأحدث' : 'تحديث') + '</span><span class="gl-upd-new">جديد عليك</span></div></div>' +
        '<ul class="gl-upd-notes">' + u.notes.slice(0, 2).map(function(n){ return '<li><span class="gl-ms" aria-hidden="true">check_circle</span><span>' + esc(n) + '</span></li>'; }).join('') + '</ul>' +
        '<a class="gl-upd-play" href="' + esc(g.href) + '" data-upd-play="' + esc(u.id) + '">جربها الآن<span class="gl-ms" aria-hidden="true">arrow_back</span></a></article>';
    }).join('');
  }
  if (updBtn && updWrap) {
    paintUpdDot();
    updBtn.addEventListener('click', function(){
      var open = !updWrap.classList.contains('open');
      if (open) { renderUpdates(); markUpdatesSeen(); paintUpdDot(); }
      updWrap.classList.toggle('open', open);
      updBtn.setAttribute('aria-expanded', String(open));
    });
    // نفس قيود فتح الألعاب على زر «جربها الآن»
    updList.addEventListener('click', function(e){
      var a = e.target.closest('[data-upd-play]');
      if (!a) return;
      var info = CARD_INFO[a.dataset.updPlay] || {};
      var block = info.soon ? 'soon' : info.redesign ? 'redesign' : info.fixing ? 'fixing' : info.maintenance ? 'maintenance' : (info.adminOnly && !canTest(info.testPerm)) ? 'testing' : getGameAccessBlock();
      if (!block) return;
      e.preventDefault();
      showGameLockModal(block);
    });
  }
})();
