/**
 * تواصل الستريمرين بمباريات «العب ضد ستريمر» — شات نصي + مايك طوال المباراة.
 *
 * مشترك بين شاشات مباريات البثين (ركلات الترجيح، أسرع إجابة: اللوبي والجولات).
 * يمشي على نفس اتصال /ws/challenge حق الشاشة (backend/challenge/challenge-match.js):
 *   الشات: { type:'chat', text } ← { type:'chat', msg } / { type:'chatHistory', messages }
 *   المايك: اتصال صوتي مباشر WebRTC بين الشاشتين، والخادم يمرّر الإشارات بس
 *   ({ type:'rtc', data }). لما تكون الشاشتين مفتوحة يرسل الخادم { type:'peer' }
 *   والمنشئ يبدأ الاتصال. حالة المايك { type:'mic', on } تظهر للخصم (sides[i].mic).
 *
 * الاستخدام:
 *   var comms = AGPChallengeComms.create({ container, matchId, send, toast, colors, btnClass });
 *   comms.onState(match)      // مع كل رسالة state
 *   comms.onMessage(msg)      // يرجع true لو الرسالة له (chat/chatHistory/peer/rtc)
 * المايك يرجع يشتغل تلقائياً لو كان شغّال قبل التنقل بين صفحات نفس المباراة
 * (اللوبي ← الجولات) — المتصفح ما يسأل مرة ثانية بعد ما سمح.
 */
