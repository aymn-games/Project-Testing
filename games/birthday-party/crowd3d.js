// شخصيات الحفلة (مؤقتة) — حتى 104 شخصية بعدد قليل جداً من أوامر الرسم:
// كل جزء من الجسم (فستان، جذع، رأس، شعر، عيون، يدين، رجلين، ظل) InstancedMesh
// واحد للكل، فتكلفة 100 شخصية تقريباً نفس تكلفة وحدة.
// الشكل والألوان مشتقة من رقم اللاعب (n) فيبقى نفس الشكل كل مرة. صاحبة الحفلة
// لها فستان أبيض وتاج ذهبي وهالة ضوء. تعديل الشكل الحقيقي يجي بالدفعة 2.
//
// الحركة: مواقع الباقين توصل من السيرفر 8 مرات/ث، ونعرضها متأخرة 150ms
// ونتنقّل بنعومة بين آخر عيّنتين (interpolation). شخصية اللاعب نفسه تُقرأ
// مباشرة من getLocal() بدون انتظار السيرفر.
// وقت المشي التلقائي (مرحلة الدخول) كل شخصية تمشي على مسار يحسبه الجوال نفسه
// (setAutoPaths) بتوقيت السيرفر — نفس الشي على كل الجوالات بدون إرسال حركة.
// الحركات: a = 0 وقوف · 1 مشي · 2 رقص · 3 تلويح · 4 تصفيق.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const T = THREE;
const CAP = 104;
const DELAY_MS = 150;
const LABELS = 12;
const SKIN = ['#f9d7c3', '#f1c3a5', '#e0a882', '#c98d66', '#9c6a4a'];
const HAIR = ['#3b2418', '#5a3622', '#8a5a35', '#c99a5b', '#1f1a1d', '#7a3b52'];
const OUTFIT = ['#f4a3c0', '#cdb6ef', '#a9dcc8', '#f7c59f', '#9fc6f0', '#f6d3e2', '#e98bb0', '#d9b8e8', '#ffd6a5', '#b5e2f0'];
const FONT = '"IBM Plex Sans Arabic", sans-serif';

const hash = n => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return h ^ (h >>> 16); };

