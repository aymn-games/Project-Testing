/**
 * ==========================================================================
 *  AGP GAME SHELL — وحدة مشتركة قابلة لإعادة الاستخدام لكل الألعاب
 * ==========================================================================
 *
 * ⚠️ قرار معماري جديد: كل لعبة تحمّل هذا الملف بنفسها (مع AGP Core كاملاً
 *   قبله) وتُدير هي نفسها دورة إعدادات/اتصال/لوبي/بدء الجولة — بدل لوحة
 *   تحكم منفصلة. لوحة dashboard-core تبقى موجودة لكن لغرض أدمن/إحصائيات
 *   فقط، ليست جزءاً من هذا التدفّق إطلاقاً.
 *
 * لا تعديل على AGP Core — هذا الملف يستخدم فقط الواجهات العامة الموجودة
 * أصلاً (gameManager, streamConnector, keywordManager, roomsManager...).
 *
 * الاستخدام من أي لعبة:
 *   AGP.gameShell.init({
 *       gameId: 'roulette-game',
 *       settingsFields: [
 *           { key: 'revivalFriendEnabled', label: 'ميزة انعاش صديق', type: 'toggle' },
 *           { key: 'ticketsTotal', label: 'إجمالي عدد الطلقات', type: 'counter', min: 1, default: 6 }
 *       ],
 *       onStartRound: function (settings) { ... اللعبة تقرأ الإعدادات النهائية هنا ... }
 *   });
 *
 * دورة الحياة داخل الواجهة المُنشأة تلقائياً (Overlay فوق شاشة اللعبة):
 *   1) settings  — يوزرنيم تيك توك + كلمة مفتاحية + حقول اللعبة الخاصة
 *   2) connecting
 *   3) lobby     — قائمة لاعبين حيّة (تحدَّث تلقائياً من player:joined)
 *   4) hidden    — الـ Overlay يختفي، شاشة اللعبة الحقيقية تظهر وتُستدعى onStartRound
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

    function injectStyles() {
        var style = document.createElement('style');
        style.textContent = [
            '#agp-shell-overlay{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;',
            'background:rgba(8,4,16,0.92);font-family:Cairo,sans-serif;color:#f3eefc;direction:rtl;}',
            '#agp-shell-box{width:min(420px,92vw);max-height:88vh;overflow-y:auto;background:#150c26;',
            'border:1px solid rgba(168,85,247,0.35);border-radius:14px;padding:24px;}',
            '#agp-shell-box h2{margin:0 0 16px;font-size:1.2em;text-align:center;}',
            '.agp-shell-field{margin-bottom:14px;text-align:right;}',
            '.agp-shell-field label{display:block;margin-bottom:6px;font-size:0.85em;color:#b9aed1;}',
            '.agp-shell-field input[type=text]{width:100%;padding:9px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);',
            'background:#1c1233;color:#f3eefc;font-family:inherit;box-sizing:border-box;}',
            '.agp-shell-toggle-row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}',
            '.agp-shell-counter-row{display:flex;align-items:center;gap:8px;margin-bottom:10px;}',
            '.agp-shell-counter-row button{width:26px;height:26px;border-radius:6px;border:1px solid rgba(168,85,247,0.3);',
            'background:#1c1233;color:#fff;cursor:pointer;}',
            '.agp-shell-select{width:100%;padding:9px;border-radius:8px;border:1px solid rgba(168,85,247,0.3);',
            'background:#1c1233;color:#f3eefc;font-family:inherit;box-sizing:border-box;}',
            '.agp-shell-btn{width:100%;padding:12px;border:none;border-radius:8px;font-weight:800;cursor:pointer;',
            'background:linear-gradient(90deg,#22d3ee,#a855f7);color:#0b0616;font-family:inherit;font-size:1em;margin-top:6px;}',
            '.agp-shell-status{text-align:center;color:#b9aed1;font-size:0.9em;margin-bottom:12px;}',
            '.agp-shell-player-list{list-style:none;margin:0 0 16px;padding:0;max-height:240px;overflow-y:auto;}',
            '.agp-shell-player-list li{padding:8px 12px;background:#1c1233;border-radius:8px;margin-bottom:6px;text-align:right;}'
        ].join('');
        document.head.appendChild(style);
    }

    function el(html) {
        var div = document.createElement('div');
        div.innerHTML = html.trim();
        return div.firstChild;
    }

    function renderSettingsScreen() {
        var fieldsHtml = (_config.settingsFields || []).map(function (field) {
            if (field.type === 'toggle') {
                var checked = _settingsValues[field.key] ? 'checked' : '';
                return '<div class="agp-shell-toggle-row"><input type="checkbox" id="agp-field-' + field.key + '" ' + checked + '><label for="agp-field-' + field.key + '">' + field.label + '</label></div>';
            }
            if (field.type === 'counter') {
                return '<div class="agp-shell-counter-row"><button data-key="' + field.key + '" data-delta="-1">−</button>' +
                    '<span id="agp-field-' + field.key + '">' + _settingsValues[field.key] + '</span>' +
                    '<button data-key="' + field.key + '" data-delta="1">+</button><span>' + field.label + '</span></div>';
            }
            if (field.type === 'select') {
                var optionsHtml = (field.options || []).map(function (opt) {
                    var selected = _settingsValues[field.key] === opt.value ? 'selected' : '';
                    return '<option value="' + opt.value + '" ' + selected + '>' + opt.label + '</option>';
                }).join('');
                return '<div class="agp-shell-field"><label>' + field.label + '</label>' +
                    '<select id="agp-field-' + field.key + '" data-key="' + field.key + '" class="agp-shell-select">' + optionsHtml + '</select></div>';
            }
            return '';
        }).join('');

        _overlayEl.querySelector('#agp-shell-box').innerHTML =
            '<h2>إعدادات اللعبة</h2>' +
            '<div class="agp-shell-field"><label>يوزرنيم تيك توك</label><input type="text" id="agp-tiktok-username" placeholder="مثال: ayman_live"></div>' +
            '<div class="agp-shell-field"><label>الكلمة المفتاحية للانضمام</label><input type="text" id="agp-keyword" placeholder="مثال: JOIN"></div>' +
            fieldsHtml +
            '<button class="agp-shell-btn" id="agp-connect-btn">' + (_config.connectButtonLabel || 'اتصال بالبث') + '</button>';

        _overlayEl.querySelectorAll('.agp-shell-counter-row button').forEach(function (btn) {
            btn.onclick = function () {
                var key = btn.getAttribute('data-key');
                var delta = Number(btn.getAttribute('data-delta'));
                var fieldConfig = _config.settingsFields.filter(function (f) { return f.key === key; })[0];
                var min = fieldConfig && typeof fieldConfig.min === 'number' ? fieldConfig.min : 0;
                _settingsValues[key] = Math.max(min, (_settingsValues[key] || 0) + delta);
                document.getElementById('agp-field-' + key).textContent = _settingsValues[key];
            };
        });

        _overlayEl.querySelectorAll('.agp-shell-select').forEach(function (select) {
            select.onchange = function () {
                var key = select.getAttribute('data-key');
                var raw = select.value;
                _settingsValues[key] = isNaN(Number(raw)) ? raw : Number(raw);
            };
        });

        document.getElementById('agp-connect-btn').onclick = handleConnectClick;
    }

    function renderConnectingScreen(message) {
        _overlayEl.querySelector('#agp-shell-box').innerHTML =
            '<h2>جارِ الاتصال...</h2><p class="agp-shell-status">' + (message || 'يرجى الانتظار') + '</p>';
    }

    function renderLobbyScreen() {
        _overlayEl.querySelector('#agp-shell-box').innerHTML =
            '<h2>اللوبي — بانتظار اللاعبين</h2>' +
            '<p class="agp-shell-status">اكتبوا الكلمة المفتاحية بالشات للانضمام</p>' +
            '<ul class="agp-shell-player-list" id="agp-lobby-list"></ul>' +
            '<button class="agp-shell-btn" id="agp-start-round-btn">بدء الجولة</button>';

        renderLobbyPlayerList();
        document.getElementById('agp-start-round-btn').onclick = handleStartRoundClick;
    }

    function renderLobbyPlayerList() {
        var list = document.getElementById('agp-lobby-list');
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

    /* ----------------------------------------------------------------
     * منطق الانتقال بين المراحل
     * ---------------------------------------------------------------- */
    function handleConnectClick() {
        var username = document.getElementById('agp-tiktok-username').value.trim();
        var keyword = document.getElementById('agp-keyword').value.trim();

        if (!username) { document.getElementById('agp-tiktok-username').focus(); return; }
        if (!keyword) { document.getElementById('agp-keyword').focus(); return; }

        renderConnectingScreen();

        AGP.gameManager.loadGame(_config.gameId);
        AGP.roomsManager.createRoom(_config.gameId);
        AGP.gameManager.openRegistration();
        AGP.keywordManager.setKeyword(keyword);
        AGP.keywordManager.activate();

        AGP.streamConnector.connect('tiktok', { username: username });
    }

    function handleStartRoundClick() {
        AGP.gameManager.closeRegistration();
        AGP.events.emit('game:roundStarted', { id: _config.gameId });
        hideOverlay();
        if (typeof _config.onStartRound === 'function') {
            _config.onStartRound(Object.assign({}, _settingsValues));
        }
    }

    /* ----------------------------------------------------------------
     * تهيئة عامة — تُستدعى من كل لعبة
     * ---------------------------------------------------------------- */
    function init(config) {
        _config = config || {};
        _settingsValues = {};
        (_config.settingsFields || []).forEach(function (field) {
            if (field.type === 'toggle') _settingsValues[field.key] = Boolean(field.default);
            else if (field.type === 'select') _settingsValues[field.key] = (field.default !== undefined) ? field.default : (field.options && field.options[0] && field.options[0].value);
            else _settingsValues[field.key] = field.default || 0;
        });

        injectStyles();
        _overlayEl = el('<div id="agp-shell-overlay"><div id="agp-shell-box"></div></div>');
        document.body.appendChild(_overlayEl);

        renderSettingsScreen();

        AGP.events.on('stream:statusChanged', function (payload) {
            if (payload.platform !== 'tiktok') return;
            if (payload.status === 'connecting') renderConnectingScreen('جارِ الاتصال بالبث...');
            else if (payload.status === 'connected') renderLobbyScreen();
            else if (payload.status === 'error') renderConnectingScreen('تعذّر الاتصال — تحقّق من اليوزرنيم وحاول مرة أخرى.');
        });

        AGP.events.on('player:joined', function () { renderLobbyPlayerList(); });
    }

    AGP.gameShell = {
        init: init,
        getSettings: function () { return Object.assign({}, _settingsValues); }
    };

}(window.AymanGamesPlatform));
