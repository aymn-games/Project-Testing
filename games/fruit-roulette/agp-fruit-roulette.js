/**
 * ==========================================================================
 *  AGP FRUIT ROULETTE — "روليت الفواكه" (لعبة أصلية داخل المنصة)
 * ==========================================================================
 *
 * لعبة أصلية (Native) داخل نفس مستودع Project-Testing — بنفس نمط
 * games/elimination-roulette/agp-elimination-roulette.js بالضبط (لا نافذة
 * خارجية ولا postMessage). الفرق الوحيد: واجهتها (index.html + style.css)
 * تبقى ثابتة (Static) بدل بنائها بالكامل عبر JS، لأنها تصميم أصلي عالي
 * الجودة تم الحفاظ عليه كما هو بطلب صريح من صاحب المشروع — لا علاقة لهذا
 * بأي قاعدة بـdocs/CLAUDE.md (القاعدة تمنع لمس الملفات المشتركة، لا تفرض
 * طريقة بناء DOM داخل ملف اللعبة نفسه).
 *
 * ⚠️ التحويل من النسخة القديمة المستقلة (مستودع FruitRoulette منفصل،
 *   انضمام يدوي بكتابة أسماء بمربع نص، بدون أي اتصال ببث حقيقي):
 *   - انضمام اللاعبين صار تلقائياً بالكامل عبر AGP.gameShell (كلمة
 *     مفتاحية تُكتب بشات البث، تظهر النتيجة مباشرة باللوبي) — بدون أي
 *     كود إضافي هنا، هذا مجاني بمجرد استخدام agp-game-shell.js.
 *   - اختيار الصندوق: بدل الاعتماد على نقرة الفأرة فقط، صاحب الدور
 *     (الفائز بدورة العجلة) يكتب رقم صندوقه (١-٤) بشات البث، والنظام
 *     يتحقق أنه فعلاً نفس صاحب الدور (id/name) قبل التنفيذ — نفس آلية
 *     "اكتب رقم اللاعب بالشات" المستخدمة أصلاً بروليت الإقصاء
 *     (wireCommentListener عبر حدث stream:commentReceived)، فقط مُطبَّقة
 *     هنا على اختيار صندوق بدل اختيار لاعب. النقر اليدوي على الصندوق
 *     يبقى شغّالاً أيضاً (نفس فلسفة "مدخلين متوازيين" الموجودة أصلاً
 *     بنافذة اختيار الإقصاء بروليت الإقصاء) — مفيد للمضيف وقت الاختبار.
 *   - رقم كل صندوق (المطبوع بوضوح على واجهته الأمامية) هو نفسه الرقم
 *     المطلوب كتابته بالشات — لا علاقة له بكونه آمناً أو "الشخصية
 *     الخفية"؛ فقط معرّف ثابت لموضع الصندوق.
 *   - الإقصاء داخل اللعبة (فتح صندوق "الشخصية الخفية") لا يساوي حذف
 *     اللاعب من قائمة AGP العامة — نفس فصل المفهومين المتّبع بروليت
 *     الإقصاء (مصفوفة _alive داخلية خاصة باللعبة، تستمع لـ
 *     player:removed فقط للحذف الإداري الحقيقي من شاشة الإعدادات).
 *   - منطق اللعبة الفريد (دوران العجلة، صناديق الفواكه الأربعة + صندوق
 *     "الشخصية الخفية"، مؤقت الجولة المتصاعد الصعوبة) محفوظ كما هو تقريباً
 *     من النسخة الأصلية — لم يُعَد كتابته من الصفر.
 *   - نظام النقاط: بدون أي تغيير — نفس النظام العام الموحّد للمنصة
 *     (window.AGPAuth.reportRoundCompletion)، بدون قيم مخصّصة لهذي اللعبة.
 *
 * ⚠️ قرارات مبدئية اتُّخذت بدون رجوع فردي لكل نقطة (مذكورة صراحة للمراجعة،
 *   عدّلها متى ما احتجت):
 *   - category: 'roulette-games' (نفس تصنيف روليت القبائل، بما أن كلتيهما
 *     عجلة). يمكن تغييرها لاحقاً بسهولة، حقل واحد فقط.
 *   - إعدادات المباراة المتاحة حالياً: الحد الأقصى للاعبين، ومدة الجولة
 *     (تتحكم بمؤقت تصاعد صعوبة الصناديق). "متابعين فقط" لم تُضَف عمداً —
 *     الفلترة نفسها مدعومة مركزياً (adapters/agp-tiktok-adapter.js) وستعمل
 *     تلقائياً بمجرد إضافة الحقل لاحقاً لو احتجتها.
 *   - لا مؤقّت إجباري لاختيار الصندوق (يبقى مفتوحاً لحين الاختيار، تماماً
 *     كسلوك النسخة الأصلية) — لم يُطلَب تغيير هذا الجزء تحديداً.
 *
 * الاعتماديات (بنفس ترتيب index.html القياسي، راجع docs/CLAUDE.md):
 *   js/agp-core.js … js/agp-bootstrap.js (AGP Core كامل)، ثم
 *   js/agp-player-card.js، js/agp-entrance.js، js/agp-game-shell.js، ثم
 *   هذا الملف.
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.log) { AGP.log = function () {}; }
    if (!AGP.events) { AGP.events = { emit: function () {}, on: function () { return function () {}; } }; }

    var GAME_ID = 'fruit-roulette';
    var GAME_NAME = 'روليت الفواكه';
    var CRATE_COUNT = 4;
    var POPUP_TIME_PENALTY = 10; // ثوانٍ تُخصَم فوراً كل ما فُتح صندوق

    var PALETTE = ['#FF4D6D', '#FFA630', '#8BD450', '#9B6BF2', '#FFD23F', '#35C98D'];

    // صناديق الفواكه الآمنة. عدّل/وسّع بحرية — فقط حافظ على مطابقة أسماء
    // الملفات بمجلد folder_images/ (غير مرفوعة بعد — fallback إيموجي شغّال).
    var SAFE_FRUITS = [
        { name: 'تفاح', img: 'folder_images/apple.png', emoji: '🍎' },
        { name: 'موز', img: 'folder_images/banana.png', emoji: '🍌' },
        { name: 'عنب', img: 'folder_images/grape.png', emoji: '🍇' },
        { name: 'برتقال', img: 'folder_images/orange.png', emoji: '🍊' },
        { name: 'أناناس', img: 'folder_images/pineapple.png', emoji: '🍍' },
        { name: 'فراولة', img: 'folder_images/strawberry.png', emoji: '🍓' },
        { name: 'كيوي', img: 'folder_images/kiwi.png', emoji: '🥝' }
    ];

    var HIDDEN_CHARACTER = {
        name: 'الشخصية الخفية',
        img: 'folder_images/hidden_character.png',
        emoji: '💀'
    };

    var ROUND_DURATION_OPTIONS = [
        { label: 'دقيقتين', value: 120 },
        { label: '4 دقائق', value: 240 },
        { label: '6 دقائق', value: 360 },
        { label: '8 دقائق', value: 480 }
    ];

    /* ============ الحالة ============ */
    var _settings = {};
    var _alive = [];              // لاعبو المباراة الحاليون (كائنات AGP: id/name/avatarUrl)
    var _colorMap = {};           // player.id -> لون ثابت طول المباراة
    var _isSpinning = false;
    var _currentRotation = 0;
    var _muted = false;
    var _activeWinner = null;     // صاحب الدور الحالي (بانتظار اختيار صندوق)
    var _crateData = [];          // [{ isHidden, content }] لكل صندوق بالجولة الحالية
    var _crateResolved = false;
    var _matchActive = false;
    var _startedAt = 0;

    var _commentUnsub = null;
    var _playerRemovedUnsub = null;

    /* ============ مراجع DOM (الصفحة ثابتة — العناصر موجودة من البداية) ============ */
    function el(id) { return document.getElementById(id); }

    var frGameRoot, spinBtn, shuffleBtn, resetWheelBtn, playerListEl, playerCountVal;
    var currentTurnName, wheel, wheelEmpty, wheelRing, hub, hubImg, hubFallback;
    var winnerStrip, winnerStripName;
    var fruitOverlay, fruitPopupPlayer, crateGrid, crateResult, resultText, continueBtn, eliminateBtn, fruitModalSub;
    var winnerOverlay, winnerNameEl, rematchBtn, newGameBtn;
    var soundBtn, soundIcon, liveRegion, roundCounterVal, fruitBg, roundTimerBox, roundTimerVal;

    function cacheDom() {
        frGameRoot = el('frGameRoot');
        spinBtn = el('spinBtn');
        shuffleBtn = el('shuffleBtn');
        resetWheelBtn = el('resetWheelBtn');
        playerListEl = el('playerList');
        playerCountVal = el('playerCountVal');

        currentTurnName = el('currentTurnName');
        wheel = el('wheel');
        wheelEmpty = el('wheelEmpty');
        wheelRing = el('wheelRing');
        hub = el('hub');
        hubImg = el('hubImg');
        hubFallback = el('hubFallback');

        winnerStrip = el('winnerStrip');
        winnerStripName = el('winnerStripName');

        fruitOverlay = el('fruitOverlay');
        fruitPopupPlayer = el('fruitPopupPlayer');
        crateGrid = el('crateGrid');
        crateResult = el('crateResult');
        resultText = el('resultText');
        continueBtn = el('continueBtn');
        eliminateBtn = el('eliminateBtn');
        fruitModalSub = el('fruitModalSub');

        winnerOverlay = el('winnerOverlay');
        winnerNameEl = el('winnerName');
        rematchBtn = el('rematchBtn');
        newGameBtn = el('newGameBtn');

        soundBtn = el('soundBtn');
        soundIcon = el('soundIcon');
        liveRegion = el('liveRegion');
        roundCounterVal = el('roundCounterVal');
        fruitBg = el('fruitBg');
        roundTimerBox = el('roundTimerBox');
        roundTimerVal = el('roundTimerVal');
    }

    /* ============ IMAGE FALLBACK ============ */
    function bindImageFallback(imgEl, fallbackEl) {
        function showFallback() { imgEl.hidden = true; if (fallbackEl) fallbackEl.hidden = false; }
        function showImage() { imgEl.hidden = false; if (fallbackEl) fallbackEl.hidden = true; }
        imgEl.addEventListener('error', showFallback);
        imgEl.addEventListener('load', showImage);
        if (imgEl.complete) { if (imgEl.naturalWidth === 0) showFallback(); else showImage(); }
    }

    /* ============ SOUND (Web Audio API) ============ */
    var audioCtx = null;
    function getCtx() {
        if (!audioCtx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            audioCtx = new AC();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        return audioCtx;
    }

    function tone(freq, duration, type, gainPeak, delay) {
        if (_muted) return;
        try {
            var ctx = getCtx();
            var startAt = ctx.currentTime + (delay || 0);
            var osc = ctx.createOscillator();
            var gain = ctx.createGain();
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, startAt);
            gain.gain.setValueAtTime(0.0001, startAt);
            gain.gain.exponentialRampToValueAtTime(gainPeak || 0.12, startAt + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(startAt);
            osc.stop(startAt + duration + 0.02);
        } catch (e) { /* الصوت غير متاح — تجاهل بصمت */ }
    }

    function playClick() { tone(720, 0.06, 'square', 0.08); }
    function playTick() { tone(560, 0.05, 'square', 0.07); }
    function playChime() {
        tone(523.25, 0.22, 'sine', 0.12, 0);
        tone(659.25, 0.22, 'sine', 0.12, 0.1);
        tone(783.99, 0.3, 'sine', 0.14, 0.2);
    }
    function playBoom() {
        tone(120, 0.35, 'sawtooth', 0.16, 0);
        tone(70, 0.4, 'sine', 0.18, 0.04);
    }

    function scheduleSpinTicks(totalDurationMs) {
        var elapsed = 0;
        var delay = 55;
        function step() {
            if (elapsed >= totalDurationMs - 150) return;
            playTick();
            delay = Math.min(delay * 1.09, 260);
            elapsed += delay;
            setTimeout(step, delay);
        }
        step();
    }

    function wireSoundButton() {
        soundBtn.addEventListener('click', function () {
            _muted = !_muted;
            soundBtn.setAttribute('aria-pressed', String(_muted));
            soundIcon.textContent = _muted ? '🔇' : '🔊';
            soundBtn.querySelector('.btn-label').textContent = _muted ? 'الصوت مغلق' : 'الصوت مفعّل';
            if (!_muted) getCtx();
        });
    }

    /* ============ خلفية الفواكه الطائرة ============ */
    var BG_FRUITS = ['🍉', '🍓', '🍇', '🍍', '🍌', '🍊', '🥝', '🍒', '🍑'];
    function buildFruitBackground() {
        if (!fruitBg) return;
        var count = 18;
        for (var i = 0; i < count; i++) {
            var e = document.createElement('span');
            e.textContent = BG_FRUITS[Math.floor(Math.random() * BG_FRUITS.length)];
            var left = Math.random() * 100;
            var duration = 14 + Math.random() * 16;
            var delay = Math.random() * -30;
            var size = 1.4 + Math.random() * 1.6;
            var drift = (Math.random() * 160 - 80) + 'px';
            e.style.left = left + 'vw';
            e.style.fontSize = size + 'rem';
            e.style.animationDuration = duration + 's';
            e.style.animationDelay = delay + 's';
            e.style.setProperty('--drift', drift);
            fruitBg.appendChild(e);
        }
    }

    /* ============ عداد الجولات ============ */
    var roundCount = 0;
    function incrementRoundCounter() {
        roundCount += 1;
        if (roundCounterVal) roundCounterVal.textContent = String(roundCount);
    }
    function resetRoundCounter() {
        roundCount = 0;
        if (roundCounterVal) roundCounterVal.textContent = '0';
    }

    /* ============ مؤقت الجولة (تصاعد صعوبة الصناديق) — نفس منطق النسخة
       الأصلية بالكامل، فقط المدة الآن تُقرأ من إعدادات المباراة. ============ */
    var _roundDuration = 240;
    var roundTimerRemaining = 240;
    var roundTimerInterval = null;
    var roundTimerStarted = false;
    var eliminationLevel = 1;

    function formatTime(totalSeconds) {
        var sec = Math.max(0, totalSeconds);
        var m = Math.floor(sec / 60);
        var s = sec % 60;
        return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
    }

    function updateTimerDisplay() {
        if (roundTimerVal) roundTimerVal.textContent = formatTime(roundTimerRemaining);
        if (roundTimerBox) roundTimerBox.classList.toggle('urgent', roundTimerRemaining > 0 && roundTimerRemaining <= 30);
    }

    function stopRoundTimerInterval() {
        if (roundTimerInterval) { window.clearInterval(roundTimerInterval); roundTimerInterval = null; }
        if (roundTimerBox) roundTimerBox.classList.add('paused');
    }

    function startRoundTimerInterval() {
        stopRoundTimerInterval();
        if (roundTimerBox) roundTimerBox.classList.remove('paused');
        roundTimerInterval = window.setInterval(tickRoundTimer, 1000);
    }

    function tickRoundTimer() {
        if (roundTimerRemaining <= 0) { handleTimerExpire(); return; }
        roundTimerRemaining -= 1;
        updateTimerDisplay();
        if (roundTimerRemaining <= 0) handleTimerExpire();
    }

    function handleTimerExpire() {
        var maxHidden = CRATE_COUNT - 1;
        if (eliminationLevel < maxHidden) {
            eliminationLevel += 1;
            if (liveRegion) liveRegion.textContent = 'ارتفعت صعوبة الجولة! الآن ' + eliminationLevel + ' من الصناديق تخفي الشخصية.';
        }
        roundTimerRemaining = _roundDuration;
        updateTimerDisplay();
    }

    function onFruitPopupOpen() {
        if (!roundTimerStarted) { roundTimerStarted = true; roundTimerRemaining = _roundDuration; }
        stopRoundTimerInterval();
        roundTimerRemaining = Math.max(0, roundTimerRemaining - POPUP_TIME_PENALTY);
        updateTimerDisplay();
        if (roundTimerRemaining <= 0) handleTimerExpire();
    }

    function onFruitPopupClose() {
        if (!roundTimerStarted) return;
        if (_alive.length < 2) return;
        startRoundTimerInterval();
    }

    function resetRoundTimer() {
        stopRoundTimerInterval();
        roundTimerStarted = false;
        roundTimerRemaining = _roundDuration;
        eliminationLevel = 1;
        updateTimerDisplay();
        if (roundTimerBox) roundTimerBox.classList.remove('paused', 'urgent');
    }

    /* ============ قائمة اللاعبين (مصدرها AGP الحي — لا إدخال يدوي) ============ */
    function colorFor(player) {
        if (!_colorMap[player.id]) {
            var idx = Object.keys(_colorMap).length;
            _colorMap[player.id] = PALETTE[idx % PALETTE.length];
        }
        return _colorMap[player.id];
    }

    function renderPlayerList() {
        playerListEl.innerHTML = '';

        if (_alive.length === 0) {
            var note = document.createElement('div');
            note.className = 'empty-note';
            note.textContent = 'لا يوجد لاعبون حالياً.';
            playerListEl.appendChild(note);
        } else {
            _alive.forEach(function (p) {
                var row = document.createElement('div');
                row.className = 'player-chip';
                row.style.setProperty('--chip-color', colorFor(p));
                row.innerHTML = AGP.playerCard
                    ? AGP.playerCard.renderHtml(p, { showFrame: false })
                    : '<span>' + (p.name || p.id) + '</span>';
                playerListEl.appendChild(row);
            });
            if (AGP.playerCard) AGP.playerCard.fitAllNames(playerListEl);
        }

        playerCountVal.textContent = String(_alive.length);
        spinBtn.disabled = _alive.length < 2 || _isSpinning;
    }

    function shufflePlayers() {
        if (_isSpinning || _alive.length < 2) return;
        for (var i = _alive.length - 1; i > 0; i--) {
            var j = Math.floor(Math.random() * (i + 1));
            var tmp = _alive[i]; _alive[i] = _alive[j]; _alive[j] = tmp;
        }
        renderPlayerList();
        buildWheel();
        playClick();
    }

    /* ============ إقصاء/حذف لاعب من المباراة (محلي فقط — لا يمس قائمة AGP العامة) ============ */
    function eliminateFromMatch(playerId) {
        _alive = _alive.filter(function (p) { return p.id !== playerId; });
        renderPlayerList();
        buildWheel();
        checkGameOver();
    }

    // ⚠️ حذف إداري حقيقي (زر 🗑️ بشاشة الإعدادات أثناء المباراة —
    // js/agp-game-shell.js عبر AGP.player.removePlayer، يبث player:removed)
    // — منفصل تماماً عن إقصاء اللعبة نفسها (صندوق الشخصية الخفية).
    function handlePlayerRemoved(removedPlayer) {
        if (!removedPlayer || !removedPlayer.id) return;
        var existed = _alive.some(function (p) { return p.id === removedPlayer.id; });
        if (!existed) return;

        _alive = _alive.filter(function (p) { return p.id !== removedPlayer.id; });
        renderPlayerList();
        buildWheel();

        // لو كان هو صاحب الدور نفسه وسط اختيار صندوق مفتوح، نغلق النافذة
        // بدون تنفيذ أي اختيار بدل ترك حالة غير متّسقة.
        if (_activeWinner && _activeWinner.id === removedPlayer.id) {
            closeFruitPopup();
        }
        checkGameOver();
    }

    /* ============ بناء العجلة ============ */
    function snapWheelTo(deg) {
        wheel.style.transition = 'none';
        wheel.style.transform = 'rotate(' + deg + 'deg)';
        void wheel.offsetWidth;
        wheel.style.transition = '';
    }

    function resetWheelPosition() {
        if (_isSpinning) return;
        _currentRotation = 0;
        _activeWinner = null;
        snapWheelTo(0);
        currentTurnName.textContent = '—';
        playClick();
    }

    function buildWheel() {
        wheel.innerHTML = '';
        var n = _alive.length;

        if (n < 2) {
            var msg = document.createElement('div');
            msg.className = 'wheel-empty';
            msg.id = 'wheelEmpty';
            msg.textContent = n === 1 ? 'بقي لاعب واحد — إنه الفائز! 🏆' : 'بانتظار انضمام لاعبين اثنين على الأقل 🍓';
            wheel.appendChild(msg);
            wheel.style.background = 'rgba(255,255,255,0.03)';
            buildBulbs();
            return;
        }

        var segAngle = 360 / n;
        var gradientParts = [];
        _alive.forEach(function (p, i) {
            var start = (segAngle * i).toFixed(3);
            var end = (segAngle * (i + 1)).toFixed(3);
            gradientParts.push(colorFor(p) + ' ' + start + 'deg ' + end + 'deg');
        });
        wheel.style.background = 'conic-gradient(from 0deg, ' + gradientParts.join(', ') + ')';

        _alive.forEach(function (p, i) {
            var midAngle = segAngle * i + segAngle / 2;
            var labelWrap = document.createElement('div');
            labelWrap.className = 'wheel-label';
            labelWrap.style.transform = 'rotate(' + midAngle + 'deg)';
            var span = document.createElement('span');
            span.textContent = p.name || p.id;
            labelWrap.appendChild(span);
            wheel.appendChild(labelWrap);
        });

        buildBulbs();
    }

    function buildBulbs() {
        var existing = wheelRing.querySelectorAll('.bulb');
        existing.forEach(function (b) { b.remove(); });

        var count = 26;
        var radius = 50;
        for (var i = 0; i < count; i++) {
            var angle = (360 / count) * i;
            var rad = angle * Math.PI / 180;
            var x = 50 + radius * Math.sin(rad);
            var y = 50 - radius * Math.cos(rad);
            var bulb = document.createElement('div');
            bulb.className = 'bulb';
            bulb.style.left = 'calc(' + x + '% - 4.5px)';
            bulb.style.top = 'calc(' + y + '% - 4.5px)';
            bulb.style.animationDelay = (i * 0.06) + 's';
            bulb.style.background = i % 3 === 0 ? 'var(--watermelon)' : (i % 3 === 1 ? 'var(--lime)' : 'var(--banana)');
            wheelRing.appendChild(bulb);
        }
    }

    /* ============ الدوران + اختيار الفائز عشوائياً ============ */
    var _spinTimeout = null;
    function spin() {
        if (_isSpinning || _alive.length < 2) return;

        _isSpinning = true;
        spinBtn.disabled = true;
        currentTurnName.textContent = '…';
        getCtx();

        var n = _alive.length;
        var winnerIndex = Math.floor(Math.random() * n);
        var winner = _alive[winnerIndex];
        var segAngle = 360 / n;
        var thetaCenter = segAngle * winnerIndex + segAngle / 2;

        var extraSpins = 6 + Math.floor(Math.random() * 3);
        var currentMod = _currentRotation % 360;
        var target = extraSpins * 360 + (360 - thetaCenter);
        var newRotation = _currentRotation - currentMod + target;

        _currentRotation = newRotation;
        wheel.style.transform = 'rotate(' + newRotation + 'deg)';

        scheduleSpinTicks(4600);

        window.clearTimeout(_spinTimeout);
        _spinTimeout = window.setTimeout(function () {
            _isSpinning = false;
            _activeWinner = winner;
            currentTurnName.textContent = winner.name || winner.id;
            if (liveRegion) liveRegion.textContent = 'اختارت العجلة ' + (winner.name || winner.id) + '.';
            incrementRoundCounter();
            playChime();
            openFruitPopup(winner);
            spinBtn.disabled = _alive.length < 2;
        }, 4650);
    }

    /* ============ نافذة صندوق الفواكه ============
       ⚠️ رقم كل صندوق (١-٤) ثابت بترتيب موضعه، وهو نفسه الرقم المطلوب
       كتابته بشات البث. لا علاقة للرقم بمحتوى الصندوق (آمن/خفي). */
    function pickSafeFruits(count) {
        var pool = SAFE_FRUITS.slice().sort(function () { return Math.random() - 0.5; });
        var picked = [];
        for (var i = 0; i < count; i++) picked.push(pool[i % pool.length]);
        return picked;
    }

    function openFruitPopup(winner) {
        onFruitPopupOpen();

        fruitPopupPlayer.textContent = winner.name || winner.id;
        crateResult.classList.remove('show');
        resultText.textContent = '';
        continueBtn.hidden = true;
        eliminateBtn.hidden = true;
        _crateResolved = false;

        var hiddenCount = Math.min(eliminationLevel, CRATE_COUNT - 1);
        var hiddenIndices = [];
        while (hiddenIndices.length < hiddenCount) {
            var idx = Math.floor(Math.random() * CRATE_COUNT);
            if (hiddenIndices.indexOf(idx) === -1) hiddenIndices.push(idx);
        }

        if (fruitModalSub) {
            fruitModalSub.textContent = 'اكتب رقم الصندوق بشات البث — أنت فقط يا ' + (winner.name || winner.id) + ' تقدر تختار الآن (أو اضغطه مباشرة).';
        }

        var safeFruits = pickSafeFruits(CRATE_COUNT - hiddenCount);
        _crateData = [];
        crateGrid.innerHTML = '';
        var fruitCursor = 0;

        for (var i = 0; i < CRATE_COUNT; i++) {
            var isHidden = hiddenIndices.indexOf(i) !== -1;
            var content = isHidden ? HIDDEN_CHARACTER : safeFruits[fruitCursor++];
            _crateData.push({ isHidden: isHidden, content: content });

            var crate = document.createElement('button');
            crate.className = 'crate';
            crate.type = 'button';
            crate.setAttribute('aria-label', 'الصندوق رقم ' + (i + 1));
            crate.dataset.index = String(i);

            var inner = document.createElement('div');
            inner.className = 'crate-inner';

            var front = document.createElement('div');
            front.className = 'crate-face crate-front';
            front.innerHTML = '<span class="crate-num">' + (i + 1) + '</span><span class="crate-label">اكتب الرقم بالشات</span>';

            var back = document.createElement('div');
            back.className = 'crate-face crate-back ' + (isHidden ? 'is-hidden' : 'is-safe');

            var img = document.createElement('img');
            img.src = content.img;
            img.alt = content.name;
            var emojiFallback = document.createElement('span');
            emojiFallback.className = 'crate-emoji';
            emojiFallback.textContent = content.emoji;
            emojiFallback.hidden = true;
            back.appendChild(img);
            back.appendChild(emojiFallback);
            bindImageFallback(img, emojiFallback);

            inner.appendChild(front);
            inner.appendChild(back);
            crate.appendChild(inner);

            crate.addEventListener('click', function () {
                var i2 = parseInt(this.getAttribute('data-index'), 10);
                resolveCrateSelection(i2);
            });

            crateGrid.appendChild(crate);
        }

        fruitOverlay.classList.add('active');
    }

    /**
     * ⚠️ نقطة دخول واحدة لكلا مدخلي الاختيار (نقرة يدوية أو رقم بالشات)
     * — تُستدعى فقط بفهرس الصندوق (0-based)، بعد التحقق من الهوية إن كان
     * المصدر شات البث (راجع wireCommentListener أدناه).
     * @param {number} index
     */
    function resolveCrateSelection(index) {
        if (_crateResolved || !_crateData[index]) return;
        var crateEl = crateGrid.querySelector('.crate[data-index="' + index + '"]');
        if (!crateEl || crateEl.disabled) return;
        handleCrateClick(crateEl, _crateData[index].isHidden, _crateData[index].content);
    }

    function handleCrateClick(crateEl, isHidden, content) {
        if (_crateResolved) return;
        _crateResolved = true;

        playClick();

        var all = crateGrid.querySelectorAll('.crate');
        all.forEach(function (c) { c.disabled = true; });
        crateEl.classList.add('flipped');

        window.setTimeout(function () {
            if (isHidden) {
                playBoom();
                resultText.className = 'result-text danger';
                resultText.textContent = '💀 ' + content.name + '! تم إقصاء ' + (_activeWinner.name || _activeWinner.id) + '!';
                eliminateBtn.hidden = false;
                continueBtn.hidden = true;
                if (liveRegion) liveRegion.textContent = 'تم إقصاء ' + (_activeWinner.name || _activeWinner.id) + '.';
            } else {
                playChime();
                resultText.className = 'result-text safe';
                resultText.textContent = '🍉 آمن! ' + (_activeWinner.name || _activeWinner.id) + ' ينجو من هذه الجولة.';
                continueBtn.hidden = false;
                eliminateBtn.hidden = true;
                if (liveRegion) liveRegion.textContent = (_activeWinner.name || _activeWinner.id) + ' بأمان.';
            }
            crateResult.classList.add('show');
        }, 650);
    }

    function closeFruitPopup() {
        fruitOverlay.classList.remove('active');
        _activeWinner = null;
        _crateData = [];
        onFruitPopupClose();
    }

    /* ============ الاستماع لشات البث — رقم الصندوق فقط من صاحب الدور ============ */
    function wireCommentListener() {
        _commentUnsub = AGP.events.on('stream:commentReceived', function (payload) {
            if (!_activeWinner || _crateResolved || !payload || typeof payload.text !== 'string') return;

            // تحقّق صريح: نفس صاحب الدور فقط (id أو name)، لا أي شخص آخر.
            if (payload.id !== _activeWinner.id && payload.name !== _activeWinner.name) return;

            var n = parseInt(payload.text.trim(), 10);
            if (isNaN(n) || n < 1 || n > CRATE_COUNT) return;

            resolveCrateSelection(n - 1);
        });
    }

    /* ============ نهاية اللعبة / الفائز ============ */
    function checkGameOver() {
        if (_alive.length === 1) {
            endMatch(_alive[0]);
        } else if (_alive.length === 0) {
            winnerStrip.classList.remove('show');
        }
    }

    function endMatch(champion) {
        _matchActive = false;
        winnerStripName.textContent = champion.name || champion.id;
        winnerStrip.classList.add('show');
        spinBtn.disabled = true;
        stopRoundTimerInterval();
        if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }

        var durationMs = _startedAt ? (Date.now() - _startedAt) : 0;
        var pointsPromise = Promise.resolve(null);

        if (window.AGPAuth && typeof window.AGPAuth.reportRoundCompletion === 'function') {
            var allPlayers = AGP.gameManager.getPlayers();
            var participants = allPlayers.map(function (p) {
                var id = (p && p.id) || '';
                var uname = id.indexOf('tiktok:') === 0 ? id.slice('tiktok:'.length) : (p.name || p.id);
                return { tiktokUsername: uname, won: p.id === champion.id };
            }).filter(function (p) { return p.tiktokUsername; });

            if (participants.length) {
                pointsPromise = window.AGPAuth.reportRoundCompletion(participants, durationMs).catch(function () { return null; });
            }
        }

        AGP.events.emit('game:roundEnded', { id: GAME_ID });
        pointsPromise.then(function () {
            openWinnerModal(champion);
        });
    }

    function openWinnerModal(champion) {
        winnerNameEl.textContent = champion.name || champion.id;
        if (liveRegion) liveRegion.textContent = (champion.name || champion.id) + ' فاز باللعبة!';
        winnerOverlay.classList.add('active');
        playChime();
    }

    function closeWinnerModal() { winnerOverlay.classList.remove('active'); }

    /* ============ مباراة جديدة / إعادة الجولة ============ */
    function newGame() {
        // يعيد فتح شاشة الإعدادات العامة من جديد (نفس مسار "مباراة جديدة"
        // بروليت الإقصاء) — يبث game:reset ويستدعي onDestroy تلقائياً.
        AGP.gameManager.resetSession();
    }

    function rematchRound() {
        if (!AGP.gameManager) return;
        var roster = AGP.gameManager.getPlayers().slice();
        if (roster.length < 2) return;

        _alive = roster;
        _colorMap = {};
        _isSpinning = false;
        _activeWinner = null;
        _currentRotation = 0;
        _startedAt = Date.now();
        _matchActive = true;

        winnerStrip.classList.remove('show');
        closeWinnerModal();
        snapWheelTo(0);
        currentTurnName.textContent = '—';
        if (liveRegion) liveRegion.textContent = 'بدأت جولة جديدة — عاد الجميع إلى اللعب!';
        resetRoundCounter();
        resetRoundTimer();
        renderPlayerList();
        buildWheel();
        wireCommentListener();

        AGP.events.emit('game:roundStarted', { id: GAME_ID });
    }

    /* ============ بدء المباراة فعلياً (تُستدعى من agp-game-shell.js بعد
       ضغط المضيف "ابدأ" بشاشة الإعدادات) ============ */
    function handleStartRound(settingsValues) {
        _settings = settingsValues || {};
        _roundDuration = _settings.roundDurationMinutes ? Number(_settings.roundDurationMinutes) : 240;

        _alive = AGP.gameManager.getPlayers().slice();
        _colorMap = {};
        _isSpinning = false;
        _currentRotation = 0;
        _activeWinner = null;
        _startedAt = Date.now();
        _matchActive = true;

        frGameRoot.style.display = '';
        winnerStrip.classList.remove('show');
        closeWinnerModal();
        snapWheelTo(0);
        currentTurnName.textContent = '—';
        resetRoundCounter();
        resetRoundTimer();
        renderPlayerList();
        buildWheel();
        wireCommentListener();
    }

    /* ============ الحد الأقصى للاعبين — نفس آلية روليت الإقصاء تماماً ============ */
    function enforceMaxPlayers() {
        if (!AGP.gameShell) return;
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

    /* ============ التسجيل بالمنصة ============ */
    function buildSettingsFields() {
        return [
            { key: 'maxPlayers', type: 'counter', label: '👥 الحد الأقصى لعدد اللاعبين بالمباراة', min: 2, default: 20 },
            { key: 'roundDurationMinutes', type: 'pill-group', label: '⏱️ مدة تصاعد صعوبة الصناديق', options: ROUND_DURATION_OPTIONS, default: 240 }
        ];
    }

    function registerGame() {
        var registered = AGP.gameManager.registerGame({
            id: GAME_ID,
            name: GAME_NAME,
            category: 'roulette-games',

            onLoad: function () { AGP.log('Fruit Roulette: onLoad.'); },
            onPlayerJoin: function () { enforceMaxPlayers(); },
            onRoundEnd: function () { AGP.log('Fruit Roulette: onRoundEnd.'); },
            onDestroy: function () {
                _matchActive = false;
                _alive = [];
                _activeWinner = null;
                if (typeof _commentUnsub === 'function') { _commentUnsub(); _commentUnsub = null; }
                if (frGameRoot) frGameRoot.style.display = 'none';
                AGP.log('Fruit Roulette: onDestroy — match state cleared.');
            }
        });

        if (!registered) {
            AGP.log('Fruit Roulette: registration failed (already registered?).');
            return;
        }

        AGP.gameManager.loadGame(GAME_ID);

        _playerRemovedUnsub = AGP.events.on('player:removed', function (payload) {
            handlePlayerRemoved(payload && payload.player);
        });

        AGP.gameShell.init({
            gameId: GAME_ID,
            gameTitle: GAME_NAME,
            settingsTitle: 'إعدادات مباراة روليت الفواكه',
            gameExplanation: 'تدور العجلة وتتوقف عند أحد اللاعبين — يفتح صندوقاً من أربعة بكتابة رقمه (١-٤) في شات ' +
                'البث (هو فقط، وقت دوره). ثلاثة صناديق آمنة تحتوي فاكهة، وواحد أو أكثر يخفي "الشخصية الخفية" ويقصي ' +
                'صاحب الدور. عدد الصناديق المخفية يرتفع تدريجياً كل ما انتهى مؤقت الجولة. تستمر المباراة حتى يبقى لاعب واحد.',
            connectButtonLabel: 'اتصال بالبث وبدء الإعدادات',
            minPlayersToStart: 2,
            logoImage: '../../logo.png',
            homeUrl: '../../index.html',
            assetBasePath: '../../',
            settingsFields: buildSettingsFields(),
            onStartRound: handleStartRound
        });
    }

    /* ============ التهيئة الأولية للعناصر الثابتة (مرة واحدة عند التحميل) ============ */
    var _uiInitialized = false;
    function initStaticUi() {
        if (_uiInitialized) return;
        _uiInitialized = true;
        cacheDom();
        bindImageFallback(hubImg, hubFallback);
        buildFruitBackground();
        wireSoundButton();

        spinBtn.addEventListener('click', spin);
        shuffleBtn.addEventListener('click', shufflePlayers);
        resetWheelBtn.addEventListener('click', resetWheelPosition);

        continueBtn.addEventListener('click', function () { playClick(); closeFruitPopup(); });
        eliminateBtn.addEventListener('click', function () {
            playClick();
            if (_activeWinner) eliminateFromMatch(_activeWinner.id);
            closeFruitPopup();
        });
        fruitOverlay.addEventListener('click', function (e) {
            if (e.target === fruitOverlay && crateResult.classList.contains('show')) closeFruitPopup();
        });

        newGameBtn.addEventListener('click', function () { playClick(); newGame(); });
        rematchBtn.addEventListener('click', function () { playClick(); rematchRound(); });

        renderPlayerList();
        buildWheel();
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
