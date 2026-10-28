// تحكم التجوّل في القاعة: كيبورد (WASD/الأسهم + Shift للجري)، سحب بالماوس
// أو الإصبع للنظر، وعصا تحكم على الجوال. ما يحرك شي بنفسه — المشهد يقرأ
// الحالة كل إطار عبر read() (اللي يصفّر حركة النظر المتجمعة بعد قراءتها).
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'];

export function createControls(surface, joy) {
  const keys = new Set();
  let dx = 0, dy = 0, active = false, lookId = null, lx = 0, ly = 0;
  let joyId = null, jx = 0, jy = 0;
  const knob = joy && joy.querySelector('.joy-knob');

  const kd = e => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    if (!MOVE_KEYS.includes(e.code)) return;
    keys.add(e.code); active = true;
    if (e.code.startsWith('Arrow')) e.preventDefault();
  };
  const ku = e => keys.delete(e.code);
  const blur = () => keys.clear();

  const down = e => { if (lookId !== null) return; lookId = e.pointerId; lx = e.clientX; ly = e.clientY; surface.setPointerCapture(e.pointerId); };
  const move = e => {
    if (e.pointerId !== lookId) return;
    dx += e.clientX - lx; dy += e.clientY - ly; lx = e.clientX; ly = e.clientY;
    if (Math.abs(dx) + Math.abs(dy) > 3) active = true;
  };
  const up = e => { if (e.pointerId === lookId) lookId = null; };

  const R = 46;
  const jMove = e => {
    if (e.pointerId !== joyId) return;
    const b = joy.getBoundingClientRect();
    let ox = e.clientX - (b.left + b.width / 2), oy = e.clientY - (b.top + b.height / 2);
    const d = Math.hypot(ox, oy); if (d > R) { ox = ox / d * R; oy = oy / d * R; }
    jx = ox / R; jy = oy / R; active = true;
    if (knob) knob.style.transform = `translate(${ox}px, ${oy}px)`;
  };
  const jDown = e => { if (joyId !== null) return; joyId = e.pointerId; joy.setPointerCapture(e.pointerId); joy.classList.add('on'); jMove(e); e.stopPropagation(); };
  const jUp = e => { if (e.pointerId !== joyId) return; joyId = null; jx = jy = 0; joy.classList.remove('on'); if (knob) knob.style.transform = ''; };

  addEventListener('keydown', kd); addEventListener('keyup', ku); addEventListener('blur', blur);
  surface.addEventListener('pointerdown', down); surface.addEventListener('pointermove', move);
  surface.addEventListener('pointerup', up); surface.addEventListener('pointercancel', up);
  if (joy) { joy.addEventListener('pointerdown', jDown); joy.addEventListener('pointermove', jMove); joy.addEventListener('pointerup', jUp); joy.addEventListener('pointercancel', jUp); }

  const k = c => keys.has(c) ? 1 : 0;
  return {
    read() {
      let mx = k('KeyD') + k('ArrowRight') - k('KeyA') - k('ArrowLeft') + jx;
      let mz = k('KeyW') + k('ArrowUp') - k('KeyS') - k('ArrowDown') - jy;
      const m = Math.hypot(mx, mz); if (m > 1) { mx /= m; mz /= m; }
      const out = { mx, mz, dx, dy, run: k('ShiftLeft') || k('ShiftRight') || Math.hypot(jx, jy) > .92, active };
      dx = dy = 0; active = false;
      return out;
    },
    destroy() {
      removeEventListener('keydown', kd); removeEventListener('keyup', ku); removeEventListener('blur', blur);
      surface.removeEventListener('pointerdown', down); surface.removeEventListener('pointermove', move);
      surface.removeEventListener('pointerup', up); surface.removeEventListener('pointercancel', up);
      if (joy) { joy.removeEventListener('pointerdown', jDown); joy.removeEventListener('pointermove', jMove); joy.removeEventListener('pointerup', jUp); joy.removeEventListener('pointercancel', jUp); }
    },
  };
}