(function () {
    'use strict';

    var STYLE_ID = 'agp-cc-styles';
    var ICE = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
    var MAX_MSGS = 50;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function hhmm(t) { var d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
    function store(k, v) { try { if (v == null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) {} }
    function stored(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '.agp-cc-btn{position:relative;height:clamp(32px,2.3vw,42px);padding:0 clamp(10px,.9vw,16px);border-radius:999px;display:inline-flex;align-items:center;gap:8px;font:600 clamp(12px,.78vw,15px) "IBM Plex Sans Arabic",sans-serif;white-space:nowrap;cursor:pointer;transition:all .2s;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.18);background:rgba(10,9,15,.55);color:#e7e3ef}',
            '.agp-cc-btn:active{transform:scale(.97)}',
            '.agp-cc-btn:disabled{opacity:.45;cursor:default}',
            '.agp-cc-mic-on{border-color:rgba(74,222,128,.5) !important;background:rgba(34,197,94,.14) !important;color:#bbf7d0 !important}',
            '.agp-cc-mic-off{border-color:rgba(248,113,113,.3) !important;color:#fecaca !important}',
            '.agp-cc-bd{position:absolute;top:-7px;right:-4px;min-width:20px;height:20px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:#ef4444;color:#fff;font:700 11px/20px "IBM Plex Sans Arabic",sans-serif;text-align:center;box-shadow:0 0 0 3px #07060b}',
            '.agp-cc-hidden{display:none !important}',
            '.agp-cc-chat{position:fixed;left:clamp(12px,1.25vw,24px);top:88px;z-index:120;width:min(360px,calc(100vw - 24px));height:min(62vh,540px);display:flex;flex-direction:column;border-radius:22px;overflow:hidden;direction:rtl;font-family:"IBM Plex Sans Arabic",sans-serif;color:#f4f2f8;',
            'background:rgba(14,12,22,.94);border:1px solid rgba(167,139,250,.35);box-shadow:0 24px 60px rgba(0,0,0,.55),0 0 50px -20px #8b5cf6;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}',
            '.agp-cc-h{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(255,255,255,.07)}',
            '.agp-cc-h b{font:700 15px "IBM Plex Sans Arabic",sans-serif}',
            '.agp-cc-h small{display:flex;align-items:center;gap:6px;margin-top:3px;font:500 12px "IBM Plex Sans Arabic",sans-serif;color:#a8a3b5}',
            '.agp-cc-x{width:32px;height:32px;flex:0 0 auto;border-radius:50%;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.04);color:#e7e3ef;cursor:pointer;font-size:14px}',
            '.agp-cc-list{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}',
            '.agp-cc-empty{margin:auto;color:#6f6a7c;font-size:13px;text-align:center;line-height:1.8}',
            '.agp-cc-m{max-width:85%;align-self:flex-start;padding:7px 12px;border-radius:16px 16px 16px 4px;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.08)}',
            '.agp-cc-m.mine{align-self:flex-end;border-radius:16px 16px 4px 16px;background:rgba(139,92,246,.18);border-color:rgba(167,139,250,.35)}',
            '.agp-cc-m i{display:flex;justify-content:space-between;gap:10px;font-style:normal;font:700 12px "IBM Plex Sans Arabic",sans-serif}',
            '.agp-cc-m i em{font-style:normal;font-weight:500;color:#6f6a7c}',
            '.agp-cc-m p{margin:2px 0 0;font:500 14px/1.6 "IBM Plex Sans Arabic",sans-serif;color:#f4f2f8;word-break:break-word}',
            '.agp-cc-f{display:flex;gap:8px;padding:10px;border-top:1px solid rgba(255,255,255,.07)}',
            '.agp-cc-f input{flex:1;min-width:0;height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.04);color:#f4f2f8;font:500 14px "IBM Plex Sans Arabic",sans-serif;outline:none}',
            '.agp-cc-f input:focus{border-color:rgba(167,139,250,.55)}',
            '.agp-cc-f button{height:40px;padding:0 16px;border-radius:999px;border:none;cursor:pointer;color:#fff;font:700 14px "IBM Plex Sans Arabic",sans-serif;background:linear-gradient(90deg,#7c3aed,#a855f7)}',
            '.agp-cc-dot{width:8px;height:8px;border-radius:50%;background:#6b6480;display:inline-block}',
            '.agp-cc-dot.on{background:#4ade80;box-shadow:0 0 8px #4ade80}'
        ].join('\n');
        document.head.appendChild(st);
    }

    var CHAT_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
    var MIC_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="2" width="6" height="12" rx="3"></rect><path d="M19 10v1a7 7 0 0 1-14 0v-1"></path><line x1="12" y1="18" x2="12" y2="22"></line><line class="agp-cc-slash" x1="3" y1="3" x2="21" y2="21"></line></svg>';

    function create(opts) {
        injectStyles();
        var send = opts.send, toast = opts.toast || function () {};
        var colors = opts.colors || ['#a78bfa', '#38bdf8'];
        var micKey = 'agp-cc-mic:' + (opts.matchId || '');
        var btnClass = 'agp-cc-btn' + (opts.btnClass ? ' ' + opts.btnClass : '');
        var M = null;

        /* ---- الأزرار والنافذة ---- */
        var chatBtn = document.createElement('button');
        chatBtn.type = 'button'; chatBtn.className = btnClass; chatBtn.setAttribute('aria-label', 'شات الستريمرين');
        chatBtn.innerHTML = CHAT_SVG + '<span>الشات</span><span class="agp-cc-bd agp-cc-hidden"></span>';
        var micBtn = document.createElement('button');
        micBtn.type = 'button'; micBtn.className = btnClass + ' agp-cc-mic-off'; micBtn.setAttribute('aria-label', 'المايك');
        micBtn.innerHTML = MIC_SVG + '<span>المايك مقفول</span>';
        if (opts.container) { opts.container.insertBefore(micBtn, opts.container.firstChild); opts.container.insertBefore(chatBtn, micBtn); }

        var panel = document.createElement('div');
        panel.className = 'agp-cc-chat agp-cc-hidden';
        panel.innerHTML = '<div class="agp-cc-h"><div><b>شات الستريمرين</b><small><i class="agp-cc-dot"></i><span class="agp-cc-opp">—</span></small></div><button type="button" class="agp-cc-x" aria-label="إغلاق">✕</button></div>' +
            '<div class="agp-cc-list"><div class="agp-cc-empty">تواصل مع الستريمر الثاني هنا<br>والمايك تقدر تشغّله وتقفله طوال المباراة</div></div>' +
            '<form class="agp-cc-f"><input maxlength="200" autocomplete="off" placeholder="اكتب رسالة…"><button type="submit">إرسال</button></form>';
        document.body.appendChild(panel);
        var audio = document.createElement('audio');
        audio.autoplay = true; audio.setAttribute('playsinline', '');
        document.body.appendChild(audio);

        var list = panel.querySelector('.agp-cc-list'), input = panel.querySelector('input'), badge = chatBtn.querySelector('.agp-cc-bd');

        /* ---- الشات ---- */
        var msgs = [], unread = 0;
        function renderChat() {
            if (!msgs.length) return;
            var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 40;
            list.innerHTML = msgs.map(function (c) {
                var mine = M && c.side === M.you;
                return '<div class="agp-cc-m' + (mine ? ' mine' : '') + '"><i><span style="color:' + colors[c.side] + '">' + esc(mine ? 'أنت' : c.name) + '</span><em>' + hhmm(c.at) + '</em></i><p>' + esc(c.text) + '</p></div>';
            }).join('');
            if (atBottom || (M && msgs[msgs.length - 1].side === M.you)) list.scrollTop = list.scrollHeight;
        }
        function isOpen() { return !panel.classList.contains('agp-cc-hidden'); }
        function setOpen(open) {
            panel.classList.toggle('agp-cc-hidden', !open);
            if (open) { unread = 0; render(); list.scrollTop = list.scrollHeight; input.focus(); }
        }
        chatBtn.addEventListener('click', function () { setOpen(!isOpen()); });
        panel.querySelector('.agp-cc-x').addEventListener('click', function () { setOpen(false); });
        panel.querySelector('form').addEventListener('submit', function (e) {
            e.preventDefault();
            var v = input.value.trim();
            if (!v || !M || M.ended) return;
            send({ type: 'chat', text: v });
            input.value = '';
        });

        /* ---- المايك (WebRTC) ---- */
        var pc = null, sender = null, micStream = null, micOn = false, pendingIce = [], callState = 'idle';
        function isHost() { return M && M.you === M.host; }
        // المنشئ يضيف مسار صوت واحد بالاتجاهين، والطرف الثاني يستخدم نفس المسار اللي
        // يجيه بالعرض — تشغيل/قفل المايك بعدها ما يحتاج إعادة تفاوض.
        function attachSender(tr) {
            tr.direction = 'sendrecv';
            sender = tr.sender;
            if (micStream) sender.replaceTrack(micStream.getAudioTracks()[0]);
        }
        function newPC(offerer) {
            if (pc) { try { pc.close(); } catch (e) {} }
            pendingIce = [];
            sender = null;
            pc = new RTCPeerConnection({ iceServers: ICE });
            if (offerer) attachSender(pc.addTransceiver('audio', { direction: 'sendrecv' }));
            var me = pc;
            pc.onicecandidate = function (e) { if (e.candidate && me === pc) send({ type: 'rtc', data: { candidate: e.candidate.toJSON() } }); };
            pc.ontrack = function (e) {
                audio.srcObject = (e.streams && e.streams[0]) || new MediaStream([e.track]);
                audio.play().catch(function () {});
            };
            pc.onconnectionstatechange = function () {
                if (me !== pc) return;
                callState = pc.connectionState;
                render();
                // انقطع الاتصال الصوتي: المنشئ يعيد المحاولة.
                if ((callState === 'failed' || callState === 'disconnected') && isHost() && M && !M.ended) {
                    setTimeout(function () { if (me === pc && (pc.connectionState === 'failed' || pc.connectionState === 'disconnected')) startCall(); }, 3000);
                }
            };
            callState = 'connecting';
            return pc;
        }
        function sdpOf(p) { return p.localDescription.toJSON ? p.localDescription.toJSON() : p.localDescription; }
        function startCall() {
            if (!window.RTCPeerConnection) return;
            var p = newPC(true);
            p.createOffer().then(function (o) { return p.setLocalDescription(o); })
                .then(function () { if (p === pc) send({ type: 'rtc', data: { sdp: sdpOf(p) } }); })
                .catch(function (e) { console.error(e); });
        }
        function flushIce() { var q = pendingIce; pendingIce = []; q.forEach(function (c) { pc.addIceCandidate(c).catch(function () {}); }); }
        function onRtc(data) {
            if (!window.RTCPeerConnection || !M || M.ended) return;
            if (data.sdp && data.sdp.type === 'offer' && !isHost()) {
                var p = newPC(false);
                p.setRemoteDescription(data.sdp).then(function () {
                    var tr = p.getTransceivers()[0];
                    if (tr) attachSender(tr);
                    flushIce();
                    return p.createAnswer();
                }).then(function (a) { return p.setLocalDescription(a); })
                    .then(function () { if (p === pc) send({ type: 'rtc', data: { sdp: sdpOf(p) } }); })
                    .catch(function (e) { console.error(e); });
            } else if (data.sdp && data.sdp.type === 'answer' && isHost() && pc && pc.signalingState === 'have-local-offer') {
                pc.setRemoteDescription(data.sdp).then(flushIce).catch(function (e) { console.error(e); });
            } else if (data.candidate && pc) {
                if (pc.remoteDescription) pc.addIceCandidate(data.candidate).catch(function () {});
                else pendingIce.push(data.candidate);
            }
        }
        function end() {
            if (pc) { try { pc.close(); } catch (e) {} pc = null; }
            if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
            micOn = false; callState = 'idle';
            store(micKey, null);
            render();
        }
        function setMic(on, quiet) {
            if (!M || M.ended) return;
            if (on && !micStream) {
                if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { if (!quiet) toast('المتصفح ما يدعم المايك.'); return; }
                navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } }).then(function (stream) {
                    micStream = stream;
                    if (sender) sender.replaceTrack(stream.getAudioTracks()[0]);
                    setMic(true);
                }).catch(function () { store(micKey, null); if (!quiet) toast('ما قدرنا نوصل للمايك — اسمح للمتصفح باستخدامه.'); });
                return;
            }
            micOn = Boolean(on && micStream);
            if (micStream) micStream.getAudioTracks().forEach(function (t) { t.enabled = micOn; });
            store(micKey, micOn ? '1' : null);
            send({ type: 'mic', on: micOn });
            render();
        }
        micBtn.addEventListener('click', function () { setMic(!micOn); });
        // المتصفح يمنع تشغيل الصوت بدون ضغطة: أي ضغطة بالصفحة تشغّل صوت الطرف الثاني لو كان واقف.
        document.addEventListener('click', function () { if (audio.srcObject && audio.paused) audio.play().catch(function () {}); });

        function render() {
            badge.classList.toggle('agp-cc-hidden', !unread);
            badge.textContent = unread;
            micBtn.classList.toggle('agp-cc-mic-on', micOn);
            micBtn.classList.toggle('agp-cc-mic-off', !micOn);
            micBtn.querySelector('span').textContent = micOn ? 'المايك شغّال' : 'المايك مقفول';
            micBtn.querySelector('.agp-cc-slash').style.display = micOn ? 'none' : '';
            micBtn.disabled = Boolean(M && M.ended);
            if (!M) return;
            var opp = M.sides[1 - M.you];
            var link = callState === 'connected' ? 'متصل صوتياً' : opp.present ? 'جاري ربط الصوت…' : 'شاشته مسكّرة';
            panel.querySelector('.agp-cc-opp').textContent = 'مايك ' + opp.name + ': ' + (opp.mic ? 'شغّال' : 'مقفول') + ' · ' + link;
            panel.querySelector('.agp-cc-dot').classList.toggle('on', Boolean(opp.mic));
        }

        var restored = false;
        return {
            onState: function (match) {
                M = match;
                if (M.ended) { end(); return; }
                // كان المايك شغّال بصفحة ثانية من نفس المباراة (اللوبي ← الجولات): يرجع يشتغل.
                if (!restored) { restored = true; if (stored(micKey) === '1') setMic(true, true); }
                render();
            },
            onMessage: function (msg) {
                if (!msg) return false;
                if (msg.type === 'chatHistory') { msgs = (msg.messages || []).slice(-MAX_MSGS); renderChat(); return true; }
                if (msg.type === 'chat' && msg.msg) {
                    msgs.push(msg.msg); if (msgs.length > MAX_MSGS) msgs.shift(); renderChat();
                    if (!isOpen() && M && msg.msg.side !== M.you) { unread++; render(); toast(msg.msg.name + ': ' + msg.msg.text); }
                    return true;
                }
                if (msg.type === 'peer') { if (isHost() && M && !M.ended) startCall(); return true; }
                if (msg.type === 'rtc') { if (msg.data) onRtc(msg.data); return true; }
                return false;
            },
            end: end
        };
    }

    window.AGPChallengeComms = { create: create };
})();
