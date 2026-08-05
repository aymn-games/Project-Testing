/**
 * ==========================================================================
 *  AGP GAME SHELL — وحدة مشتركة قابلة لإعادة الاستخدام لكل الألعاب
 * ==========================================================================
 *
 * ⚠️ قرار معماري: كل لعبة تحمّل هذا الملف بنفسها (مع AGP Core كاملاً
 *   قبله) وتُدير هي نفسها دورة إعدادات/اتصال/لوبي/بدء الجولة.
 *
 * لا تعديل على AGP Core — يستخدم فقط الواجهات العامة الموجودة أصلاً.
 *
 * ⚠️ الأيقونات: تُمرَّر كمسار نسبي (icon: 'icons/xxx.png') من كل لعبة —
 *   لا أيقونات مضمَّنة بهذا الملف نفسه، حتى يبقى عاماً لأي لعبة بأيقوناتها
 *   الخاصة. الأيقونتان gear.svg (زر الإعدادات بالهيدر) وأي أيقونة حقل
 *   تُحمَّل من مجلد اللعبة نفسها (icons/) عبر _config.headerGearIcon
 *   و field.icon.
 *
 * أنواع حقول الإعدادات: 'pill-choice' (خياران)، 'pill-group' (أكثر)،
 *   'counter' (+/-)، 'toggle' (توافق قديم). كل حقل يقبل icon (مسار صورة)
 *   و showWhen:{key,equals} (رؤية شرطية).
 * ==========================================================================
 */

window.AymanGamesPlatform = window.AymanGamesPlatform || {};

