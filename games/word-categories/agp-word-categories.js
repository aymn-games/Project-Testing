/**
 * ==========================================================================
 *  AGP GAME: اسم و حيوان و نبات و جماد و بلاد (Word Categories)
 * ==========================================================================
 * لعبة "Native" مستقلة تماماً (بنفس نمط games/fruit-roulette): صفحتها
 * الخاصة تحمّل AGP Core + js/agp-game-shell.js كاملَين، ثم هذا الملف
 * يسجّل اللعبة ويدير كامل منطقها. لا اعتماد على أي ملف يخص لعبة أخرى،
 * ولا أي تعديل على أي ملف مشترك (js/agp-*.js) — كل التخصيص (عنوان
 * اللوبي، شبكة البطاقات، صف الأزرار، ألوان شاشة الإعدادات...) يتم حصراً
 * عبر حقن CSS/DOM وقت التشغيل من هذا الملف، بنفس أسلوب باقي الألعاب
 * (MutationObserver يراقب #agp-shell-overlay).
 *
 * ⚠️ فكرة اللعبة: حرف عربي عشوائي كل جولة، اللاعبون يكتبون إجاباتهم
 * (اسم/حيوان/نبات/جماد/بلاد — حسب الفئات المفعَّلة) بشات البث خلال وقت
 * محدد، ثم يراجع المضيف كل إجابة (قبول/رفض) ويُحتسب لكل لاعب نقطة واحدة
 * عن كل فئة مقبولة. الفوز إما بالوصول لنقاط مستهدفة أو بعد عدد جولات
 * محدد (اختيار المضيف من الإعدادات).
 *
 * ⚠️ بروتوكول الإجابة بالشات (قرار تصميمي، موضّح للمضيف واللاعبين على
 * الشاشة كل جولة): يكتب اللاعب إجاباته مفصولة بفواصل (, أو ،) بنفس ترتيب
 * الفئات المفعَّلة المعروض بالشاشة. لو فئة واحدة فقط مفعَّلة، تُقرأ الرسالة
 * كاملة كإجابة واحدة (بدون تقسيم) حتى تُقبل الأسماء المكوّنة من كلمتين.
 * كل رسالة جديدة من نفس اللاعب تستبدل إجابته السابقة لنفس الجولة (يسمح
 * له بتصحيح نفسه قبل انتهاء الوقت).
 *
 * ⚠️ الإجابات تُقبل فقط من لاعبين منضمّين فعلاً للوبي (AGP.gameManager.getPlayers())
 * — نفس اتفاقية باقي ألعاب المنصة (الانضمام يتم بالكلمة المفتاحية باللوبي
 * قبل بدء الجولة الأولى فقط، بدون لوبي مصغّر لإضافة لاعبين منتصف المباراة
 * بهذه اللعبة تحديداً — قرار نطاق بسيط، بنفس حدود روليت الفواكه/حرب الفريقين).
 *
 * يعتمد على: js/agp-core.js وكل ملفات AGP Core (راجع index.html لترتيب
 * التحميل الكامل)، js/agp-game-shell.js، js/agp-player-card.js.
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

    /* ترتيب ثابت للفئات — نفس الترتيب يُستخدَم لعرض التلميح وتفسير ترتيب
       الإجابات المفصولة بفواصل بشات البث. */
    var CATEGORIES = [
        { key: 'name', label: 'اسم', emoji: '👤', toggleKey: 'catName' },
        { key: 'animal', label: 'حيوان', emoji: '🐾', toggleKey: 'catAnimal' },
        { key: 'plant', label: 'نبات', emoji: '🌿', toggleKey: 'catPlant' },
        { key: 'object', label: 'جماد', emoji: '📦', toggleKey: 'catObject' },
        { key: 'country', label: 'بلاد', emoji: '🌍', toggleKey: 'catCountry' }
    ];

    var LETTERS_ALL = ['ا', 'ب', 'ت', 'ث', 'ج', 'ح', 'خ', 'د', 'ذ', 'ر', 'ز', 'س', 'ش',
        'ص', 'ض', 'ط', 'ظ', 'ع', 'غ', 'ف', 'ق', 'ك', 'ل', 'م', 'ن', 'ه', 'و', 'ي'];
    var HARD_LETTERS = ['ث', 'ذ', 'ض', 'ظ'];

    var WIN_MODE_POINTS = 'points';
    var WIN_MODE_ROUNDS = 'rounds';

    /* ============ حالة اللعبة (تُصفَّر عند onDestroy/newGame) ============ */
    var _state = 'idle'; // 'idle' | 'collecting' | 'reviewing'
    var _roundNumber = 0;
    var _currentLetter = '';
    var _lastLetter = '';
    var _activeCategoriesThisRound = [];
    var _roundDurationSeconds = 45;
    var _timeRemaining = 0;
    var _timerInterval = null;
    var _letterFlickerInterval = null;
    var _submissions = {}; // playerId -> { player, categories: {key: text}, updatedAt }
    var _reviewState = {}; // playerId -> { key: boolean }
    var _commentUnsub = null;
    var _playerJoinedUnsub = null;
    var _playerRemovedUnsub = null;
    var _matchActive = false;

    /* ============ عناصر الصفحة (تُخزَّن مرة واحدة عند initStaticUi) ============ */
    var wcGameRoot, wcRoundVal, wcCategoryChips, wcLeaderboardList, wcStartBtn, wcEndTimerBtn,
        wcStageIdle, wcStageCollecting, wcStageReview, wcLetterBadge, wcTimerBarFill, wcTimerVal,
        wcInstructionsHint, wcParticipantsCount, wcReviewList, wcReviewEmpty, wcConfirmBtn,
        wcToastWrap, wcLiveRegion, wcWinnerOverlay, wcWinnerAvatarWrap, wcWinnerName,
        wcWinnerScoreText, wcWinnerHomeBtn, wcNewGameBtn, wcRematchBtn;

    function cacheDom() {
        wcGameRoot = document.getElementById('wcGameRoot');
        wcRoundVal = document.getElementById('wcRoundVal');
        wcCategoryChips = document.getElementById('wcCategoryChips');
        wcLeaderboardList = document.getElementById('wcLeaderboardList');
        wcStartBtn = document.getElementById('wcStartBtn');
        wcEndTimerBtn = document.getElementById('wcEndTimerBtn');
        wcStageIdle = document.getElementById('wcStageIdle');
        wcStageCollecting = document.getElementById('wcStageCollecting');
        wcStageReview = document.getElementById('wcStageReview');
        wcLetterBadge = document.getElementById('wcLetterBadge');
        wcTimerBarFill = document.getElementById('wcTimerBarFill');
        wcTimerVal = document.getElementById('wcTimerVal');
        wcInstructionsHint = document.getElementById('wcInstructionsHint');
        wcParticipantsCount = document.getElementById('wcParticipantsCount');
        wcReviewList = document.getElementById('wcReviewList');
        wcReviewEmpty = document.getElementById('wcReviewEmpty');
        wcConfirmBtn = document.getElementById('wcConfirmBtn');
        wcToastWrap = document.getElementById('wcToastWrap');
        wcLiveRegion = document.getElementById('wcLiveRegion');
        wcWinnerOverlay = document.getElementById('wcWinnerOverlay');
        wcWinnerAvatarWrap = document.getElementById('wcWinnerAvatarWrap');
        wcWinnerName = document.getElementById('wcWinnerName');
        wcWinnerScoreText = document.getElementById('wcWinnerScoreText');
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

    /* ============ فئات الجولة الحيّة (تُقرأ من إعدادات الشِل مباشرة —
       تسمح للمضيف بتعديلها منتصف المباراة عبر ⚙️ الإعدادات، وتُطبَّق من
       الجولة القادمة تلقائياً). ============ */
    function liveSettings() {
        return AGP.gameShell.getSettings();
    }

    function activeCategoriesFromSettings(settings) {
        return CATEGORIES.filter(function (cat) { return Boolean(settings[cat.toggleKey]); });
    }

    /* ============ اختيار حرف عشوائي — يتجنّب تكرار نفس حرف الجولة
       السابقة، ويستبعد الحروف الصعبة لو مفعَّل بالإعدادات. ============ */
    function pickRandomLetter(excludeHard) {
        var pool = excludeHard ? LETTERS_ALL.filter(function (l) { return HARD_LETTERS.indexOf(l) === -1; }) : LETTERS_ALL.slice();
        if (pool.length === 0) pool = LETTERS_ALL.slice();
        var letter;
        var guard = 0;
        do {
            letter = pool[Math.floor(Math.random() * pool.length)];
            guard++;
        } while (pool.length > 1 && letter === _lastLetter && guard < 20);
        _lastLetter = letter;
        return letter;
    }

    /* ============ تفسير رسالة شات وارِدة إلى كائن {categoryKey: نص} ============
       فئة واحدة فقط مفعَّلة ← الرسالة كاملة تُعتبر إجابة واحدة (بدون تقسيم،
       حتى تُقبل أسماء/بلدان من كلمتين). أكثر من فئة ← تقسيم بالفاصلة
       (عربية أو إنجليزية) إن وُجدت، وإلا بالمسافات، بنفس ترتيب الفئات
       المفعَّلة المعروض على الشاشة. */
    function parseAnswerText(rawText, activeCats) {
        if (typeof rawText !== 'string') return null;
        var raw = rawText.trim();
        if (!raw) return null;

        var result = {};
        if (activeCats.length === 1) {
            result[activeCats[0].key] = raw;
            return result;
        }

        var parts = /[،,]/.test(raw) ? raw.split(/[،,]+/) : raw.split(/\s+/);
        parts = parts.map(function (p) { return p.trim(); }).filter(function (p) { return p.length > 0; });

        activeCats.forEach(function (cat, i) {
            result[cat.key] = parts[i] || '';
        });
        return result;
    }

    /* ==========================================================================
       عرض الفئات المفعَّلة (شارات) — يُحدَّث عند كل بدء جولة.
       ========================================================================== */
    function renderCategoryChips(activeCats) {
        if (!wcCategoryChips) return;
        wcCategoryChips.innerHTML = activeCats.map(function (cat) {
            return '<span class="wc-cat-chip">' + cat.emoji + ' ' + cat.label + '</span>';
        }).join('') || '<span class="wc-cat-chip wc-cat-chip-empty">لا توجد فئة مفعَّلة</span>';
    }

    function renderInstructionsHint(activeCats) {
        if (!wcInstructionsHint) return;
        if (activeCats.length === 1) {
            wcInstructionsHint.textContent = 'اكتبوا بالشات كلمة "' + activeCats[0].label + '" تبدأ بحرف "' + _currentLetter + '"';
        } else {
            var order = activeCats.map(function (c) { return c.label; }).join('، ');
            wcInstructionsHint.textContent = 'اكتبوا بالشات إجاباتكم مفصولة بفاصلة، بهذا الترتيب: ' + order + ' — كلها تبدأ بحرف "' + _currentLetter + '"';
        }
    }

    /* ==========================================================================
       لوحة الصدارة — من AGP.scoreManager (سجل نقاط عام مشترك، لا يعرف
       شيئاً عن قواعد اللعبة، فقط رقم لكل معرّف لاعب).
       ========================================================================== */
    function renderLeaderboard() {
        if (!wcLeaderboardList) return;
        var leaderboard = AGP.scoreManager.getLeaderboard().filter(function (row) { return row.score > 0; });
        if (leaderboard.length === 0) {
            wcLeaderboardList.innerHTML = '<li class="wc-leaderboard-empty">ما فيه نقاط بعد</li>';
            return;
        }
        var players = AGP.gameManager.getPlayers();
        wcLeaderboardList.innerHTML = leaderboard.slice(0, 10).map(function (row, i) {
            var player = players.filter(function (p) { return p.id === row.playerId; })[0];
            return '<li><span class="wc-leaderboard-rank">' + (i + 1) + '</span>' +
                '<span class="wc-leaderboard-name">' + escapeHtml(playerLabel(player) || row.playerId) + '</span>' +
                '<span class="wc-leaderboard-score">' + row.score + '</span></li>';
        }).join('');
    }

    /* ==========================================================================
       حالة "بدء الجولة" — تحديث نص/ظهور الأزرار حسب رقم الجولة الحالي.
       ========================================================================== */
    function updateStartButtonLabel() {
        if (!wcStartBtn) return;
        wcStartBtn.textContent = _roundNumber === 0 ? '🎲 بدء الجولة' : '🎲 بدء الجولة التالية';
    }

    function setStage(stage) {
        _state = stage;
        if (wcStageIdle) wcStageIdle.hidden = stage !== 'idle';
        if (wcStageCollecting) wcStageCollecting.hidden = stage !== 'collecting';
        if (wcStageReview) wcStageReview.hidden = stage !== 'reviewing';
        if (wcStartBtn) wcStartBtn.hidden = stage === 'collecting' || stage === 'reviewing';
        if (wcEndTimerBtn) wcEndTimerBtn.hidden = stage !== 'collecting';
    }

    /* ==========================================================================
       بدء جولة جديدة: حرف عشوائي + فئات حيّة من الإعدادات + مؤقّت.
       ========================================================================== */
    function startRound() {
        var settings = liveSettings();
        var activeCats = activeCategoriesFromSettings(settings);
        if (activeCats.length === 0) {
            showToast('⚠️ فعّل فئة واحدة على الأقل من ⚙️ الإعدادات قبل بدء الجولة');
            return;
        }
        var roster = AGP.gameManager.getPlayers();
        if (roster.length === 0) {
            showToast('⚠️ ما فيه لاعبين باللوبي بعد');
            return;
        }

        _roundNumber += 1;
        _activeCategoriesThisRound = activeCats;
        _currentLetter = pickRandomLetter(Boolean(settings.excludeHardLetters));
        _roundDurationSeconds = Number(settings.roundDurationSeconds) || 45;
        _timeRemaining = _roundDurationSeconds;
        _submissions = {};
        _reviewState = {};

        if (wcRoundVal) wcRoundVal.textContent = String(_roundNumber);
        renderCategoryChips(activeCats);
        renderInstructionsHint(activeCats);
        renderParticipantsCount();
        setStage('collecting');
        playLetterRevealAnimation(_currentLetter);
        startTimer();

        if (wcLiveRegion) wcLiveRegion.textContent = 'جولة جديدة بدأت — الحرف ' + _currentLetter;
    }

    /* ============ أنيميشن كشف الحرف — تقليب سريع بين حروف عشوائية ثم
       الاستقرار على الحرف الفعلي، بنفس روح تدوير عجلة روليت الفواكه. ============ */
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

    /* ============ المؤقّت — عدّاد محلي بسيط (setInterval)، بنفس أسلوب
       باقي الألعاب (لا اعتماد على js/agp-timer-manager.js إلزامياً). ============ */
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
        var answered = Object.keys(_submissions).length;
        var total = AGP.gameManager.getPlayers().length;
        wcParticipantsCount.textContent = answered === 0 ?
            'بانتظار أول إجابة...' :
            'استلمنا إجابات من ' + answered + ' من أصل ' + total + ' لاعب';
    }

    /* ==========================================================================
       الاستماع لتعليقات البث أثناء مرحلة الجمع فقط — يقبل فقط من لاعبين
       منضمّين فعلاً باللوبي الحالي (AGP.gameManager.getPlayers()).
       ========================================================================== */
    function wireCommentListener() {
        if (typeof _commentUnsub === 'function') _commentUnsub();
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (_state !== 'collecting' || !payload || typeof payload.text !== 'string') return;

            var roster = AGP.gameManager.getPlayers();
            var player = roster.filter(function (p) { return p.id === payload.id; })[0];
            if (!player) return; // مو منضم باللوبي — يُتجاهَل

            var parsed = parseAnswerText(payload.text, _activeCategoriesThisRound);
            if (!parsed) return;
            var hasAny = Object.keys(parsed).some(function (k) { return parsed[k]; });
            if (!hasAny) return;

            _submissions[player.id] = { player: player, categories: parsed, updatedAt: Date.now() };
            renderParticipantsCount();
        });
    }

    /* ==========================================================================
       انتهاء وقت الجولة (تلقائياً أو بضغط "إنهاء الوقت الآن") → مرحلة
       المراجعة: قبول تلقائي لأي إجابة غير فارغة (المضيف يرفض الخطأ فقط —
       أسرع لسياق بث مباشر)، ثم إعادة رسم قائمة المراجعة الكاملة.
       ========================================================================== */
    function endCollectingPhase() {
        clearInterval(_timerInterval);
        clearInterval(_letterFlickerInterval);

        Object.keys(_submissions).forEach(function (playerId) {
            var entry = _submissions[playerId];
            _reviewState[playerId] = {};
            _activeCategoriesThisRound.forEach(function (cat) {
                _reviewState[playerId][cat.key] = Boolean(entry.categories[cat.key]);
            });
        });

        setStage('reviewing');
        renderReviewList();
        if (wcLiveRegion) wcLiveRegion.textContent = 'انتهى وقت الجولة — راجع الإجابات واعتمد النتيجة';
    }

    function roundScoreFor(playerId) {
        var review = _reviewState[playerId];
        if (!review) return 0;
        return _activeCategoriesThisRound.reduce(function (sum, cat) { return sum + (review[cat.key] ? 1 : 0); }, 0);
    }

    function renderReviewList() {
        if (!wcReviewList) return;
        var playerIds = Object.keys(_submissions);
        wcReviewEmpty.hidden = playerIds.length > 0;
        if (playerIds.length === 0) {
            wcReviewList.innerHTML = '';
            return;
        }

        wcReviewList.innerHTML = playerIds.map(function (playerId) {
            var entry = _submissions[playerId];
            var review = _reviewState[playerId] || {};
            var cardHtml = AGP.playerCard ? AGP.playerCard.renderHtml(entry.player, {}) :
                '<span class="wc-fallback-name">' + escapeHtml(playerLabel(entry.player)) + '</span>';

            var cellsHtml = _activeCategoriesThisRound.map(function (cat) {
                var word = entry.categories[cat.key] || '';
                var accepted = Boolean(review[cat.key]);
                var emptyClass = word ? '' : ' wc-review-cell-empty';
                var stateClass = word ? (accepted ? ' wc-review-cell-accepted' : ' wc-review-cell-rejected') : '';
                return '<div class="wc-review-cell' + emptyClass + stateClass + '">' +
                    '<span class="wc-review-cell-label">' + cat.emoji + ' ' + cat.label + '</span>' +
                    '<span class="wc-review-cell-word">' + (word ? escapeHtml(word) : 'لا يوجد') + '</span>' +
                    (word ? '<button type="button" class="wc-review-toggle-btn" data-player-id="' + escapeHtml(playerId) + '" data-cat-key="' + cat.key + '">' + (accepted ? '✓' : '✗') + '</button>' : '') +
                    '</div>';
            }).join('');

            return '<div class="wc-review-row">' +
                '<div class="wc-review-row-player">' + cardHtml + '</div>' +
                '<div class="wc-review-row-cells">' + cellsHtml + '</div>' +
                '<div class="wc-review-row-score">' + roundScoreFor(playerId) + ' نقطة</div>' +
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
    }

    /* ==========================================================================
       اعتماد نتائج الجولة: إضافة النقاط لسجل AGP.scoreManager المشترك،
       ثم فحص شرط الفوز حسب اختيار المضيف بالإعدادات.
       ========================================================================== */
    function confirmRoundResults() {
        Object.keys(_reviewState).forEach(function (playerId) {
            var score = roundScoreFor(playerId);
            if (score > 0) AGP.scoreManager.addPoints(playerId, score);
        });

        renderLeaderboard();
        updateStartButtonLabel();

        var settings = liveSettings();
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
            openWinnerModal(winner);
        } else {
            setStage('idle');
            showToast('✅ اعتُمدت نتائج الجولة ' + _roundNumber);
        }
    }

    /* ==========================================================================
       بطاقة الفائز.
       ========================================================================== */
    function openWinnerModal(winnerRow) {
        var players = AGP.gameManager.getPlayers();
        var champion = players.filter(function (p) { return p.id === winnerRow.playerId; })[0] || { id: winnerRow.playerId, name: winnerRow.playerId };

        if (wcWinnerName) wcWinnerName.textContent = playerLabel(champion);
        if (wcWinnerAvatarWrap) {
            wcWinnerAvatarWrap.innerHTML = AGP.playerCard ? AGP.playerCard.renderHtml(champion, {}) : '';
        }
        if (wcWinnerScoreText) wcWinnerScoreText.textContent = '🏆 ' + winnerRow.score + ' نقطة بعد ' + _roundNumber + ' جولة';

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        if (wcLiveRegion) wcLiveRegion.textContent = playerLabel(champion) + ' فاز باللعبة!';
        if (wcWinnerOverlay) wcWinnerOverlay.classList.add('active');
    }

    function closeWinnerModal() {
        if (wcWinnerOverlay) wcWinnerOverlay.classList.remove('active');
    }

    /* ============ مباراة جديدة (يرجّع لشاشة الإعدادات الكاملة) ============ */
    function newGame() {
        closeWinnerModal();
        AGP.gameManager.resetSession();
        window.location.reload();
    }

    /* ============ إعادة المباراة بنفس اللاعبين (يصفّر النقاط والجولات) ============ */
    function rematchRound() {
        AGP.scoreManager.reset();
        _roundNumber = 0;
        _submissions = {};
        _reviewState = {};
        closeWinnerModal();
        renderLeaderboard();
        updateStartButtonLabel();
        if (wcRoundVal) wcRoundVal.textContent = '—';
        setStage('idle');
        if (wcLiveRegion) wcLiveRegion.textContent = 'بدأت مباراة جديدة بنفس اللاعبين!';
        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    /* ============ بدء المباراة فعلياً — تُستدعى من agp-game-shell.js بعد
       ضغط المضيف "انهاء وبدء الجولة" باللوبي. ============ */
    function handleStartRound() {
        _matchActive = true;
        _roundNumber = 0;
        _submissions = {};
        _reviewState = {};
        AGP.scoreManager.reset();

        if (wcGameRoot) wcGameRoot.style.display = '';
        renderLeaderboard();
        updateStartButtonLabel();
        if (wcRoundVal) wcRoundVal.textContent = '—';
        var settings = liveSettings();
        renderCategoryChips(activeCategoriesFromSettings(settings));
        setStage('idle');
        wireCommentListener();
    }

    /* ============ الحد الأقصى للاعبين ============ */
    function enforceMaxPlayers() {
        var settings = liveSettings();
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
            if (_state === 'collecting') renderParticipantsCount();
            if (_state === 'reviewing') renderReviewList();
        }
        renderLeaderboard();
    }

    /* ============ حقول شاشة الإعدادات (تُعاد قراءتها بأي وقت عبر
       AGP.gameShell.getSettings() — نفس الحقول متاحة للتعديل منتصف
       المباراة عبر ⚙️ إعادة فتح الشاشة، بدون أي كود إضافي). ============ */
    function buildSettingsFields() {
        var fields = [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 2, default: 30 },
            {
                key: 'followersOnly', type: 'pill-choice', label: '🔑 مين يقدر يدخل؟',
                options: [{ label: 'الكل', value: false }, { label: 'المتابعون فقط', value: true }],
                default: false
            }
        ];

        CATEGORIES.forEach(function (cat) {
            fields.push({ key: cat.toggleKey, type: 'toggle', label: cat.emoji + ' فئة "' + cat.label + '"', default: true });
        });

        fields.push(
            { key: 'excludeHardLetters', type: 'toggle', label: '🚫 استبعاد الحروف الصعبة (ث، ذ، ض، ظ)', default: true },
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
        );

        return fields;
    }

    /* ==========================================================================
       تحسينات شاشتي الإعدادات/اللوبي المشتركتين (js/agp-game-shell.js) —
       خاصة بهذي اللعبة فقط، بدون أي تعديل على الملف المشترك نفسه.
       نفس أسلوب/قيم روليت الفواكه المُثبَتة عملياً (راجع
       lobby-heading-cards-buttons-prompt.md) — فقط خلفية صندوق اللوبي
       نفسها هنا تُطبَّق عليها هوية اللعبة (الأزرق الداكن↔الأسود) بدل ما
       تبقى كما هي، لأنها لعبة جديدة بلا هوية سابقة (بعكس روليت الفواكه).
       ========================================================================== */
    function enhanceSettingsScreen() {
        var box = document.getElementById('agp-shell-box');
        if (!box) return;
        if (box.classList.contains('agp-lobby-box') || box.classList.contains('agp-connecting-box')) return;
        if (box.querySelector('.wc-settings-home-btn')) return;
        var connectBtn = box.querySelector('.agp-shell-btn-connect');
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

    function markWideLobbyCards(box, list) {
        var items = list.querySelectorAll('li');
        if (items.length === 0) return 0;

        var availableWidth = list.clientWidth || box.clientWidth || 1400;
        var GRID_GAP = 10, BUFFER = 8, COLUMNS = 3;
        var columnWidth = (availableWidth - GRID_GAP * (COLUMNS - 1)) / COLUMNS;

        var pillMaxRef = parseFloat(box.style.getPropertyValue('--wc-lobby-pill-maxw')) || 260;
        var pillMinRef = parseFloat(box.style.getPropertyValue('--wc-lobby-pill-minw')) || 110;
        var avatarRef = parseFloat(box.style.getPropertyValue('--wc-lobby-avatar-size')) || 50;

        var totalSlots = 0;
        for (var i = 0; i < items.length; i++) {
            var li = items[i];
            var wide = false;
            var nameEl = li.querySelector('.agp-pcard-name-basic');
            if (nameEl) {
                var textW = nameEl.scrollWidth;
                if (textW > pillMaxRef) textW = pillMaxRef;
                var cardW = avatarRef + Math.max(pillMinRef, textW);
                wide = (cardW + BUFFER) > columnWidth;
            } else {
                var tpl = li.querySelector('.agp-pcard-tpl');
                if (tpl) {
                    var tplW = tpl.getBoundingClientRect().width || 0;
                    wide = (tplW + BUFFER) > columnWidth;
                }
            }
            li.classList.toggle('wc-lobby-card-wide', wide);
            totalSlots += wide ? 2 : 1;
        }
        return totalSlots;
    }

    function applyDynamicLobbyCardScale() {
        var box = document.getElementById('agp-shell-box');
        if (!box || !box.classList.contains('agp-lobby-box')) return;
        var list = document.getElementById('agp-lobby-list');
        if (!list) return;
        var n = list.querySelectorAll('li').length;
        if (n === 0) return;

        var totalSlots = markWideLobbyCards(box, list);

        var BASE_ROW = 64, BASE_GAP = 10, BASE_AVATAR = 50, BASE_PILL_H = 40,
            BASE_FONT = 18, BASE_PILL_MINW = 110, BASE_PILL_MAXW = 260, BASE_ZOOM = 0.77;
        var MIN_SCALE = 0.55;

        var rows = Math.ceil(totalSlots / 3);
        var available = list.clientHeight || 620;
        var neededFull = rows * BASE_ROW + Math.max(0, rows - 1) * BASE_GAP;

        var scale = 1;
        if (neededFull > available && rows > 0) {
            scale = available / neededFull;
            if (scale < MIN_SCALE) scale = MIN_SCALE;
        }

        box.style.setProperty('--wc-lobby-avatar-size', Math.round(BASE_AVATAR * scale) + 'px');
        box.style.setProperty('--wc-lobby-pill-height', Math.round(BASE_PILL_H * scale) + 'px');
        box.style.setProperty('--wc-lobby-font-size', Math.max(14, Math.round(BASE_FONT * scale)) + 'px');
        box.style.setProperty('--wc-lobby-pill-minw', Math.round(BASE_PILL_MINW * scale) + 'px');
        box.style.setProperty('--wc-lobby-pill-maxw', Math.round(BASE_PILL_MAXW * scale) + 'px');
        box.style.setProperty('--wc-lobby-grid-gap', Math.max(4, Math.round(BASE_GAP * scale)) + 'px');
        box.style.setProperty('--wc-lobby-row-min-height', Math.round(BASE_ROW * scale) + 'px');
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
                _reviewState = {};
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
        _playerJoinedUnsub = AGP.events.on('player:joined', function () { /* لا حاجة لمنطق إضافي هنا حالياً */ });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة اسم و حيوان و نبات و جماد و بلاد',
            gameExplanation: 'يطلع حرف عربي عشوائي كل جولة. اللاعبون يكتبون بشات البث إجاباتهم للفئات المفعَّلة ' +
                '(اسم/حيوان/نبات/جماد/بلاد) اللي تبدأ بنفس الحرف، خلال الوقت المحدد. بعد انتهاء الوقت تراجع كل ' +
                'إجابة وتقبلها أو ترفضها، ويُحتسب نقطة لكل إجابة مقبولة. الفوز إما بالوصول لنقاط مستهدفة أو بعد ' +
                'عدد جولات محدد — اختيارك من الإعدادات، وتقدر تعدّل الفئات المفعَّلة بأي وقت أثناء المباراة.',
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

    /* ============ التهيئة الأولية للعناصر الثابتة (مرة واحدة عند التحميل) ============ */
    var _uiInitialized = false;
    function initStaticUi() {
        if (_uiInitialized) return;
        _uiInitialized = true;
        cacheDom();

        if (wcStartBtn) wcStartBtn.addEventListener('click', startRound);
        if (wcEndTimerBtn) wcEndTimerBtn.addEventListener('click', function () {
            clearInterval(_timerInterval);
            endCollectingPhase();
        });
        if (wcConfirmBtn) wcConfirmBtn.addEventListener('click', confirmRoundResults);
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
