/**
 * نافذة "اختر إطارك" — تُستخدم لما يسترد اللاعب كود اختيار إطار (راجع
 * choice_codes بـ backend/collectibles/collectibles-service.js).
 *
 * AGPFramePicker.open({
 *   title, subtitle,
 *   choices: [{frameType, frameRef, imageFilename, displayNameAr}],
 *   onPick: function (choice, name) { return Promise<{ok:boolean, error?:string}> }
 * })
 * لما يرجع onPick بـ ok تنقفل النافذة. لو رجع error يظهر تحت القائمة.
 */
(function () {
  'use strict';

  var CATALOG_NAMES = {
    founder: 'المؤسس', streamer: 'الاستريمر', supporter: 'الداعم', distinguished: 'المميز',
    'level-1': 'المستوى 1', 'level-2': 'المستوى 2', 'level-3': 'المستوى 3', 'level-4': 'المستوى 4',
    'level-5': 'المستوى 5', 'level-6': 'المستوى 6', 'level-7': 'المستوى 7'
  };

  var CSS =
    '.agp-fp-backdrop{position:fixed;inset:0;z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;' +
      'background:rgba(3,2,8,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);direction:rtl;font-family:inherit}' +
    '.agp-fp-modal{position:relative;width:100%;max-width:760px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;' +
      'border-radius:24px;overflow:hidden;color:#f4f2fb;' +
      'background:linear-gradient(160deg,rgba(178,140,245,.14),#0e0b16 32%,#0e0b16 72%,rgba(122,63,212,.12));' +
      'border:1px solid rgba(255,255,255,.12);box-shadow:0 40px 90px -30px rgba(0,0,0,.95)}' +
    '.agp-fp-head{padding:26px 26px 14px;text-align:center}' +
    '.agp-fp-close{position:absolute;top:12px;left:12px;width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.14);' +
      'background:rgba(255,255,255,.06);color:#cfc8de;font-size:18px;line-height:1;cursor:pointer}' +
    '.agp-fp-title{margin:0 0 6px;font-size:clamp(19px,3vw,24px);font-weight:800;line-height:1.5}' +
    '.agp-fp-sub{margin:0;font-size:14px;line-height:1.8;color:#a39bb3}' +
    '.agp-fp-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:10px 22px 24px}' +
    '.agp-fp-item{display:flex;flex-direction:column;align-items:center;gap:8px;padding:14px 10px 12px;border-radius:18px;' +
      'background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);transition:border-color .15s,transform .15s}' +
    '.agp-fp-item:hover{border-color:rgba(178,140,245,.6);transform:translateY(-2px)}' +
    '.agp-fp-img{width:100%;height:84px;display:grid;place-items:center}' +
    '.agp-fp-img img{max-width:100%;max-height:84px;object-fit:contain}' +
    '.agp-fp-name{font-size:13px;font-weight:600;text-align:center;min-height:20px;margin-top:auto}' +
    '.agp-fp-pick{width:100%;padding:9px 10px;border-radius:999px;border:0;cursor:pointer;font:inherit;font-size:14px;font-weight:700;color:#fff;' +
      'background:linear-gradient(135deg,#7a3fd4,#b28cf5);box-shadow:0 10px 22px -12px rgba(122,63,212,.9)}' +
    '.agp-fp-pick:disabled{opacity:.55;cursor:default}' +
    '.agp-fp-msg{padding:0 22px 16px;text-align:center;font-size:13px;color:#ff8da3}' +
    '.agp-fp-msg:empty{display:none}' +
    '@media (max-width:520px){.agp-fp-grid{grid-template-columns:repeat(2,1fr);padding:8px 14px 18px}.agp-fp-head{padding:22px 18px 10px}}';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function ensureStyles() {
    if (document.getElementById('agp-fp-styles')) return;
    var st = el('style');
    st.id = 'agp-fp-styles';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  function frameName(c) {
    return c.displayNameAr || (c.frameType === 'catalog' ? CATALOG_NAMES[c.frameRef] : '') || 'إطار';
  }

  function open(opts) {
    if (document.querySelector('.agp-fp-backdrop')) return;
    ensureStyles();

    var backdrop = el('div', 'agp-fp-backdrop');
    var modal = el('div', 'agp-fp-modal');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');

    var close = el('button', 'agp-fp-close', '✕');
    close.type = 'button';
    close.setAttribute('aria-label', 'إغلاق');
    close.addEventListener('click', function () { backdrop.remove(); });

    var head = el('div', 'agp-fp-head');
    head.appendChild(el('h2', 'agp-fp-title', opts.title || 'اختر إطارك'));
    if (opts.subtitle) head.appendChild(el('p', 'agp-fp-sub', opts.subtitle));

    var grid = el('div', 'agp-fp-grid');
    var msg = el('div', 'agp-fp-msg');

    function setBusy(busy) {
      Array.prototype.forEach.call(grid.querySelectorAll('.agp-fp-pick'), function (b) { b.disabled = busy; });
    }

    (opts.choices || []).forEach(function (c) {
      var item = el('div', 'agp-fp-item');
      var imgBox = el('div', 'agp-fp-img');
      if (c.imageFilename) {
        var img = el('img');
        img.src = c.imageFilename;
        img.alt = '';
        img.loading = 'lazy';
        imgBox.appendChild(img);
      }
      var name = frameName(c);
      var btn = el('button', 'agp-fp-pick', 'اختيار');
      btn.type = 'button';
      btn.addEventListener('click', function () {
        setBusy(true);
        btn.textContent = '...';
        msg.textContent = '';
        Promise.resolve(opts.onPick(c, name)).then(function (r) {
          if (r && r.ok) { backdrop.remove(); return; }
          msg.textContent = (r && r.error) || 'ما قدرنا نضيف الإطار، جرّب مرة ثانية.';
          setBusy(false);
          btn.textContent = 'اختيار';
        }, function () {
          msg.textContent = 'تعذّر الاتصال، جرّب مرة ثانية.';
          setBusy(false);
          btn.textContent = 'اختيار';
        });
      });
      item.appendChild(imgBox);
      item.appendChild(el('div', 'agp-fp-name', name));
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

  window.AGPFramePicker = { open: open };
})();