export function createCrowd(scene, { floorAt = () => 0 } = {}) {
  const mat = (o = {}) => new T.MeshStandardMaterial({ color: '#ffffff', roughness: .6, ...o });
  const parts = {};
  const mk = (key, geo, m, count = CAP) => {
    const im = new T.InstancedMesh(geo, m, count); im.frustumCulled = false; im.count = count;
    im.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const zero = new T.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < count; i++) { im.setMatrixAt(i, zero); im.setColorAt(i, new T.Color('#ffffff')); }
    scene.add(im); parts[key] = im; return im;
  };
  // الجسم مبني حول نقطة الأصل عند القدمين، والطول تقريباً 1.75م
  const dress = new T.CylinderGeometry(.2, .42, .72, 18, 1); dress.translate(0, .62, 0);
  const torso = new T.SphereGeometry(.25, 18, 12); torso.scale(1, 1.05, .82); torso.translate(0, 1.08, 0);
  const head = new T.SphereGeometry(.3, 22, 16); head.translate(0, 1.55, 0);
  const hair = new T.SphereGeometry(.325, 22, 12, 0, Math.PI * 2, 0, Math.PI * .56); hair.rotateX(-.35); hair.translate(0, 1.59, -.03);
  const eye = new T.SphereGeometry(.045, 10, 8); eye.scale(.85, 1.2, .6);
  const limbLeg = new T.CapsuleGeometry(.075, .3, 4, 10); limbLeg.translate(0, -.2, 0);       // محور الدوران عند الورك
  const limbArm = new T.CapsuleGeometry(.06, .3, 4, 10); limbArm.translate(0, -.19, 0);       // محور الدوران عند الكتف
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(60,20,40,.45)'); gr.addColorStop(1, 'rgba(60,20,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const blob = new T.PlaneGeometry(1.1, 1.1); blob.rotateX(-Math.PI / 2);

  mk('dress', dress, mat({ roughness: .55 }));
  mk('torso', torso, mat({ roughness: .55 }));
  mk('head', head, mat({ roughness: .5 }));
  mk('hair', hair, mat({ roughness: .45 }));
  mk('eye', eye, mat({ roughness: .2 }), CAP * 2);
  mk('leg', limbLeg, mat({ roughness: .6 }), CAP * 2);
  mk('arm', limbArm, mat({ roughness: .55 }), CAP * 2);
  mk('blob', blob, new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }));

  // تاج وهالة صاحبة الحفلة (وحدة بس)
  const crown = new T.Group();
  const gold = new T.MeshStandardMaterial({ color: '#f2cf8e', metalness: .9, roughness: .2 });
  const band = new T.Mesh(new T.CylinderGeometry(.17, .15, .12, 18, 1, true), gold); band.material.side = T.DoubleSide; crown.add(band);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, c = new T.Mesh(new T.ConeGeometry(.04, .12, 6), gold); c.position.set(Math.cos(a) * .16, .11, Math.sin(a) * .16); crown.add(c); }
  crown.visible = false; scene.add(crown);
  const haloTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,230,245,.9)'); gr.addColorStop(.4, 'rgba(255,180,220,.35)'); gr.addColorStop(1, 'rgba(255,180,220,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
  const halo = new T.Sprite(new T.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); halo.scale.set(2.6, 3.2, 1); halo.visible = false; scene.add(halo);

  // ---- لوحات الأسماء: 12 فقط لأقرب الشخصيات للكاميرا ----
  const labelCache = new Map(); // n -> texture
  const labelTex = (name, girl) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.font = '700 54px ' + FONT; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(500, g.measureText(name).width + 56);
    g.fillStyle = girl ? 'rgba(201,79,126,.92)' : 'rgba(60,24,48,.72)'; g.beginPath(); g.roundRect((512 - w) / 2, 20, w, 88, 44); g.fill();
    g.fillStyle = '#fff'; g.fillText(name, 256, 66, 470);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };
  const labels = Array.from({ length: LABELS }, () => { const s = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false })); s.scale.set(1.9, .48, 1); s.visible = false; s.renderOrder = 5; scene.add(s); return s; });

  const chars = new Map(); // n -> {slot, name, role, online, buf:[], x,z,ry, phase, moving}
  const free = Array.from({ length: CAP }, (_, i) => CAP - 1 - i);
  let localN = null, getLocal = null, labelT = 0;
  let autoPaths = null; // {map: n → {points, cum, len}, t0, t1}
  // endRy(role): اتجاه الوقوف بعد الوصول (مثلاً للصورة: الكل يطالع الكاميرا)
  function setAutoPaths(map, t0, t1, endRy) {
    if (!map) {
      // نهاية المشي: نثبّت كل شخصية على نهاية مسارها عشان ما ترجع لعيّنات قديمة
      if (autoPaths) for (const [n, a] of Object.entries(autoPaths.map)) { const c = chars.get(+n); if (c) { const e = a.points[a.points.length - 1]; c.x = e[0]; c.z = e[1]; c.buf = [{ t: t0 || 0, x: e[0], z: e[1], ry: c.ry, a: 0 }]; } }
      autoPaths = null; return;
    }
    const m = {};
    for (const [n, points] of Object.entries(map)) {
      const cum = [0]; for (let i = 1; i < points.length; i++) cum.push(cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
      m[n] = { points, cum, len: cum[cum.length - 1] || 1 };
    }
    autoPaths = { map: m, t0, t1, endRy };
  }
  function pathAt(a, f) {
    const d = f * a.len; let i = 1; while (i < a.points.length - 1 && a.cum[i] < d) i++;
    const p0 = a.points[i - 1], p1 = a.points[i], seg = (a.cum[i] - a.cum[i - 1]) || 1, k = Math.max(0, Math.min(1, (d - a.cum[i - 1]) / seg));
    return [p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, Math.atan2(p1[0] - p0[0], p1[1] - p0[1])];
  }
  // مكان أي شخصية الحين (للمسارات: نقطة البداية) — null لو ما وصلها شي
  function posOf(n) { const c = chars.get(n); return c && c.ready ? [c.x, c.z] : null; }

  function paint(c) {
    const h = hash(c.n), girl = c.role === 'girl', i = c.slot;
    const col = new T.Color();
    parts.dress.setColorAt(i, col.set(girl ? '#fff4f8' : OUTFIT[h % OUTFIT.length]));
    parts.torso.setColorAt(i, col.set(girl ? '#ffe3ef' : OUTFIT[(h >>> 4) % OUTFIT.length]));
    parts.head.setColorAt(i, col.set(SKIN[(h >>> 8) % SKIN.length]));
    parts.hair.setColorAt(i, col.set(HAIR[(h >>> 12) % HAIR.length]));
    const skin = SKIN[(h >>> 8) % SKIN.length];
    for (const k of [0, 1]) { parts.eye.setColorAt(i * 2 + k, col.set('#2a1a24')); parts.leg.setColorAt(i * 2 + k, col.set(girl ? '#f9c6d9' : '#6d5a7a')); parts.arm.setColorAt(i * 2 + k, col.set(skin)); }
    for (const key in parts) if (parts[key].instanceColor) parts[key].instanceColor.needsUpdate = true;
  }

  function sync(players) {
    const seen = new Set();
    for (const [n, name, role, , online] of players) {
      seen.add(n);
      let c = chars.get(n);
      if (!c) {
        if (!free.length) continue;
        c = { n, slot: free.pop(), buf: [], x: 0, z: 0, ry: 0, phase: Math.random() * 6, moving: false, ready: false };
        chars.set(n, c);
      }
      const changed = c.name !== name || c.role !== role;
      c.name = name; c.role = role; c.online = !!online;
      if (changed) { paint(c); const old = labelCache.get(n); if (old) old.dispose(); labelCache.set(n, labelTex(name, role === 'girl')); }
    }
    for (const [n, c] of chars) if (!seen.has(n)) { hide(c); free.push(c.slot); chars.delete(n); const t = labelCache.get(n); if (t) { t.dispose(); labelCache.delete(n); } }
  }

  // rows = [[n, x, z, ry, a], ...] بتوقيت السيرفر now؛ reset=true لرسالة 'all'
  function apply(rows, now, reset) {
    for (const [n, x, z, ry, a] of rows) {
      const c = chars.get(n); if (!c) continue;
      if (reset || !c.ready) { c.buf.length = 0; c.x = x; c.z = z; c.ry = ry; c.ready = true; }
      c.buf.push({ t: now, x, z, ry, a });
      if (c.buf.length > 12) c.buf.shift();
    }
  }

  function setLocal(n, getter) { localN = n; getLocal = getter; }

  const m4 = new T.Matrix4(), base = new T.Matrix4(), q = new T.Quaternion(), e = new T.Euler(), v = new T.Vector3(), s1 = new T.Vector3(1, 1, 1), zero = new T.Matrix4().makeScale(0, 0, 0);
  function hide(c) {
    const i = c.slot;
    for (const k of ['dress', 'torso', 'head', 'hair', 'blob']) parts[k].setMatrixAt(i, zero);
    for (const k of ['eye', 'leg', 'arm']) { parts[k].setMatrixAt(i * 2, zero); parts[k].setMatrixAt(i * 2 + 1, zero); }
  }
  const lerpAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

  function update(dt, cam, serverNowMs) {
    const renderT = serverNowMs - DELAY_MS;
    let girl = null;
    for (const c of chars.values()) {
      if (!c.online || !c.ready) { hide(c); continue; }
      let moving;
      const ap = autoPaths && autoPaths.map[c.n];
      if (c.n === localN && getLocal) {
        const L = getLocal(); c.x = L.x; c.z = L.z; c.ry = L.ry; moving = L.moving; c.run = L.running; c.anim = moving ? 1 : (L.emote || 0);
      } else if (ap) {
        const f = Math.max(0, Math.min(1, (serverNowMs - autoPaths.t0) / Math.max(1, autoPaths.t1 - autoPaths.t0))), p = pathAt(ap, f);
        c.x = p[0]; c.z = p[1]; moving = f > 0 && f < 1; if (moving) c.ry = lerpAngle(c.ry, p[2], 1 - Math.exp(-dt * 10));
        else if (f >= 1 && autoPaths.endRy) c.ry = lerpAngle(c.ry, autoPaths.endRy(c.role), 1 - Math.exp(-dt * 6));
        c.run = false; c.anim = moving ? 1 : 0;
      } else {
        // نلقى العيّنتين اللي يقع بينهم وقت العرض
        const b = c.buf; let a0 = b[0], a1 = b[b.length - 1];
        for (let k = b.length - 1; k > 0; k--) if (b[k - 1].t <= renderT) { a0 = b[k - 1]; a1 = b[k]; break; }
        const span = a1.t - a0.t, k = span > 0 ? Math.max(0, Math.min(1, (renderT - a0.t) / span)) : 1;
        // البعيدين يوصلون مرة بالثانية بس — بدل القفز ننزلق لآخر موقع بنعومة
        const sparse = span > 400 || renderT > a1.t + 300;
        const tx = sparse ? a1.x : a0.x + (a1.x - a0.x) * k, tz = sparse ? a1.z : a0.z + (a1.z - a0.z) * k;
        moving = Math.hypot(tx - c.x, tz - c.z) > (sparse ? .05 : .004) || a1.a === 1;
        const sm = 1 - Math.exp(-dt * (sparse ? 3.5 : 18));
        c.x += (tx - c.x) * sm; c.z += (tz - c.z) * sm; c.ry = lerpAngle(c.ry, a1.ry, 1 - Math.exp(-dt * 10));
        c.run = false; c.anim = moving ? 1 : (a1.a || 0);
      }
      c.moving = moving;
      c.phase += dt * (moving ? (c.run ? 13 : 9) : 2);
      const an = moving ? 1 : (c.anim || 0), dance = an === 2;
      if (dance) c.phase += dt * 5;
      const y = floorAt(c.x, c.z), bob = moving ? Math.abs(Math.sin(c.phase)) * .05 : dance ? Math.abs(Math.sin(c.phase)) * .14 : Math.sin(c.phase) * .01;
      const scale = c.role === 'girl' ? 1.08 : 1;
      q.setFromEuler(e.set(0, c.ry, dance ? Math.sin(c.phase * .5) * .16 : 0, 'YXZ')); base.compose(v.set(c.x, y + bob, c.z), q, s1.set(scale, scale, scale));
      const i = c.slot;
      for (const k of ['dress', 'torso', 'head', 'hair']) parts[k].setMatrixAt(i, base);
      m4.compose(v.set(c.x, y + .02, c.z), q.identity(), s1.set(scale, 1, scale)); parts.blob.setMatrixAt(i, m4);
      const swing = moving ? Math.sin(c.phase) * .7 : 0, armIdle = moving ? 0 : Math.sin(c.phase * .8) * .05;
      for (const sd of [-1, 1]) {
        const j = i * 2 + (sd > 0 ? 1 : 0);
        // زاوية اليد حسب الحركة: رقص (فوق وتتمايل) · تلويح (اليمين فوق وتهتز) · تصفيق (قدام وتتقارب)
        let ax = -swing * sd * .9, az = sd * (.18 + armIdle), lx = swing * sd;
        if (dance) { ax = -2.7 + Math.sin(c.phase + sd) * .35; az = sd * (.35 + Math.sin(c.phase) * .2); lx = Math.sin(c.phase * 2 + sd) * .25; }
        else if (an === 3 && sd > 0) { ax = -2.9; az = .35 + Math.sin(c.phase * 6) * .45; }
        else if (an === 4) { ax = -1.35; az = -sd * (.32 + Math.abs(Math.sin(c.phase * 4)) * .3); }
        if (an === 3 || an === 4) c.phase += dt * .5;
        m4.compose(v.set(sd * .11, .42, 0), q.setFromEuler(e.set(lx, 0, 0)), s1.set(1, 1, 1)); parts.leg.setMatrixAt(j, m4.premultiply(base));
        m4.compose(v.set(sd * .3, 1.22, 0), q.setFromEuler(e.set(ax, 0, az)), s1.set(1, 1, 1)); parts.arm.setMatrixAt(j, m4.premultiply(base));
        m4.compose(v.set(sd * .11, 1.57, .27), q.identity(), s1.set(1, 1, 1)); parts.eye.setMatrixAt(j, m4.premultiply(base));
      }
      if (c.role === 'girl') girl = { x: c.x, y: y + bob, z: c.z, ry: c.ry, s: scale };
    }
    for (const key in parts) parts[key].instanceMatrix.needsUpdate = true;
    crown.visible = halo.visible = !!girl;
    if (girl) { crown.position.set(girl.x, girl.y + 1.9 * girl.s, girl.z); crown.rotation.y = girl.ry; halo.position.set(girl.x, girl.y + 1.1, girl.z); }

    // الأسماء لأقرب 12 (تتحدث كل نص ثانية)
    labelT -= dt;
    if (labelT <= 0) {
      labelT = .5;
      const list = [...chars.values()].filter(c => c.online && c.ready && c.n !== localN).map(c => ({ c, d: (c.x - cam.position.x) ** 2 + (c.z - cam.position.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, LABELS);
      labels.forEach((s, k) => { const it = list[k]; s.userData.c = it ? it.c : null; s.visible = !!it; if (it) { s.material.map = labelCache.get(it.c.n) || null; s.material.needsUpdate = true; } });
    }
    labels.forEach(s => { const c = s.userData.c; if (c && s.visible) s.position.set(c.x, floorAt(c.x, c.z) + 2.25 * (c.role === 'girl' ? 1.08 : 1) + (c.role === 'girl' ? .25 : 0), c.z); });
  }

  function dispose() {
    for (const key in parts) { parts[key].geometry.dispose(); parts[key].material.dispose(); scene.remove(parts[key]); }
    blobTex.dispose(); haloTex.dispose();
    crown.traverse(o => { o.geometry?.dispose(); }); gold.dispose(); scene.remove(crown, halo); halo.material.dispose();
    labels.forEach(s => { s.material.dispose(); scene.remove(s); }); labelCache.forEach(t => t.dispose());
  }

  // للاختبار: حالة كل شخصية
  const debug = () => [...chars.values()].map(c => ({ n: c.n, name: c.name, online: c.online, ready: c.ready, x: +c.x.toFixed(2), z: +c.z.toFixed(2), buf: c.buf.length, slot: c.slot }));
  return { sync, apply, update, setLocal, setAutoPaths, posOf, dispose, debug, get count() { return chars.size; } };
}
