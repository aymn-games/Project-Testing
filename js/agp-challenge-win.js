/**
 * شاشة الفوز بمباريات «العب ضد ستريمر» — مشتركة بين ألعاب البثين (ركلات
 * الترجيح، أسرع إجابة).
 *
 * بدون صندوق: المحتوى مباشرة فوق خلفية شفافة بتوهّج بنفسجي ناعم (هوية
 * الموقع). فوق: صورة الستريمر الفائز بلون فريقه، اسم الفريق، اسم الستريمر،
 * وسطر النتيجة. تحت: كل لاعب بالفريق الفائز بصورته ورقمه (أهداف/نقاط)،
 * مرتبين من الأعلى. وزر «العودة لمكتبة الألعاب».
 *
 * AGPChallengeWin.show({ color, teamName, streamer:{name, tiktok, avatar},
 *   scoreHtml, players:[{name, avatar, value}], unit: function(n) → 'هدف',
 *   backLabel, onBack, reward:{href} })
 * reward (لستريمر الفريق الفائز بس): كود جائزة الفوز يظهر مغبّش — الكود
 * الحقيقي ما يوصل للشاشة أصلاً — مع زر يفتح بروفايله (أكواد جوائز الفوز).
 * AGPChallengeWin.hide()
 */
(function () {
    'use strict';

    var STYLE_ID = 'agp-win-styles';
    var el = null, shownKey = null;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function initial(name) { return (Array.from(String(name || '').replace(/[\s_.@\d]/g, ''))[0] || '؟').toUpperCase(); }

    function injectStyles() {
        if (document.getElementById(STYLE_ID)) return;
        var st = document.createElement('style');
        st.id = STYLE_ID;
        st.textContent = [
            '@keyframes agpWinIn{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}',
            '.agp-win-ov{position:fixed;inset:0;z-index:90;display:grid;place-items:center;direction:rtl;font-family:"IBM Plex Sans Arabic",sans-serif;color:#f4f2f8;',
            'background:radial-gradient(ellipse 60% 50% at 50% 30%,rgba(139,92,246,.30),transparent 70%),radial-gradient(ellipse 50% 45% at 15% 85%,rgba(168,85,247,.18),transparent 70%),radial-gradient(ellipse 50% 45% at 85% 80%,rgba(124,58,237,.18),transparent 70%),rgba(7,6,11,.55);',
            'backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px)}',
            '.agp-win{--c:#fbbf24;width:min(980px,calc(100vw - 32px));max-height:calc(100vh - 110px);margin-top:60px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center;animation:agpWinIn .4s ease both}',
            '.agp-win-pic{position:relative;width:104px;height:104px;flex:0 0 auto;margin-top:18px;border-radius:50%;border:4px solid var(--c);box-shadow:0 0 30px color-mix(in srgb,var(--c) 60%,transparent);background:#1e1638;display:grid;place-items:center;font:800 40px "IBM Plex Sans Arabic",sans-serif;color:#fff}',
            '.agp-win-pic img{position:absolute;inset:0;width:100%;height:100%;border-radius:50%;object-fit:cover;background:#1e1638}',
            '.agp-win-pic i{position:absolute;top:-30px;left:50%;transform:translateX(-50%);font-style:normal;font-size:34px;line-height:1}',
            '.agp-win-tag{font:800 18px/1 "Zain","IBM Plex Sans Arabic",sans-serif;letter-spacing:1px;color:#fde7a8}',
            '.agp-win h2{margin:0;color:var(--c);font:900 clamp(34px,4vw,54px)/1.1 "Zain","IBM Plex Sans Arabic",sans-serif;text-shadow:0 0 30px color-mix(in srgb,var(--c) 45%,transparent)}',
            '.agp-win-streamer{font:600 15px "IBM Plex Sans Arabic",sans-serif;color:#c9c4d6}',
            '.agp-win-streamer bdi{direction:ltr;unicode-bidi:isolate;color:#8a8596}',
            '.agp-win-score{display:inline-flex;align-items:center;gap:10px;padding:6px 16px;border-radius:999px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);font:700 14px "IBM Plex Sans Arabic",sans-serif;color:#a8a3b5}',
            '.agp-win-score b{font:800 20px "IBM Plex Sans Arabic",sans-serif;color:#fff;font-variant-numeric:tabular-nums}',
            '.agp-win-players{width:100%;flex:1;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;padding:14px 2px 4px;margin-top:4px}',
            '.agp-wp{display:flex;align-items:center;gap:10px;padding:8px 12px 8px 8px;border-radius:18px;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);text-align:right;min-width:0}',
            '.agp-wp.top{border-color:color-mix(in srgb,var(--c) 60%,transparent);background:color-mix(in srgb,var(--c) 10%,transparent)}',
            '.agp-wp .av{position:relative;width:46px;height:46px;flex:0 0 auto;border-radius:50%;overflow:hidden;display:grid;place-items:center;color:#fff;font-weight:700;background:linear-gradient(135deg,var(--c),#1e1638);border:2px solid color-mix(in srgb,var(--c) 70%,transparent)}',
            '.agp-wp .av img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#1e1638}',
            '.agp-wp .nm{flex:1;min-width:0;font:700 14px "IBM Plex Sans Arabic",sans-serif;color:#f4f2f8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
            '.agp-wp .gl{flex:0 0 auto;display:flex;flex-direction:column;align-items:center;line-height:1}',
            '.agp-wp .gl b{font:800 22px "IBM Plex Sans Arabic",sans-serif;color:#fff;font-variant-numeric:tabular-nums}',
            '.agp-wp .gl small{font:600 11px "IBM Plex Sans Arabic",sans-serif;color:#a8a3b5;margin-top:3px}',
            '.agp-wp.zero .gl b{color:#6f6a7c}',
            '.agp-win-back{flex:0 0 auto;margin-top:6px;height:52px;padding:0 28px;border-radius:16px;border:none;cursor:pointer;background:linear-gradient(90deg,#7c3aed,#a855f7);color:#fff;font:700 18px "IBM Plex Sans Arabic",sans-serif;box-shadow:0 10px 30px rgba(139,92,246,.4)}',
            '.agp-win-back:active{transform:scale(.98)}',
            '.agp-win-rw{flex:0 0 auto;display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;width:min(640px,100%);padding:12px 16px;border-radius:18px;text-align:right;background:rgba(251,191,36,.07);border:1px solid rgba(251,191,36,.35)}',
            '.agp-win-rw .t{display:flex;flex-direction:column;gap:4px;min-width:0;flex:1 1 240px}',
            '.agp-win-rw .t b{font:800 16px "IBM Plex Sans Arabic",sans-serif;color:#fde7a8}',
            '.agp-win-rw .t small{font:500 12px/1.7 "IBM Plex Sans Arabic",sans-serif;color:#c9c4d6}',
            '.agp-win-rw .code{font:700 18px monospace;letter-spacing:2px;direction:ltr;color:#fff;filter:blur(7px);user-select:none;pointer-events:none}',
            '.agp-win-rw a{flex:0 0 auto;height:40px;padding:0 16px;border-radius:12px;display:inline-flex;align-items:center;font:700 14px "IBM Plex Sans Arabic",sans-serif;text-decoration:none;color:#1a1206;background:linear-gradient(90deg,#fbbf24,#fde68a)}'
        ].join('\n');
        document.head.appendChild(st);
    }

    function show(o) {
        injectStyles();
        var players = (o.players || []).slice().sort(function (a, b) { return (b.value || 0) - (a.value || 0); });
        var best = players.length ? (players[0].value || 0) : 0;
        var unit = o.unit || function () { return ''; };
        var s = o.streamer || {};
        var key = JSON.stringify([o.teamName, o.scoreHtml, players.map(function (p) { return [p.name, p.value, Boolean(p.avatar)]; }), o.reward ? o.reward.href : null]);
        if (el && shownKey === key) return;
        shownKey = key;
        if (!el) {
            el = document.createElement('div');
            el.className = 'agp-win-ov';
            el.addEventListener('click', function (e) { if (e.target.closest('.agp-win-back') && el._onBack) el._onBack(); });
            document.body.appendChild(el);
        }
        el._onBack = o.onBack;
        el.innerHTML = '<div class="agp-win" style="--c:' + esc(o.color || '#fbbf24') + '">' +
            '<div class="agp-win-pic">' + esc(initial(s.name)) + (s.avatar ? '<img src="' + esc(s.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '<i>👑</i></div>' +
            '<span class="agp-win-tag">🏆 الفريق الفائز</span>' +
            '<h2>' + esc(o.teamName) + '</h2>' +
            '<span class="agp-win-streamer">الستريمر ' + esc(s.name) + ' · <bdi>@' + esc(s.tiktok) + '</bdi></span>' +
            (o.scoreHtml ? '<span class="agp-win-score">' + o.scoreHtml + '</span>' : '') +
            '<div class="agp-win-players">' + players.map(function (p) {
                var v = p.value || 0;
                return '<div class="agp-wp' + (v && v === best ? ' top' : '') + (v ? '' : ' zero') + '"><span class="av">' + esc(initial(p.name)) +
                    (p.avatar ? '<img src="' + esc(p.avatar) + '" alt="" referrerpolicy="no-referrer" onerror="this.remove()">' : '') + '</span>' +
                    '<span class="nm">' + esc(p.name) + '</span><span class="gl"><b>' + v + '</b><small>' + esc(unit(v)) + '</small></span></div>';
            }).join('') + '</div>' +
            (o.reward ? '<div class="agp-win-rw"><div class="t"><b>🎁 جائزة الفوز: كود إطار لفريقك</b>' +
                '<small>الكود مخفي عن البث. افتحه من بروفايلك وانسخه للاعبين — لازم يكون عندهم حساب بالموقع مربوط بتيك توك، ويستردونه من بروفايلهم ← «استرداد كود».</small></div>' +
                '<span class="code" aria-hidden="true">AGP-XXXX-XXXX</span>' +
                '<a href="' + esc(o.reward.href) + '" target="_blank" rel="noopener">اذهب لكشف كود الاسترداد</a></div>' : '') +
            '<button type="button" class="agp-win-back">' + esc(o.backLabel || 'العودة لمكتبة الألعاب') + '</button></div>';
    }

    function hide() {
        if (el) { el.remove(); el = null; shownKey = null; }
    }

    /** وحدة عربية للعدد: 1 هدف، 2 هدفين، 3-10 أهداف، 11+ هدف. */
    function arabicUnit(one, two, few) {
        return function (n) { return n === 2 ? two : n >= 3 && n <= 10 ? few : one; };
    }

    window.AGPChallengeWin = { show: show, hide: hide, arabicUnit: arabicUnit };
})();