(function (AGP) {
    'use strict';

    if (!AGP.gameManager || !AGP.streamConnector || !AGP.keywordManager) {
        console.error('[AGP Game Shell] AGP Core not loaded yet — load js/agp-core.js and friends first.');
        return;
    }

    var _config = null;
    var _overlayEl = null;
    var _settingsValues = {};
    var _lastKeyword = '';

    function el(id) { return document.getElementById(id); }

    function injectStyles() {
        var style = document.createElement('style');
        style.textContent = [
            'body.agp-shell-active{background:linear-gradient(170deg,#0b0616 0%,#2a0e3d 55%,#6d1fb0 100%);',
            'background-attachment:fixed;background-size:cover;min-height:100vh;}',

            '#agp-persistent-header{position:fixed;top:0;left:0;right:0;z-index:99998;display:flex;',
            'align-items:center;justify-content:space-between;padding:10px 20px;',
            'background:linear-gradient(90deg,rgba(20,8,35,0.9),rgba(60,15,90,0.85));',
            'border-bottom:1px solid rgba(216,120,255,0.3);font-family:Cairo,sans-serif;direction:rtl;}',
            '.agp-header-icon-btn{width:34px;height:34px;border-radius:50%;border:1px solid rgba(216,120,255,0.4);',
            'background:rgba(255,255,255,0.06);color:#fff;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
            '.agp-header-icon-btn img{width:16px;height:16px;filter:invert(1);}',
            '#agp-header-title{background:rgba(0,0,0,0.35);border-radius:999px;padding:6px 22px;color:#e9d3ff;font-weight:700;font-size:0.9em;}',
            '#agp-header-brand{color:#fff;font-weight:800;display:flex;align-items:center;gap:8px;}',
            '#agp-header-brand .agp-brand-badge{width:28px;height:28px;border-radius:8px;',
            'background:linear-gradient(90deg,#22d3ee,#d878ff);display:inline-flex;align-items:center;justify-content:center;',
            'color:#0b0616;font-weight:800;}',
            '#agp-sponsor-banner{position:fixed;top:64px;right:20px;z-index:99997;width:300px;height:90px;',
            'border:1px dashed rgba(216,120,255,0.4);border-radius:10px;display:none;',
            'align-items:center;justify-content:center;color:#c9a8e0;font-size:0.8em;background:rgba(20,8,35,0.5);}',

            /* شاشة الإعدادات */
            '#agp-shell-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
            'padding:80px 16px 16px;background:rgba(8,4,16,0.55);font-family:Cairo,sans-serif;color:#2c1240;direction:rtl;}',
            '#agp-shell-box{width:min(460px,94vw);max-height:82vh;overflow-y:auto;',
            'background:linear-gradient(180deg,#efe0fb,#e2c7f7);border:2px solid #9b3fe0;border-radius:18px;padding:26px;',
            'box-shadow:0 0 40px rgba(155,63,224,0.5);}',
            '#agp-shell-box h2{margin:0 0 18px;font-size:1.3em;text-align:center;color:#3a1560;font-weight:800;}',
            '.agp-shell-field{margin-bottom:14px;text-align:right;}',
            '.agp-shell-field label{display:flex;align-items:center;gap:6px;justify-content:flex-end;',
            'margin-bottom:6px;font-size:0.88em;color:#4a1f6e;font-weight:700;}',
            '.agp-shell-field label img,.agp-field-icon{width:18px;height:18px;}',
            '.agp-shell-field input[type=text]{width:100%;padding:10px;border-radius:10px;border:1px solid #b479e8;',
            'background:#fff;color:#2c1240;font-family:inherit;box-sizing:border-box;}',

            '.agp-shell-row{display:flex;align-items:center;justify-content:space-between;gap:10px;',
            'padding:9px 0;border-bottom:1px solid rgba(155,63,224,0.2);}',
            '.agp-shell-row-label{display:flex;align-items:center;gap:6px;font-size:0.88em;color:#4a1f6e;font-weight:700;}',

            '.agp-pill-group{display:flex;gap:6px;}',
            '.agp-pill-btn{border:1px solid #9b3fe0;background:#fff;color:#5a2585;border-radius:999px;',
            'padding:6px 16px;font-family:inherit;font-size:0.82em;cursor:pointer;font-weight:700;}',
            '.agp-pill-btn.agp-pill-active{background:#9b3fe0;color:#fff;}',

            '.agp-shell-counter-row{display:flex;align-items:center;gap:8px;}',
            '.agp-shell-counter-row button{width:26px;height:26px;border-radius:8px;border:1px solid #9b3fe0;',
            'background:#fff;color:#5a2585;cursor:pointer;font-weight:800;}',
            '.agp-shell-counter-row span.agp-count-val{min-width:24px;text-align:center;font-weight:800;color:#3a1560;}',

            '.agp-shell-btn-connect{width:100%;padding:13px;border:none;border-radius:999px;font-weight:800;',
            'cursor:pointer;background:linear-gradient(90deg,#22d3ee,#a855f7);color:#0b0616;',
            'font-family:inherit;font-size:1em;margin-top:8px;}',

            /* شاشة "جاري الاتصال" — تطابق القالب البسيط المُرسَل */
            '#agp-shell-box.agp-connecting-box{background:linear-gradient(90deg,#f3eefc,#8b3fd6);',
            'text-align:center;padding:34px 26px;}',
            '#agp-shell-box.agp-connecting-box h2{color:#2c1240;}',
            '.agp-shell-status{text-align:center;color:#4a1f6e;font-size:0.9em;margin-bottom:12px;}',

            /* شاشة اللوبي — تطابق القالب الغامق المُرسَل */
            '#agp-shell-box.agp-lobby-box{background:linear-gradient(170deg,#3a1560,#7a1fb8);',
            'border:2px solid #b06be0;width:1440px;max-width:96vw;height:800px;max-height:90vh;',
            'display:flex;flex-direction:column;}',
            '#agp-shell-box.agp-lobby-box h2{color:#f3eefc;}',
            '#agp-shell-box.agp-lobby-box .agp-shell-status{color:#e9d3ff;}',
            '.agp-shell-player-list{list-style:none;margin:0 0 16px;padding:0;flex:1;overflow-y:auto;}',
            '.agp-shell-player-list li{padding:8px 12px;background:rgba(255,255,255,0.12);border-radius:8px;',
            'margin-bottom:6px;text-align:right;color:#f3eefc;}'
        ].join('');
        document.head.appendChild(style);
        document.body.classList.add('agp-shell-active');
    }

    function injectPersistentHeader() {
        if (el('agp-persistent-header')) return;

        var gearIcon = _config.headerGearIcon ? '<img src="' + _config.headerGearIcon + '" alt="">' : '⚙️';

        var header = document.createElement('div');
        header.id = 'agp-persistent-header';
        header.innerHTML =
            '<div style="display:flex;gap:8px;">' +
            '<button class="agp-header-icon-btn" id="agp-header-info-btn" title="شرح اللعبة">!</button>' +
            '<button class="agp-header-icon-btn" id="agp-header-settings-btn" title="الإعدادات">' + gearIcon + '</button>' +
            '</div>' +
            '<div id="agp-header-title">' + (_config.gameTitle || '') + '</div>' +
            '<div id="agp-header-brand"><span class="agp-brand-badge">A</span> ألعاب أيمن</div>';
        document.body.appendChild(header);

        var banner = document.createElement('div');
        banner.id = 'agp-sponsor-banner';
        banner.textContent = 'بانر الراعي';
        document.body.appendChild(banner);

        document.getElementById('agp-header-settings-btn').onclick = function () {
            renderSettingsScreen(true); // true = أُعيد فتحها أثناء اللعب — بدون يوزرنيم/كلمة مفتاحية
            _overlayEl.style.display = 'flex';
        };

        document.getElementById('agp-header-info-btn').onclick = function () {
            renderInfoScreen();
            _overlayEl.style.display = 'flex';
        };
    }

    function renderInfoScreen() {
        var box = el('agp-shell-box');
        box.className = '';
        box.innerHTML =
            '<h2>شرح اللعبة</h2>' +
            '<p class="agp-shell-status" style="text-align:right;">' + (_config.gameExplanation || 'لا يوجد شرح متاح لهذه اللعبة حالياً.') + '</p>' +
            '<button class="agp-shell-btn-connect" id="agp-info-close-btn">إغلاق</button>';
        document.getElementById('agp-info-close-btn').onclick = hideOverlay;
    }

    /* ==================================================================
     *  شاشة الإعدادات
     * ================================================================== */
    function isFieldVisible(field) {
        if (!field.showWhen) return true;
        return _settingsValues[field.showWhen.key] === field.showWhen.equals;
    }

    function iconImg(src) {
        return src ? '<img class="agp-field-icon" src="' + src + '" alt="">' : '';
    }

    function renderField(field) {
        if (!isFieldVisible(field)) return '';

        if (field.type === 'pill-choice' || field.type === 'pill-group') {
            var buttons = (field.options || []).map(function (opt) {
                var active = _settingsValues[field.key] === opt.value ? 'agp-pill-active' : '';
                return '<button type="button" class="agp-pill-btn ' + active + '" data-key="' + field.key + '" data-value="' + opt.value + '">' + opt.label + '</button>';
            }).join('');
            return '<div class="agp-shell-row"><div class="agp-pill-group">' + buttons + '</div>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        if (field.type === 'counter') {
            return '<div class="agp-shell-row">' +
                '<div class="agp-shell-counter-row"><button data-key="' + field.key + '" data-delta="-1">−</button>' +
                '<span class="agp-count-val" id="agp-field-' + field.key + '">' + _settingsValues[field.key] + '</span>' +
                '<button data-key="' + field.key + '" data-delta="1">+</button></div>' +
                '<span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        if (field.type === 'toggle') {
            var checked = _settingsValues[field.key] ? 'checked' : '';
            return '<div class="agp-shell-row"><input type="checkbox" id="agp-field-' + field.key + '" data-key="' + field.key + '" ' + checked + '><span class="agp-shell-row-label">' + iconImg(field.icon) + field.label + '</span></div>';
        }

        return '';
    }

    function renderSettingsScreen(isReopened) {
        var fieldsHtml = (_config.settingsFields || []).map(renderField).join('');
        var box = el('agp-shell-box');
        box.className = '';

        var baseFieldsHtml = isReopened ? '' :
            '<div class="agp-shell-field"><label>' + iconImg(_config.usernameIcon) + 'اكتب يوزر نيم حساب تيك توك</label><input type="text" id="agp-tiktok-username" placeholder="ayman_live"></div>' +
            '<div class="agp-shell-field"><label>' + iconImg(_config.keywordIcon) + 'الكلمة المفتاحية لدخول المبارة</label><input type="text" id="agp-keyword" placeholder="JOIN"></div>';

        var connectBtnHtml = isReopened ? '' :
            '<button class="agp-shell-btn-connect" id="agp-connect-btn">' + (_config.connectButtonLabel || 'اتصال بالبث') + '</button>';

        var playerManagementHtml = isReopened ?
            '<div class="agp-shell-field"><label>👥 قائمة اللاعبين</label>' +
            '<ul class="agp-shell-player-list" id="agp-settings-player-list" style="max-height:160px;"></ul>' +
            '<div style="display:flex;gap:8px;"><input type="text" id="agp-add-player-name" placeholder="اسم اللاعب الجديد" style="flex:1;">' +
            '<button type="button" class="agp-pill-btn" id="agp-add-player-btn">➕ إضافة لاعب</button></div></div>' : '';

        box.innerHTML =
            '<h2>' + (_config.settingsTitle || 'إعدادات المبارة') + '</h2>' +
            baseFieldsHtml +
            fieldsHtml +
            playerManagementHtml +
            connectBtnHtml;

        wireFieldEvents();
        if (!isReopened) {
            document.getElementById('agp-connect-btn').onclick = handleConnectClick;
        } else {
            renderSettingsPlayerList();
            document.getElementById('agp-add-player-btn').onclick = handleAddPlayerClick;
        }
    }

    function renderSettingsPlayerList() {
        var list = el('agp-settings-player-list');
        if (!list) return;
        var players = AGP.gameManager.getPlayers();
        list.innerHTML = players.map(function (p) { return '<li>' + escapeHtml(p.name || p.id) + '</li>'; }).join('');
    }

    function handleAddPlayerClick() {
        var input = el('agp-add-player-name');
        var name = input.value.trim();
        if (!name) { input.focus(); return; }

        // إضافة يدوية — تمر بنفس مسار AGP.player.addPlayer الحقيقي، فتصل
        // تلقائياً للعبة نفسها عبر نفس مستمع player:joined الموجود أصلاً
        // بملف تهيئة اللعبة (agp-shell-config.js)، دون أي منطق مكرَّر هنا.
        AGP.player.addPlayer({ id: 'manual:' + Date.now() + ':' + Math.random().toString(36).slice(2, 7), name: name });

        input.value = '';
        renderSettingsPlayerList();
    }

    function wireFieldEvents() {
        _overlayEl.querySelectorAll('.agp-pill-btn').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-key');
                var raw = btn.getAttribute('data-value');
                var parsed = raw === 'true' ? true : (raw === 'false' ? false : (isNaN(Number(raw)) ? raw : Number(raw)));
                _settingsValues[key] = parsed;
                renderSettingsScreen();
            };
        });
        _overlayEl.querySelectorAll('.agp-shell-counter-row button').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-key');
                var delta = Number(btn.getAttribute('data-delta'));
                var fieldConfig = (_config.settingsFields || []).filter(function (f) { return f.key === key; })[0];
                var min = fieldConfig && typeof fieldConfig.min === 'number' ? fieldConfig.min : 0;
                _settingsValues[key] = Math.max(min, (_settingsValues[key] || 0) + delta);
                renderSettingsScreen();
            };
        });
        _overlayEl.querySelectorAll('#agp-shell-box input[type=checkbox]').forEach(function (chk) {
            chk.onchange = function () { _settingsValues[chk.getAttribute('data-key')] = chk.checked; };
        });
    }

    function renderConnectingScreen(message) {
        var box = el('agp-shell-box');
        box.className = 'agp-connecting-box';
        box.innerHTML = '<h2>جارِ الاتصال...</h2><p class="agp-shell-status">' + (message || 'يرجى الانتظار') + '</p>';
    }

    function renderLobbyScreen() {
        var box = el('agp-shell-box');
        box.className = 'agp-lobby-box';
        box.innerHTML =
            '<h2>اللوبي — بانتظار اللاعبين</h2>' +
            '<p class="agp-shell-status">عشان تتدخل المباراة اكتب بالشات "' + escapeHtml(_lastKeyword) + '"</p>' +
            '<ul class="agp-shell-player-list" id="agp-lobby-list"></ul>' +
            '<button class="agp-shell-btn-connect" id="agp-start-round-btn">انهاء وبدء الجولة</button>';

        renderLobbyPlayerList();
        document.getElementById('agp-start-round-btn').onclick = handleStartRoundClick;
    }

    function renderLobbyPlayerList() {
        var list = el('agp-lobby-list');
        if (!list) return;
        var players = AGP.gameManager.getPlayers();
        list.innerHTML = players.map(function (p) { return '<li>' + escapeHtml(p.name || p.id) + '</li>'; }).join('');
    }

    function escapeHtml(text) {
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function hideOverlay() {
        if (_overlayEl) _overlayEl.style.display = 'none';
    }

    function handleConnectClick() {
        var username = document.getElementById('agp-tiktok-username').value.trim();
        var keyword = document.getElementById('agp-keyword').value.trim();

        if (!username) { document.getElementById('agp-tiktok-username').focus(); return; }
        if (!keyword) { document.getElementById('agp-keyword').focus(); return; }

        _lastKeyword = keyword;
        renderConnectingScreen();

        AGP.gameManager.loadGame(_config.gameId);
        AGP.roomsManager.createRoom(_config.gameId);
        AGP.gameManager.openRegistration();
        AGP.keywordManager.setKeyword(keyword);
        AGP.keywordManager.activate();

        var connectOptions = { username: username };
        if (_settingsValues.followersOnly !== undefined) connectOptions.followersOnly = _settingsValues.followersOnly;

        AGP.streamConnector.connect('tiktok', connectOptions);
    }

    function handleStartRoundClick() {
        var minPlayers = _config.minPlayersToStart || 1;
        if (AGP.gameManager.getPlayers().length < minPlayers) {
            renderLobbyScreen();
            var status = el('agp-lobby-list');
            if (status) {
                var warning = document.createElement('li');
                warning.style.color = '#ffb3b3';
                warning.textContent = 'محتاج ' + minPlayers + ' لاعبين على الأقل قبل بدء الجولة';
                status.insertBefore(warning, status.firstChild);
            }
            return;
        }

        AGP.gameManager.closeRegistration();
        AGP.events.emit('game:roundStarted', { id: _config.gameId });
        hideOverlay();
        if (typeof _config.onStartRound === 'function') {
            _config.onStartRound(Object.assign({}, _settingsValues));
        }
    }

    function init(config) {
        _config = config || {};
        _settingsValues = {};
        (_config.settingsFields || []).forEach(function (field) {
            if (field.type === 'toggle') _settingsValues[field.key] = Boolean(field.default);
            else if (field.type === 'pill-choice' || field.type === 'pill-group') {
                _settingsValues[field.key] = (field.default !== undefined) ? field.default : (field.options && field.options[0] && field.options[0].value);
            } else _settingsValues[field.key] = field.default || 0;
        });

        injectStyles();
        injectPersistentHeader();

        _overlayEl = el('agp-shell-overlay') || document.body.appendChild((function () {
            var d = document.createElement('div');
            d.id = 'agp-shell-overlay';
            d.innerHTML = '<div id="agp-shell-box"></div>';
            return d;
        }()));

        renderSettingsScreen();

        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected') renderLobbyScreen();
            else if (payload.status === 'error') renderConnectingScreen('تعذّر الاتصال — تحقّق من اليوزرنيم وحاول مرة أخرى.');
        });

        AGP.events.on('player:joined', function () {
            renderLobbyPlayerList();
            renderSettingsPlayerList();
        });
    }

    AGP.gameShell = {
        init: init,
        getSettings: function () { return Object.assign({}, _settingsValues); }
    };

}(window.AymanGamesPlatform));
