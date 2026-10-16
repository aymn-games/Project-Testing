/**
 * نافذة مكافأة متابعة حساب تيك توك المنصة — تظهر بالرئيسية لمستخدم مسجّل
 * دخول عنده مكافأة بانتظار الاختيار (راجع backend/collectibles/
 * follow-reward-service.js). يختار إطار واحد → ينضاف لمقتنياته وتنقفل
 * النافذة. لو قفلها بدون اختيار، ترجع له بزيارته الجاية.
 * يحتاج auth/auth-client.js قبله.
 */
(function () {
  'use strict';

  var CATALOG_NAMES = {
    founder: 'المؤسس', streamer: 'الاستريمر', supporter: 'الداعم', distinguished: 'المميز',
    'level-1': 'المستوى 1', 'level-2': 'المستوى 2', 'level-3': 'المستوى 3', 'level-4': 'المستوى 4',
    'level-5': 'المستوى 5', 'level-6': 'المستوى 6', 'level-7': 'المستوى 7'
  };

  var CSS =
    '.agp-fr-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;' +
      'background:rgba(3,2,8,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);direction:rtl;font-family:inherit}' +
    '.agp-fr-modal{position:relative;width:100%;max-width:760px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;' +
      'border-radius:24px;overflow:hidden;color:#f4f2fb;' +
      'background:linear-gradient(160deg,rgba(254,44,85,.12),#0e0b16 30%,#0e0b16 70%,rgba(37,244,238,.10));' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 90px -30px rgba(0,0,0,.95)}' +
    '.agp-fr-head{padding:26px 26px 14px;text-align:center}' +
    '.agp-fr-close{position:absolute;top:12px;left:12px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.14);' +
      'background:rgba(255,255,255,.06);color:#cfc8de;font-size:18px;line-height:1;cursor:pointer}' +
    '.agp-fr-badge{display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:600;' +
      'background:rgba(37,244,238,.10);border:1px solid rgba(37,244,238,.35);color:#7cf6f2}' +
    '.agp-fr-title{margin:12px 0 6px;font-size:clamp(19px,3vw,24px);font-weight:800;line-height:1.5}' +
    '.agp-fr-sub{margin:0;font-size:14px;line-height:1.8;color:#a39bb3}' +
    '.agp-fr-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:10px 22px 24px}' +
    '.agp-fr-item{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 10px 12px;border-radius:18px;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:border-color .15s,transform .15s}' +
    '.agp-fr-item:hover{border-color:rgba(254,44,85,.55);transform:translateY(-2px)}' +
    '.agp-fr-img{width:100%;height:84px;display:grid;place-items:center}' +
    '.agp-fr-img img{max-width:100%;max-height:84px;object-fit:contain}' +
    '.agp-fr-name{font-size:13px;font-weight:600;text-align:center;min-height:20px;margin-top:auto}' +
    '.agp-fr-badge bdi{direction:ltr;unicode-bidi:isolate}' +
    '.agp-fr-pick{width:100%;padding:9px 10px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:#fff;' +
      'background:linear-gradient(135deg,#FE2C55,#ff5a7a);box-shadow:0 10px 22px -12px rgba(254,44,85,.9)}' +
    '.agp-fr-pick:disabled{opacity:.55;cursor:default}' +
    '.agp-fr-msg{padding:0 22px 16px;text-align:center;font-size:13px;color:#ff8da3;min-height:0}' +
    '.agp-fr-toast{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:99999;direction:rtl;padding:12px 20px;' +
      'border-radius:999px;background:#13101d;border:1px solid rgba(37,244,238,.4);color:#f4f2fb;font-size:14px;font-weight:600;' +
      'box-shadow:0 18px 40px -16px rgba(0,0,0,.9)}' +
    '@media (max-width:520px){.agp-fr-grid{grid-template-columns:repeat(2,1fr);padding:8px 14px 18px}.agp-fr-head{padding:22px 18px 10px}}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function toast(text) {
    var t = el('div', 'agp-fr-toast', text);
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function show(reward) {
    if (document.querySelector('.agp-fr-backdrop')) return;
    var st = el('style'); st.textContent = CSS; document.head.appendChild(st);

    var backdrop = el('div', 'agp-fr-backdrop');
    var modal = el('div', 'agp-fr-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var close = el('button', 'agp-fr-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'إغلاق');
    close.addEventListener('click', function () { backdrop.remove(); });

    var head = el('div', 'agp-fr-head');
    var badge = el('span', 'agp-fr-badge', '✓ تأكدنا من متابعتك لـ ');
    badge.appendChild(el('bdi', null, '@' + (reward.platformTikTok || 'aymngame')));
    head.appendChild(badge);
    head.appendChild(el('h2', 'agp-fr-title', 'شكراً لمتابعتك! اختر إطارك هدية 🎁'));
    head.appendChild(el('p', 'agp-fr-sub', 'اختر إطار واحد من كل الإطارات، وينضاف مباشرة لمقتنياتك.'));

    var grid = el('div', 'agp-fr-grid');
    var msg = el('div', 'agp-fr-msg');

    (reward.choices || []).forEach(function (c) {
      var item = el('div', 'agp-fr-item');
      var imgBox = el('div', 'agp-fr-img');
      if (c.imageFilename) {
        var img = el('img');
        img.src = c.imageFilename;
        img.alt = '';
        img.loading = 'lazy';
        imgBox.appendChild(img);
      }
      var name = c.displayNameAr || (c.frameType === 'catalog' ? CATALOG_NAMES[c.frameRef] : '') || 'إطار';
      var btn = el('button', 'agp-fr-pick', 'اختيار');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        Array.prototype.forEach.call(grid.querySelectorAll('.agp-fr-pick'), function (b) { b.disabled = true; });
        btn.textContent = '...';
        msg.textContent = '';
        window.AGPAuth.claimFollowReward(c.frameType, c.frameRef).then(function (r) {
          if (r && r.success) {
            backdrop.remove();
            toast('تم! إطار «' + name + '» صار في مقتنياتك ✨');
            return;
          }
          if (r && r.error === 'no_pending_reward') { backdrop.remove(); return; }
          msg.textContent = 'ما قدرنا نضيف الإطار، جرّب مرة ثانية.';
          Array.prototype.forEach.call(grid.querySelectorAll('.agp-fr-pick'), function (b) { b.disabled = false; });
          btn.textContent = 'اختيار';
        }).catch(function () {
          msg.textContent = 'تعذّر الاتصال، جرّب مرة ثانية.';
          Array.prototype.forEach.call(grid.querySelectorAll('.agp-fr-pick'), function (b) { b.disabled = false; });
          btn.textContent = 'اختيار';
        });
      });
      item.appendChild(imgBox);
      item.appendChild(el('div', 'agp-fr-name', name));
      item.appendChild(btn);
      grid.appendChild(item);
    });

    modal.appendChild(close);
    modal.appendChild(head);
    modal.appendChild(grid);
    modal.appendChild(msg);
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  }

  function check() {
    var auth = window.AGPAuth;
    if (!auth || typeof auth.getFollowReward !== 'function') return;
    if (typeof auth.getToken === 'function' && !auth.getToken()) return;
    auth.getFollowReward().then(function (r) {
      if (r && r.success && r.status === 'pending' && r.choices && r.choices.length) show(r);
    }).catch(function () {});
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(check, 1200); });
  else setTimeout(check, 1200);
})();
