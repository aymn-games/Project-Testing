/**
 * ==========================================================================
 *  AGP GAME: اسم و حيوان و نبات و جماد و بلاد (Word Categories)
 * ==========================================================================
 * لعبة "Native" مستقلة تماماً (بنفس نمط games/fruit-roulette): صفحتها
 * الخاصة تحمّل AGP Core + js/agp-game-shell.js كاملَين، ثم هذا الملف
 * يسجّل اللعبة ويدير كامل منطقها. لا اعتماد على أي ملف يخص لعبة أخرى،
 * ولا أي تعديل على أي ملف مشترك (js/agp-*.js) — كل التخصيص يتم حصراً
 * عبر حقن CSS/DOM وقت التشغيل من هذا الملف.
 *
 * ⚠️ فكرة اللعبة: حرف عربي عشوائي كل جولة، اللاعبون يكتبون إجاباتهم
 * (اسم/حيوان/نبات/جماد/بلاد — حسب الفئات المفعَّلة) بشات البث خلال وقت
 * محدد، ثم يراجع المضيف كل إجابة (قبول/رفض) ويُحتسب لكل لاعب نقطة واحدة
 * عن كل فئة مقبولة. الفوز إما بالوصول لنقاط مستهدفة أو بعد عدد جولات
 * محدد (اختيار المضيف من الإعدادات).
 *
 * ⚠️ [تحديث بعد المراجعة] الفئات المفعَّلة لم تعد جزءاً من شاشة الإعدادات
 * المشتركة (js/agp-game-shell.js) — صارت عناصر تحكم حيّة داخل لوحة تحكم
 * اللعبة نفسها (خمس فئات + "الكل")، يقدر المضيف يغيّرها أي وقت أثناء
 * المباراة مباشرة بدون فتح أي شاشة إعدادات، وتُطبَّق من الجولة القادمة.
 * نفس الشيء لاستبعاد الحروف الصعبة — صار سلوكاً تلقائياً دائماً بدل خيار.
 *
 * ⚠️ بروتوكول الإجابة بالشات: يكتب اللاعب إجاباته مفصولة بفواصل (, أو ،)
 * بنفس ترتيب الفئات المفعَّلة المعروض بالشاشة. فئة واحدة فقط مفعَّلة؟
 * الرسالة كاملة تُقرأ كإجابة واحدة (بدون تقسيم). كل رسالة جديدة من نفس
 * اللاعب تستبدل إجابته السابقة لنفس الجولة.
 *
 * ⚠️ الإجابات تُقبل فقط من لاعبين منضمّين فعلاً للوبي. لا لوبي مصغّر
 * لإضافة لاعبين منتصف المباراة بهذي اللعبة (نفس حدود روليت الفواكه).
 *
 * يعتمد على: js/agp-core.js وكل ملفات AGP Core، js/agp-game-shell.js،
 * js/agp-player-card.js، auth/auth-client.js (window.AGPAuth — نقاط
 * منصة حقيقية للفائز فقط، نفس نمط روليت الفواكه بالضبط).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.gameManager || !AGP.gameShell) {
        console.error('[Word Categories] AGP Core / Game Shell not loaded yet.');
        return;
    }

    var GAME_ID = 'word-categories';
    var GAME_NAME = 'اسم و حيوان و نبات و جماد و بلاد';

    var CATEGORIES = [
        { key: 'name', label: 'اسم', emoji: '👤' },
        { key: 'animal', label: 'حيوان', emoji: '🐾' },
        { key: 'plant', label: 'نبات', emoji: '🌿' },
        { key: 'object', label: 'جماد', emoji: '📦' },
        { key: 'country', label: 'بلاد', emoji: '🌍' }
    ];

    var LETTERS_ALL = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش',
        'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
    /* استبعاد الحروف الصعبة صار سلوكاً تلقائياً دائماً (بدون خيار بشاشة
       الإعدادات) — طلب صريح بعد المراجعة. */
    var HARD_LETTERS = ['ث', 'ذ', 'ض', 'ظ'];

    var WIN_MODE_POINTS = 'points';
    var WIN_MODE_ROUNDS = 'rounds';

    /* ============ حالة اللعبة (تُصفَّر عند onDestroy/newGame) ============ */
    var _state = 'idle'; // 'idle' | 'collecting' | 'reviewing'
    var _roundNumber = 0;
    var _currentLetter = '';
    var _lastLetter = '';
    var _usedLettersThisMatch = []; // كل الحروف اللي طلعت هالمباراة — يتجنّبها الاختيار العشوائي قدر الإمكان
    var _activeCategoriesThisRound = [];
    var _roundDurationSeconds = 45;
    var _timeRemaining = 0;
    var _timerInterval = null;
    var _letterFlickerInterval = null;
    var _submissions = {}; // playerId -> { player, categories: {key: text}, updatedAt }
    var _submissionOrder = []; // ترتيب ثابت لعرض المراجعة — نفس ترتيب وصول أول إجابة لكل لاعب
    var _reviewState = {}; // playerId -> { key: boolean } — الافتراضي false (غير مقبولة) لكل الخانات
    var _duplicateWeights = {}; // playerId -> { key: 1 | 0.5 } — وزن كل إجابة حسب التكرار (راجع computeDuplicateWeights)
    var _commentUnsub = null;
    var _playerRemovedUnsub = null;
    var _matchActive = false;
    var _matchStartedAt = 0;

    /* فئات مفعَّلة حيّة — تحكّم كامل من لوحة تحكم اللعبة نفسها (لا علاقة
       لها بشاشة الإعدادات المشتركة إطلاقاً بعد الآن). */
    var _selectedCategories = {};
    CATEGORIES.forEach(function (c) { _selectedCategories[c.key] = true; });

    /* ============ عناصر الصفحة ============ */
    var wcGameRoot, wcLayout, wcRoundVal, wcFormatHelpBtn, wcFormatHelpPanel, wcCategorySelector, wcLeaderboardList, wcStartBtn, wcSkipLetterBtn, wcEndTimerBtn,
        wcStageIdle, wcStageCollecting, wcLetterBadge, wcTimerBarFill, wcTimerVal,
        wcInstructionsHint, wcParticipantsCount,
        wcReviewFullscreen, wcReviewRoundLabel, wcReviewSubmittedCount, wcReviewList, wcReviewEmpty, wcConfirmBtn,
        wcToastWrap, wcLiveRegion, wcWinnerOverlay, wcWinnerAvatarWrap, wcWinnerName,
        wcWinnerScoreText, wcWinnerPointsText, wcLastPlaceCard, wcLastPlaceAvatarWrap, wcLastPlaceName,
        wcLastPlaceScoreText, wcWinnerHomeBtn, wcNewGameBtn, wcRematchBtn;

    function cacheDom() {
        wcGameRoot = document.getElementById('wcGameRoot');
        wcLayout = document.getElementById('wcLayout');
        wcRoundVal = document.getElementById('wcRoundVal');
        wcFormatHelpBtn = document.getElementById('wcFormatHelpBtn');
        wcFormatHelpPanel = document.getElementById('wcFormatHelpPanel');
        wcCategorySelector = document.getElementById('wcCategorySelector');
        wcLeaderboardList = document.getElementById('wcLeaderboardList');
        wcStartBtn = document.getElementById('wcStartBtn');
        wcEndTimerBtn = document.getElementById('wcEndTimerBtn');
        wcSkipLetterBtn = document.getElementById('wcSkipLetterBtn');
        wcStageIdle = document.getElementById('wcStageIdle');
        wcStageCollecting = document.getElementById('wcStageCollecting');
        wcLetterBadge = document.getElementById('wcLetterBadge');
        wcTimerBarFill = document.getElementById('wcTimerBarFill');
        wcTimerVal = document.getElementById('wcTimerVal');
        wcInstructionsHint = document.getElementById('wcInstructionsHint');
        wcParticipantsCount = document.getElementById('wcParticipantsCount');
        wcReviewFullscreen = document.getElementById('wcReviewFullscreen');
        wcReviewRoundLabel = document.getElementById('wcReviewRoundLabel');
        wcReviewSubmittedCount = document.getElementById('wcReviewSubmittedCount');
        wcReviewList = document.getElementById('wcReviewList');
        wcReviewEmpty = document.getElementById('wcReviewEmpty');
        wcConfirmBtn = document.getElementById('wcConfirmBtn');
        wcToastWrap = document.getElementById('wcToastWrap');
        wcLiveRegion = document.getElementById('wcLiveRegion');
        wcWinnerOverlay = document.getElementById('wcWinnerOverlay');
        wcWinnerAvatarWrap = document.getElementById('wcWinnerAvatarWrap');
        wcWinnerName = document.getElementById('wcWinnerName');
        wcWinnerScoreText = document.getElementById('wcWinnerScoreText');
        wcWinnerPointsText = document.getElementById('wcWinnerPointsText');
        wcLastPlaceCard = document.getElementById('wcLastPlaceCard');
        wcLastPlaceAvatarWrap = document.getElementById('wcLastPlaceAvatarWrap');
        wcLastPlaceName = document.getElementById('wcLastPlaceName');
        wcLastPlaceScoreText = document.getElementById('wcLastPlaceScoreText');
        wcWinnerHomeBtn = document.getElementById('wcWinnerHomeBtn');
        wcNewGameBtn = document.getElementById('wcNewGameBtn');
        wcRematchBtn = document.getElementById('wcRematchBtn');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text == null ? '' : String(text);
        return div.innerHTML;
    }

    function showToast(msg) {
        if (!wcToastWrap) return;
        var t = document.createElement('div');
        t.className = 'wc-toast';
        t.textContent = msg;
        wcToastWrap.appendChild(t);
        requestAnimationFrame(function () { t.classList.add('show'); });
        setTimeout(function () {
            t.classList.remove('show');
            setTimeout(function () { t.remove(); }, 300);
        }, 3200);
    }

    function playerLabel(player) {
        return (player && (player.name || player.id)) || '—';
    }

    /* ==========================================================================
       محدِّد الفئات الحي — عناصر تحكم داخل لوحة تحكم اللعبة نفسها (لا علاقة
       لها بشاشة الإعدادات المشتركة). كل ضغطة تبدّل حالة فئة واحدة فوراً؛
       زر "الكل" يفعّل الخمس دفعة وحدة. القيمة الحالية تُقرأ مباشرة عند بدء
       كل جولة (activeCategoriesSelected) — يعني التعديل يُطبَّق من الجولة
       القادمة تلقائياً، حتى لو تغيّر أثناء جولة شغّالة.
       ========================================================================== */
    function renderCategorySelector() {
        if (!wcCategorySelector) return;
        var buttonsHtml = CATEGORIES.map(function (cat) {
            var active = _selectedCategories[cat.key];
            return '<button type="button" class="wc-cat-toggle' + (active ? ' wc-cat-toggle-active' : '') +
                '" data-cat-key="' + cat.key + '">' + cat.emoji + ' ' + cat.label + '</button>';
        }).join('');
        wcCategorySelector.innerHTML = buttonsHtml +
            '<button type="button" class="wc-cat-toggle wc-cat-toggle-all" id="wcCatSelectAllBtn">✅ الكل</button>';

        wcCategorySelector.querySelectorAll('.wc-cat-toggle[data-cat-key]').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var key = btn.getAttribute('data-cat-key');
                _selectedCategories[key] = !_selectedCategories[key];
                renderCategorySelector();
            });
        });
        var allBtn = document.getElementById('wcCatSelectAllBtn');
        if (allBtn) {
            allBtn.addEventListener('click', function () {
                CATEGORIES.forEach(function (c) { _selectedCategories[c.key] = true; });
                renderCategorySelector();
            });
        }
    }

    function activeCategoriesSelected() {
        return CATEGORIES.filter(function (cat) { return Boolean(_selectedCategories[cat.key]); });
    }

    /* ============ اختيار حرف عشوائي — يستبعد الحروف الصعبة دائماً
       (سلوك تلقائي ثابت)، ويتجنّب أي حرف طلع سابقاً بنفس المباراة (مو
       بس آخر جولة) قدر الإمكان — لو كل الحروف المتاحة سبق استخدامها،
       يرجع يسمح بالتكرار بدل ما يعلّق. ============ */
    function pickRandomLetter() {
        var basePool = LETTERS_ALL.filter(function (l) { return HARD_LETTERS.indexOf(l) === -1; });
        if (basePool.length === 0) basePool = LETTERS_ALL.slice();

        var freshPool = basePool.filter(function (l) { return _usedLettersThisMatch.indexOf(l) === -1; });
        var pool = freshPool.length > 0 ? freshPool : basePool;

        var letter;
        var guard = 0;
        do {
            letter = pool[Math.floor(Math.random() * pool.length)];
            guard++;
        } while (pool.length > 1 && letter === _lastLetter && guard < 20);

        _lastLetter = letter;
        _usedLettersThisMatch.push(letter);
        return letter;
    }

    /* ============ تفسير رسالة شات وارِدة إلى كائن {categoryKey: نص} ============
       ⚠️ [تحديث بعد المراجعة] الفواصل المقبولة بين الإجابات صارت: فاصلة
       (، أو ,) أو شرطة (-) أو كلمة "و" لوحدها (لازم مسافة قبلها وبعدها
       حتى ما تنقطع كلمة تبدأ فعلياً بحرف و مثل "وردة" أو "واحة"). لو ما
       فيه أي فاصل صريح بالرسالة، يرجع يفصل بالمسافات العادية كالسابق. */
    function parseAnswerText(rawText, activeCats) {
        if (typeof rawText !== 'string') return null;
        var raw = rawText.trim();
        if (!raw) return null;

        var result = {};
        if (activeCats.length === 1) {
            result[activeCats[0].key] = raw;
            return result;
        }

        var SEPARATOR_RE = /\s*[،,\-]\s*|\s+و\s+/;
        var hasExplicitSeparator = SEPARATOR_RE.test(raw);
        var parts = hasExplicitSeparator ? raw.split(SEPARATOR_RE) : raw.split(/\s+/);
        parts = parts.map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });

        activeCats.forEach(function (cat, i) {
            result[cat.key] = parts[i] || '';
        });
        return result;
    }

    /* تطبيع بسيط للمقارنة بين إجابتين (اكتشاف التكرار) — تريم + مسافات
       داخلية مفردة + تحويل الأحرف اللاتينية لحروف صغيرة. لا يلمس الإجابة
       الأصلية المعروضة، يُستخدَم فقط للمقارنة الداخلية. */
    function normalizeAnswerForCompare(word) {
        return String(word || '').trim().replace(/\s+/g, ' ').toLowerCase();
    }

    function renderInstructionsHint(activeCats) {
        if (!wcInstructionsHint) return;
        if (activeCats.length === 1) {
            wcInstructionsHint.textContent = 'اكتبوا بالشات: - ثم كلمة "' + activeCats[0].label + '" تبدأ بحرف "' + _currentLetter + '"';
        } else {
            var order = activeCats.map(function (c) { return c.label; }).join('، ');
            wcInstructionsHint.textContent = 'اكتبوا بالشات: - ثم إجاباتكم مفصولة بفاصلة أو شرطة أو كلمة "و"، بهذا الترتيب: ' + order + ' — كلها تبدأ بحرف "' + _currentLetter + '"';
        }
    }

    /* ==========================================================================
       لوحة الصدارة — من AGP.scoreManager (سجل نقاط عام مشترك).
       ========================================================================== */
    function renderLeaderboard() {
        if (!wcLeaderboardList) return;
        var leaderboard = AGP.scoreManager.getLeaderboard();
        if (leaderboard.length === 0) {
            wcLeaderboardList.innerHTML = '<li class="wc-leaderboard-empty">ما فيه نقاط بعد</li>';
            return;
        }
        var players = AGP.gameManager.getPlayers();
        wcLeaderboardList.innerHTML = leaderboard.map(function (row, i) {
            var player = players.filter(function (p) { return p.id === row.playerId; })[0];
            return '<li><span class="wc-leaderboard-rank">' + (i + 1) + '</span>' +
                '<span class="wc-leaderboard-name">' + escapeHtml(playerLabel(player) || row.playerId) + '</span>' +
                '<span class="wc-leaderboard-score">' + formatScore(row.score) + '</span></li>';
        }).join('');
    }

    function updateStartButtonLabel() {
        if (!wcStartBtn) return;
        wcStartBtn.textContent = _roundNumber === 0 ? '🎲 بدء الجولة' : '🎲 بدء الجولة التالية';
    }

    /* ==========================================================================
       التحكم بالمراحل المرئية الثلاث — ⚠️ [إصلاح خلل حقيقي] الإصدار
       السابق كان يستخدم فقط خاصية hidden، لكن قواعد CSS بهذا الملف كانت
       تفرض display صريح (flex/grid) على نفس العناصر بتخصيص أعلى من قاعدة
       المتصفح الافتراضية لـ[hidden]، فتبقى ظاهرة رغم hidden=true (هذا
       بالضبط سبب ظهور مراجعة الجولة تحت الحرف والمؤقّت وقت الجمع). الحل:
       قاعدة CSS صريحة `[hidden]{display:none!important}` تكسر أي تعارض
       تخصيص نهائياً (راجع style.css) — بالإضافة لضبط hidden هنا كالمعتاد.
       ========================================================================== */
    function setStage(stage) {
        _state = stage;
        var reviewing = stage === 'reviewing';

        if (wcLayout) wcLayout.hidden = reviewing;
        if (wcReviewFullscreen) wcReviewFullscreen.hidden = !reviewing;

        if (wcStageIdle) wcStageIdle.hidden = stage !== 'idle';
        if (wcStageCollecting) wcStageCollecting.hidden = stage !== 'collecting';

        if (wcStartBtn) wcStartBtn.hidden = stage === 'collecting';
        if (wcSkipLetterBtn) wcSkipLetterBtn.hidden = stage !== 'collecting';
        if (wcEndTimerBtn) wcEndTimerBtn.hidden = stage !== 'collecting';
    }

    /* ==========================================================================
       بدء جولة جديدة.
       ========================================================================== */
    function startRound() {
        var activeCats = activeCategoriesSelected();
        if (activeCats.length === 0) {
            showToast('⚠️ فعّل فئة واحدة على الأقل من لوحة التحكم قبل بدء الجولة');
            return;
        }
        var roster = AGP.gameManager.getPlayers();
        if (roster.length === 0) {
            showToast('⚠️ ما فيه لاعبين باللوبي بعد');
            return;
        }

        var settings = AGP.gameShell.getSettings();

        _roundNumber += 1;
        _activeCategoriesThisRound = activeCats;
        _currentLetter = pickRandomLetter();
        _roundDurationSeconds = Number(settings.roundDurationSeconds) || 45;
        _timeRemaining = _roundDurationSeconds;
        _submissions = {};
        _submissionOrder = [];
        _reviewState = {};
        _duplicateWeights = {};

        if (wcRoundVal) wcRoundVal.textContent = String(_roundNumber);
        renderInstructionsHint(activeCats);
        renderParticipantsCount();
        setStage('collecting');
        playLetterRevealAnimation(_currentLetter);
        startTimer();

        if (wcLiveRegion) wcLiveRegion.textContent = 'جولة جديدة بدأت — الحرف ' + _currentLetter;
    }

    /* ⚠️ [إضافة بعد المراجعة] "تخطي الحرف" — لو الحرف تكرر أو المضيف
       ما يبيه لأي سبب، يسحب حرف جديد فوراً ويصفّر المؤقّت والإجابات
       المستلمة، بدون ما تُحسب هذي "جولة" (رقم الجولة يرجع لنفس قيمته
       قبل السحب الجديد — ننقصه هنا ثم startRound() نفسها ترجع تزيده). */
    function handleSkipLetter() {
        if (_state !== 'collecting') return;
        _roundNumber -= 1;
        clearInterval(_timerInterval);
        clearInterval(_letterFlickerInterval);
        startRound();
        showToast('🔁 تم تخطي الحرف — حرف جديد بدون احتساب جولة');
    }

    function playLetterRevealAnimation(finalLetter) {
        if (!wcLetterBadge) return;
        clearInterval(_letterFlickerInterval);
        wcLetterBadge.classList.remove('wc-letter-settle');
        var ticks = 0;
        var maxTicks = 14;
        _letterFlickerInterval = setInterval(function () {
            ticks++;
            wcLetterBadge.textContent = LETTERS_ALL[Math.floor(Math.random() * LETTERS_ALL.length)];
            if (ticks >= maxTicks) {
                clearInterval(_letterFlickerInterval);
                wcLetterBadge.textContent = finalLetter;
                wcLetterBadge.classList.add('wc-letter-settle');
            }
        }, 60);
    }

    function startTimer() {
        clearInterval(_timerInterval);
        updateTimerDisplay();
        _timerInterval = setInterval(function () {
            _timeRemaining -= 1;
            updateTimerDisplay();
            if (_timeRemaining <= 0) {
                clearInterval(_timerInterval);
                endCollectingPhase();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        if (!wcTimerVal || !wcTimerBarFill) return;
        var m = Math.floor(Math.max(0, _timeRemaining) / 60);
        var s = Math.max(0, _timeRemaining) % 60;
        wcTimerVal.textContent = (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
        var pct = _roundDurationSeconds > 0 ? Math.max(0, _timeRemaining / _roundDurationSeconds) * 100 : 0;
        wcTimerBarFill.style.width = pct + '%';
        wcTimerBarFill.classList.toggle('wc-timer-urgent', _timeRemaining > 0 && _timeRemaining <= 10);
    }

    function renderParticipantsCount() {
        if (!wcParticipantsCount) return;
        var answered = _submissionOrder.length;
        var total = AGP.gameManager.getPlayers().length;
        wcParticipantsCount.textContent = answered === 0 ?
            'بانتظار أول إجابة...' :
            'استلمنا إجابات من ' + answered + ' من أصل ' + total + ' لاعب';
    }

    /* ==========================================================================
       الاستماع لتعليقات البث أثناء مرحلة الجمع فقط.
       ========================================================================== */
    /* ⚠️ [تحديث بعد المراجعة] البث فيه كومنتات عامة كثيرة غير الإجابات
       (دردشة، تفاعل...). حتى ما تُقرأ بالغلط كإجابة، صار يُعتمَد فقط
       تعليق يبدأ فعلياً بعلامة "-" — أي شي غيره يُتجاهَل تماماً قبل أي
       تحليل. العلامة تُقبل ملتصقة بأول كلمة ("-أحمد،...") أو بمسافة
       بعدها ("- أحمد، ...") — الاثنين سوا. */
    function wireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (_state !== 'collecting' || !payload || typeof payload.text !== 'string') return;

            var trimmedRaw = payload.text.trim();
            if (trimmedRaw.charAt(0) !== '-') return; // مو رسالة إجابة — تعليق عادي، يُتجاهَل
            var answerText = trimmedRaw.slice(1).trim();
            if (!answerText) return;

            var roster = AGP.gameManager.getPlayers();
            var player = roster.filter(function (p) { return p.id === payload.id; })[0];
            if (!player) return;

            var parsed = parseAnswerText(answerText, _activeCategoriesThisRound);
            if (!parsed) return;
            var hasAny = Object.keys(parsed).some(function (k) { return parsed[k]; });
            if (!hasAny) return;

            if (!_submissions[player.id]) _submissionOrder.push(player.id);
            _submissions[player.id] = { player: player, categories: parsed, updatedAt: Date.now() };
            renderParticipantsCount();
        });
    }

    /* ==========================================================================
       انتهاء وقت الجولة → مرحلة المراجعة. ⚠️ [تحديث بعد المراجعة] الافتراض
       صار "غير مقبولة" لكل خانة (بدل القبول التلقائي سابقاً) — المضيف يقبل
       يدوياً كل إجابة أو يستخدم "قبول الكل"/"رفض الكل" لكل صف.
       ========================================================================== */
    /* ⚠️ [إضافة بعد المراجعة] إجابة مكرّرة (نفس الكلمة بالضبط بنفس الفئة،
       بعد تطبيع بسيط) بين أكثر من لاعب: أول لاعب كتبها (حسب ترتيب وصول
       أول رسالة له بالجولة) تحسب له نقطة كاملة لو قُبلت، وأي لاعب بعده
       كتب نفس الكلمة بالضبط تحسب له نص نقطة بس لو قُبلت. */
    function computeDuplicateWeights() {
        var weights = {}; // playerId -> { categoryKey: 1 | 0.5 }
        _submissionOrder.forEach(function (playerId) { weights[playerId] = {}; });

        _activeCategoriesThisRound.forEach(function (cat) {
            var seenNormalized = {}; // normalizedWord -> true (أول ظهور شفناه)
            _submissionOrder.forEach(function (playerId) {
                var entry = _submissions[playerId];
                var word = entry && entry.categories[cat.key];
                if (!word) return;
                var norm = normalizeAnswerForCompare(word);
                if (seenNormalized[norm]) {
                    weights[playerId][cat.key] = 0.5;
                } else {
                    seenNormalized[norm] = true;
                    weights[playerId][cat.key] = 1;
                }
            });
        });
        return weights;
    }

    function formatScore(n) {
        return (Math.round(n * 10) / 10).toString().replace(/\.0$/, '');
    }

    function endCollectingPhase() {
        clearInterval(_timerInterval);
        clearInterval(_letterFlickerInterval);

        _submissionOrder.forEach(function (playerId) {
            _reviewState[playerId] = {};
            _activeCategoriesThisRound.forEach(function (cat) {
                _reviewState[playerId][cat.key] = false;
            });
        });
        _duplicateWeights = computeDuplicateWeights();

        if (wcReviewRoundLabel) wcReviewRoundLabel.textContent = '(الجولة ' + _roundNumber + ')';
        if (wcReviewSubmittedCount) {
            var totalRoster = AGP.gameManager.getPlayers().length;
            wcReviewSubmittedCount.textContent = '📝 ' + _submissionOrder.length + ' من أصل ' + totalRoster + ' لاعب كتبوا إجابات هذي الجولة';
        }
        setStage('reviewing');
        renderReviewList();
        if (wcLiveRegion) wcLiveRegion.textContent = 'انتهى وقت الجولة — راجع الإجابات واعتمد النتيجة';
    }

    function roundScoreFor(playerId) {
        var review = _reviewState[playerId];
        if (!review) return 0;
        var weights = _duplicateWeights[playerId] || {};
        return _activeCategoriesThisRound.reduce(function (sum, cat) {
            if (!review[cat.key]) return sum;
            return sum + (weights[cat.key] || 1);
        }, 0);
    }

    function renderReviewList() {
        if (!wcReviewList) return;
        wcReviewEmpty.hidden = _submissionOrder.length > 0;
        if (_submissionOrder.length === 0) {
            wcReviewList.innerHTML = '';
            return;
        }

        wcReviewList.innerHTML = _submissionOrder.map(function (playerId) {
            var entry = _submissions[playerId];
            var review = _reviewState[playerId] || {};
            var weights = _duplicateWeights[playerId] || {};
            var cardHtml = AGP.playerCard ? AGP.playerCard.renderHtml(entry.player, {}) :
                '<span class="wc-fallback-name">' + escapeHtml(playerLabel(entry.player)) + '</span>';

            var cellsHtml = _activeCategoriesThisRound.map(function (cat) {
                var word = entry.categories[cat.key] || '';
                var accepted = Boolean(review[cat.key]);
                var isHalf = word && weights[cat.key] === 0.5;
                var emptyClass = word ? '' : ' wc-review-cell-empty';
                var acceptedClass = accepted ? ' wc-review-cell-accepted' : '';
                return '<div class="wc-review-cell' + emptyClass + acceptedClass + '">' +
                    '<span class="wc-review-cell-label">' + cat.emoji + ' ' + cat.label + (isHalf ? ' <span class="wc-review-cell-half" title="إجابة مكرّرة — نص نقطة بس">½</span>' : '') + '</span>' +
                    '<span class="wc-review-cell-word">' + (word ? escapeHtml(word) : 'لا يوجد') + '</span>' +
                    (word ? '<button type="button" class="wc-review-toggle-btn" data-player-id="' + escapeHtml(playerId) + '" data-cat-key="' + cat.key + '" title="' + (accepted ? 'مقبولة — اضغط للإلغاء' : 'اضغط للقبول') + '">' + (accepted ? '✅' : '☐') + '</button>' : '') +
                    '</div>';
            }).join('');

            return '<div class="wc-review-row">' +
                '<div class="wc-review-row-player">' + cardHtml + '</div>' +
                '<div class="wc-review-row-cells">' + cellsHtml + '</div>' +
                '<div class="wc-review-row-actions">' +
                '<button type="button" class="wc-row-action-btn wc-row-accept-all" data-player-id="' + escapeHtml(playerId) + '">✅ قبول الكل</button>' +
                '<button type="button" class="wc-row-action-btn wc-row-reject-all" data-player-id="' + escapeHtml(playerId) + '">❌ رفض الكل</button>' +
                '</div>' +
                '<div class="wc-review-row-score">' + formatScore(roundScoreFor(playerId)) + ' نقطة</div>' +
                '</div>';
        }).join('');

        if (AGP.playerCard) AGP.playerCard.fitAllNames(wcReviewList);

        wcReviewList.querySelectorAll('.wc-review-toggle-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pid = btn.getAttribute('data-player-id');
                var key = btn.getAttribute('data-cat-key');
                if (!_reviewState[pid]) _reviewState[pid] = {};
                _reviewState[pid][key] = !_reviewState[pid][key];
                renderReviewList();
            });
        });
        wcReviewList.querySelectorAll('.wc-row-accept-all').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pid = btn.getAttribute('data-player-id');
                setRowAcceptance(pid, true);
            });
        });
        wcReviewList.querySelectorAll('.wc-row-reject-all').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var pid = btn.getAttribute('data-player-id');
                setRowAcceptance(pid, false);
            });
        });
    }

    function setRowAcceptance(playerId, accepted) {
        var entry = _submissions[playerId];
        if (!entry || !_reviewState[playerId]) return;
        _activeCategoriesThisRound.forEach(function (cat) {
            if (entry.categories[cat.key]) _reviewState[playerId][cat.key] = accepted;
        });
        renderReviewList();
    }

    /* ==========================================================================
       اعتماد نتائج الجولة. ⚠️ [تحديث بعد المراجعة] النقاط تُسجَّل الآن حتى
       لو صفر (بدل تجاهل الصفر سابقاً) — ضروري حتى يظهر كل من شارك بلوحة
       الصدارة، ويصير ممكن تحديد "آخر شخص بالترتيب" لبطاقة نهاية المباراة.
       ========================================================================== */
    function confirmRoundResults() {
        _submissionOrder.forEach(function (playerId) {
            var score = roundScoreFor(playerId);
            AGP.scoreManager.addPoints(playerId, score);
        });

        renderLeaderboard();
        updateStartButtonLabel();

        var settings = AGP.gameShell.getSettings();
        var winMode = settings.winMode || WIN_MODE_POINTS;
        var winner = null;

        if (winMode === WIN_MODE_POINTS) {
            var target = Number(settings.targetScore) || 20;
            var leaderboard = AGP.scoreManager.getLeaderboard();
            if (leaderboard.length > 0 && leaderboard[0].score >= target) winner = leaderboard[0];
        } else {
            var totalRounds = Number(settings.totalRounds) || 5;
            if (_roundNumber >= totalRounds) {
                var lb = AGP.scoreManager.getLeaderboard();
                if (lb.length > 0) winner = lb[0];
            }
        }

        if (winner) {
            finalizeMatchAndShowWinner(winner);
        } else {
            setStage('idle');
            showToast('✅ اعتُمدت نتائج الجولة ' + _roundNumber);
        }
    }

    /* ==========================================================================
       نهاية المباراة: يحسب "آخر شخص بالترتيب" (بطاقة مزحة)، ويستدعي نظام
       نقاط منصة ألعاب أيمن الحقيقي (window.AGPAuth) للفائز فقط — نفس نمط
       روليت الفواكه بالضبط (games/fruit-roulette)، مستورَد هنا بدون أي
       تعديل على auth/auth-client.js نفسه.
       ========================================================================== */
    function finalizeMatchAndShowWinner(winnerRow) {
        var players = AGP.gameManager.getPlayers();
        var champion = players.filter(function (p) { return p.id === winnerRow.playerId; })[0] ||
            { id: winnerRow.playerId, name: winnerRow.playerId };

        var fullLeaderboard = AGP.scoreManager.getLeaderboard();
        var lastPlaceRow = fullLeaderboard.length >= 2 ? fullLeaderboard[fullLeaderboard.length - 1] : null;
        var lastPlacePlayer = lastPlaceRow ?
            (players.filter(function (p) { return p.id === lastPlaceRow.playerId; })[0] || { id: lastPlaceRow.playerId, name: lastPlaceRow.playerId }) :
            null;

        var durationMs = _matchStartedAt ? (Date.now() - _matchStartedAt) : 0;
        // ⚠️ ثلاث حالات محتملة — راجع openWinnerModal: null = تعذّر الاتصال
        // بخادم النقاط، {} = نجح لكن بلا مطابقة حساب، {added,totalPoints} = نجح فعلياً.
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var participants = players.map(function (p) {
                var id = (p && p.id) || '';
                var uname = id.indexOf('tiktok:') === 0 ? id.slice('tiktok:'.length) : (p.name || p.id);
                return { tiktokUsername: uname, won: p.id === champion.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                var championUname = (function () {
                    var id = champion.id || '';
                    return id.indexOf('tiktok:') === 0 ? id.slice('tiktok:'.length) : (champion.name || champion.id);
                })();
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs)
                    .then(function (res) {
                        var awarded = (res && Array.isArray(res.awarded)) ? res.awarded : [];
                        var match = awarded.filter(function (a) { return a.tiktokUsername === championUname; })[0];
                        return match || {};
                    })
                    .catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function (pointsResult) {
            openWinnerModal(champion, winnerRow, lastPlacePlayer, lastPlaceRow, pointsResult);
        });
    }

    function openWinnerModal(champion, winnerRow, lastPlacePlayer, lastPlaceRow, pointsResult) {
        if (wcWinnerName) wcWinnerName.textContent = playerLabel(champion);
        if (wcWinnerAvatarWrap) wcWinnerAvatarWrap.innerHTML = AGP.playerCard ? AGP.playerCard.renderHtml(champion, {}) : '';
        if (wcWinnerScoreText) wcWinnerScoreText.textContent = '🏆 ' + formatScore(winnerRow.score) + ' نقطة بعد ' + _roundNumber + ' جولة';

        if (wcWinnerPointsText) {
            wcWinnerPointsText.className = 'wc-winner-points-text';
            if (pointsResult === null) {
                wcWinnerPointsText.textContent = 'تعذّر جلب نقاط المنصة الآن.';
            } else if (pointsResult && typeof pointsResult.added === 'number') {
                wcWinnerPointsText.classList.add('has-points');
                wcWinnerPointsText.textContent = '⭐ +' + pointsResult.added + ' نقطة بمنصة ألعاب أيمن (المجموع: ' + pointsResult.totalPoints + ')';
            } else {
                wcWinnerPointsText.classList.add('no-account');
                wcWinnerPointsText.textContent = 'لا يوجد حساب مرتبط بهذا اللاعب على المنصة بعد.';
            }
        }

        if (wcLastPlaceCard) {
            if (lastPlacePlayer && lastPlaceRow) {
                wcLastPlaceCard.hidden = false;
                if (wcLastPlaceAvatarWrap) wcLastPlaceAvatarWrap.innerHTML = AGP.playerCard ? AGP.playerCard.renderHtml(lastPlacePlayer, {}) : '';
                if (wcLastPlaceName) wcLastPlaceName.textContent = playerLabel(lastPlacePlayer);
                if (wcLastPlaceScoreText) wcLastPlaceScoreText.textContent = formatScore(lastPlaceRow.score) + ' نقطة بس 😅';
            } else {
                wcLastPlaceCard.hidden = true;
            }
        }

        if (wcLiveRegion) wcLiveRegion.textContent = playerLabel(champion) + ' فاز باللعبة!';
        if (wcWinnerOverlay) wcWinnerOverlay.classList.add('active');
    }

    function closeWinnerModal() {
        if (wcWinnerOverlay) wcWinnerOverlay.classList.remove('active');
    }

    function newGame() {
        closeWinnerModal();
        AGP.gameManager.resetSession();
        window.location.reload();
    }

    function rematchRound() {
        AGP.scoreManager.reset();
        _roundNumber = 0;
        _submissions = {};
        _submissionOrder = [];
        _reviewState = {};
        _duplicateWeights = {};
        _usedLettersThisMatch = [];
        _lastLetter = '';
        _matchStartedAt = Date.now();
        closeWinnerModal();
        renderLeaderboard();
        updateStartButtonLabel();
        if (wcRoundVal) wcRoundVal.textContent = '—';
        setStage('idle');
        if (wcLiveRegion) wcLiveRegion.textContent = 'بدأت مباراة جديدة بنفس اللاعبين!';
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    function handleStartRound() {
        _matchActive = true;
        _matchStartedAt = Date.now();
        _roundNumber = 0;
        _submissions = {};
        _submissionOrder = [];
        _reviewState = {};
        _duplicateWeights = {};
        _usedLettersThisMatch = [];
        _lastLetter = '';
        AGP.scoreManager.reset();
        CATEGORIES.forEach(function (c) { _selectedCategories[c.key] = true; });

        if (wcGameRoot) wcGameRoot.style.display = '';
        renderCategorySelector();
        renderLeaderboard();
        updateStartButtonLabel();
        if (wcRoundVal) wcRoundVal.textContent = '—';
        setStage('idle');
        wireCommentListener();
    }

    function enforceMaxPlayers() {
        var settings = AGP.gameShell.getSettings();
        var max = settings.maxPlayers;
        if (!max) return;
        if (AGP.gameManager.getPlayersCount() >= max) {
            AGP.lobby.close();
            if (AGP.keywordManager && typeof AGP.keywordManager.deactivate === 'function') {
                AGP.keywordManager.deactivate();
            }
        }
    }

    function handlePlayerRemoved(player) {
        if (!player || !player.id) return;
        if (_submissions[player.id]) {
            delete _submissions[player.id];
            delete _reviewState[player.id];
            _submissionOrder = _submissionOrder.filter(function (id) { return id !== player.id; });
            if (_state === 'collecting') renderParticipantsCount();
            if (_state === 'reviewing') renderReviewList();
        }
        renderLeaderboard();
    }

    /* ============ حقول شاشة الإعدادات المشتركة — ⚠️ [تحديث بعد المراجعة]
       حقول الفئات الخمس + استبعاد الحروف الصعبة أُزيلت من هنا بالكامل
       (صارت تحكّم حي داخل اللعبة نفسها، راجع renderCategorySelector أعلاه).
       ما تبقى هنا فقط: حقول لا علاقة لها بالفئات (سعة اللاعبين، من يدخل،
       مدة الجولة، شرط الفوز). ============ */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 2, default: 30 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }],
                default: false
            },
            {
                key: 'roundDurationSeconds', type: 'pill-group', label: '⏱️ مدة كتابة الإجابات',
                options: [
                    { label: '20 ثانية', value: 20 }, { label: '30 ثانية', value: 30 },
                    { label: '45 ثانية', value: 45 }, { label: '60 ثانية', value: 60 },
                    { label: '90 ثانية', value: 90 }, { label: '120 ثانية', value: 120 }
                ],
                default: 45
            },
            {
                key: 'winMode', type: 'pill-choice', label: '🏁 طريقة تحديد الفائز',
                options: [{ label: 'نقاط مستهدفة', value: WIN_MODE_POINTS }, { label: 'عدد جولات محدد', value: WIN_MODE_ROUNDS }],
                default: WIN_MODE_POINTS
            },
            {
                key: 'targetScore', type: 'counter', label: '🎯 النقاط المطلوبة للفوز',
                min: 5, default: 20, showWhen: { key: 'winMode', equals: WIN_MODE_POINTS }
            },
            {
                key: 'totalRounds', type: 'counter', label: '🔁 عدد الجولات الكلي',
                min: 1, default: 5, showWhen: { key: 'winMode', equals: WIN_MODE_ROUNDS }
            }
        ];
    }

    /* ==========================================================================
       تحسينات شاشتي الإعدادات/اللوبي المشتركتين — خاصة بهذي اللعبة فقط،
       بدون أي تعديل على js/agp-game-shell.js نفسه.
       ========================================================================== */

    /* ⚠️ [إصلاح خلل حقيقي بعد المراجعة] كان هذا الزر يظهر أيضاً بشاشة
       الإعدادات "المُعاد فتحها" منتصف المباراة (isReopened) بالخطأ —
       لأن مرساة الإدراج القديمة كانت تبحث عن أي عنصر بكلاس
       .agp-shell-btn-connect، وزر "➕ إضافة لوبي جديد" (#agp-reopen-registration-btn)
       يشارك نفس الكلاس بتلك الشاشة تحديداً. الحل: التحقق أولاً من وجود
       حقل اليوزرنيم (#agp-tiktok-username) — موجود حصراً بشاشة الإعدادات
       الأولى الحقيقية (isReopened=false)، وأبداً لا يُرسَم بالنسخة
       المُعاد فتحها. زر "➕ إضافة لوبي جديد" نفسه يُخفى عبر CSS فقط
       (راجع style.css) — طلب صريح، بدون أي تعديل على الملف المشترك. */
    function enhanceSettingsScreen() {
        var box = document.getElementById('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box')) return;
        if (!document.getElementById('agp-tiktok-username')) return; // شاشة مُعاد فتحها منتصف المباراة — لا زر رجوع هنا
        if (box.querySelector('.wc-settings-home-btn')) return;
        var connectBtn = document.getElementById('agp-connect-btn');
        if (!connectBtn) return;

        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'wc-settings-home-btn';
        btn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
        btn.addEventListener('click', function () { window.location.href = '../../index.html'; });
        connectBtn.insertAdjacentElement('afterend', btn);
    }

    function enhanceLobbyList() {
        var list = document.getElementById('agp-lobby-list');
        if (!list || !AGP.gameManager) return;
        var players = AGP.gameManager.getPlayers();
        var items = list.querySelectorAll('li');
        items.forEach(function (li, i) {
            if (li.querySelector('.wc-lobbyscreen-remove-btn')) return;
            var player = players[i];
            if (!player || !player.id) return;
            var btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'wc-lobbyscreen-remove-btn';
            btn.title = 'حذف من اللوبي';
            btn.textContent = '✕';
            btn.addEventListener('click', function () {
                if (AGP.player && typeof AGP.player.removePlayer === 'function') {
                    AGP.player.removePlayer(player.id);
                }
            });
            li.appendChild(btn);
        });
    }

    /* ⚠️ [إعادة تصميم بعد المراجعة] الإصدار السابق كان يقيس عرض كل اسم
       فعلياً (scrollWidth) ليقرر لو البطاقة "عريضة" (تاخذ عمودين) أو
       عادية، ضمن شبكة 3 أعمدة تتمدد لتملأ عرض الصندوق. طلب صريح لاحق:
       كل البطاقات (اسم قصير أو طويل) تاخذ نفس المقاس الثابت (مقاس أوسع
       بطاقة كانت تُحسب "عريضة" سابقاً)، والبطاقات ما تتمدد لتملأ كل
       عرض اللوبي — فقط مسافة 1 سنتيمتر فعلية بينها (gap:1cm بCSS مباشرة،
       يبقى ثابت دائماً). هذا ألغى الحاجة لقياس كل اسم على حدة بالكامل.
       يبقى فقط: لو عدد اللاعبين كبير جداً ولا يتسع رأسياً بالصندوق
       الثابت (900px)، الأفاتار/البطاقة/الخط يصغرون سوا بنفس النسبة
       (المسافة 1cm نفسها ثابتة، ما تصغر) — نفس فكرة النقطة 8 بالبروبمت
       الأصلي، بس بدون تعقيد قياس العرض لكل اسم. */
    function applyDynamicLobbyCardScale() {
        var box = document.getElementById('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var list = document.getElementById('agp-lobby-list');
        if (!list) return;
        var n = list.querySelectorAll('li').length;
        if (n === 0) return;

        var BASE_AVATAR = 50, BASE_PILL_W = 260, BASE_PILL_H = 50, BASE_FONT = 18, BASE_ZOOM = 0.77;
        var GAP_PX = 37.8; // 1cm — يُستخدَم هنا فقط لحساب كم بطاقة تتسع بالصف، القيمة الفعلية بالـCSS ثابتة "1cm" دائماً
        var MIN_SCALE = 0.55;

        var availableWidth = list.clientWidth || box.clientWidth || 832;
        var availableHeight = list.clientHeight || 620;

        function cardsPerRow(scale) {
            var cardW = Math.round(BASE_AVATAR * scale) + Math.round(BASE_PILL_W * scale);
            return Math.max(1, Math.floor((availableWidth + GAP_PX) / (cardW + GAP_PX)));
        }
        function neededHeight(scale) {
            var perRow = cardsPerRow(scale);
            var rows = Math.ceil(n / perRow);
            var rowH = Math.round(BASE_PILL_H * scale);
            return rows * rowH + Math.max(0, rows - 1) * GAP_PX;
        }

        var scale = 1;
        if (neededHeight(1) > availableHeight) {
            scale = MIN_SCALE;
            for (var s = 1; s >= MIN_SCALE; s -= 0.02) {
                if (neededHeight(s) <= availableHeight) { scale = s; break; }
            }
        }

        box.style.setProperty('--wc-lobby-avatar-size', Math.round(BASE_AVATAR * scale) + 'px');
        box.style.setProperty('--wc-lobby-pill-width', Math.round(BASE_PILL_W * scale) + 'px');
        box.style.setProperty('--wc-lobby-pill-height', Math.round(BASE_PILL_H * scale) + 'px');
        box.style.setProperty('--wc-lobby-font-size', Math.max(13, Math.round(BASE_FONT * scale)) + 'px');
        box.style.setProperty('--wc-lobby-frame-zoom', (BASE_ZOOM * scale).toFixed(3));
    }

    function enhanceLobbyActions() {
        var box = document.getElementById('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var startBtn = document.getElementById('agp-start-round-btn');
        if (!startBtn) return;

        var row = box.querySelector('.wc-lobby-actions-row');
        if (!row) {
            row = document.createElement('div');
            row.className = 'wc-lobby-actions-row';
            startBtn.parentNode.insertBefore(row, startBtn);

            var backSettingsBtn = document.createElement('button');
            backSettingsBtn.type = 'button';
            backSettingsBtn.className = 'wc-lobby-action-btn';
            backSettingsBtn.textContent = '⚙️ العودة لاعدادات المباراة';
            backSettingsBtn.addEventListener('click', function () {
                if (window.confirm('بيرجّعك لشاشة إعدادات المباراة الأولى، ويلغي الاتصال الحالي بالبث ويقفل اللوبي — بيحتاج اتصال جديد بعدها. تكمل؟')) {
                    window.location.reload();
                }
            });

            row.appendChild(backSettingsBtn);
            row.appendChild(startBtn);
        }

        if (!row.querySelector('.wc-lobby-home-btn')) {
            var homeBtn = document.createElement('button');
            homeBtn.type = 'button';
            homeBtn.className = 'wc-lobby-action-btn wc-lobby-home-btn';
            homeBtn.textContent = '🏠 رجوع لمنصة ألعاب أيمن';
            homeBtn.addEventListener('click', function () { window.location.href = '../../index.html'; });
            row.appendChild(homeBtn);
        }
    }

    function enhanceLobbyHeading() {
        var box = document.getElementById('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var h2 = box.querySelector('h2');
        if (!h2 || h2.getAttribute('data-wc-heading') === '1') return;
        h2.innerHTML = '<span class="wc-lobby-heading-plain">اللوبي بانتظار اللاعبين</span> ' +
            '<span class="wc-lobby-heading-accent">' + escapeHtml(GAME_NAME) + '</span>';
        h2.setAttribute('data-wc-heading', '1');
    }

    function applyShellEnhancements() {
        enhanceSettingsScreen();
        enhanceLobbyList();
        applyDynamicLobbyCardScale();
        enhanceLobbyHeading();
        enhanceLobbyActions();
    }

    function wireSharedShellEnhancements() {
        applyShellEnhancements();
        var overlay = document.getElementById('agp-shell-overlay');
        if (!overlay) return;
        var observer = new MutationObserver(applyShellEnhancements);
        observer.observe(overlay, { childList: true, subtree: true });
    }

    /* ==========================================================================
       التسجيل بالمنصة.
       ========================================================================== */
    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'word-games',

            onLoad: function () { AGP.log('Word Categories: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Word Categories: onRoundEnd.'); },
            onDestroy: function () {
                _matchActive = false;
                _state = 'idle';
                _roundNumber = 0;
                _submissions = {};
                _submissionOrder = [];
                _reviewState = {};
                _duplicateWeights = {};
                clearInterval(_timerInterval);
                clearInterval(_letterFlickerInterval);
                if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }
                if (wcGameRoot) wcGameRoot.style.display = 'none';
                AGP.log('Word Categories: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Word Categories: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        _playerRemovedUnsub = AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة اسم و حيوان و نبات و جماد و بلاد',
            gameExplanation: 'يطلع حرف عربي عشوائي كل جولة. اللاعبون يكتبون بشات البث إجاباتهم للفئات المفعَّلة ' +
                '(تختارها من لوحة تحكم اللعبة نفسها، تقدر تغيّرها أي وقت) اللي تبدأ بنفس الحرف، خلال الوقت المحدد. ' +
                'بعد انتهاء الوقت تراجع كل إجابة وتقبلها أو ترفضها، ويُحتسب نقطة لكل إجابة مقبولة. الفوز إما ' +
                'بالوصول لنقاط مستهدفة أو بعد عدد جولات محدد — اختيارك من الإعدادات.',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });

        wireSharedShellEnhancements();
    }

    var _uiInitialized = false;
    function initStaticUi() {
        if (_uiInitialized) return;
        _uiInitialized = true;
        cacheDom();
        renderCategorySelector();

        if (wcStartBtn) wcStartBtn.addEventListener('click', startRound);
        if (wcSkipLetterBtn) wcSkipLetterBtn.addEventListener('click', handleSkipLetter);
        if (wcEndTimerBtn) wcEndTimerBtn.addEventListener('click', function () {
            clearInterval(_timerInterval);
            endCollectingPhase();
        });
        if (wcConfirmBtn) wcConfirmBtn.addEventListener('click', confirmRoundResults);
        if (wcFormatHelpBtn) wcFormatHelpBtn.addEventListener('click', function () {
            if (!wcFormatHelpPanel) return;
            wcFormatHelpPanel.hidden = !wcFormatHelpPanel.hidden;
            wcFormatHelpBtn.classList.toggle('active', !wcFormatHelpPanel.hidden);
        });
        if (wcNewGameBtn) wcNewGameBtn.addEventListener('click', newGame);
        if (wcRematchBtn) wcRematchBtn.addEventListener('click', rematchRound);
        if (wcWinnerHomeBtn) wcWinnerHomeBtn.addEventListener('click', function () {
            closeWinnerModal();
            window.location.href = '../../index.html';
        });
    }

    AGP.events.on('platform:ready', function () {
        initStaticUi();
        registerGame();
    });

    if (document.readyState !== 'loading' && AGP.gameManager &&
        !AGP.gameManager.getRegisteredGames().some(function (g) { return g.id === GAME_ID; })) {
        initStaticUi();
        registerGame();
    }

}(window.AymanGamesPlatform));
