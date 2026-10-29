// جمهور الحفلة بشخصيات الهيكل العظمي (rig3d.js) — بنفس واجهة createCrowd اللي في crowd3d.js،
// فـ play.html يبدّل بينهم حسب إعداد الغرفة room.chars بدون ما يتغير شي ثاني.
// - كل لاعب شخصية rig لحالها (SkinnedMesh)، ≤ 6 أوامر رسم للضيف.
// - مستويات القرب: أقرب NEAR للكاميرا يتحدثون كل إطار بفيزياء الشعر والفستان؛ الباقي كل إطارين
//   لين FAR_M متر وكل 4 أبعد، بدون فيزياء.
// - التفاعلات (react): إيموجي يطلع فوق راس صاحبه ويطير 1.6ث — pool ثابت (64 لكل نوع، أمر رسم واحد لكل نوع).
// - مطر القلوب (rain): قلوب تنزل قدام الكاميرا 4ث.
// - صاحبة الحفلة: setGirlFx(true) يشغّل السبوت لايت (شعاع وهمي بدون إضاءة حقيقية عشان ما تنعاد
//   الـ shaders) والأثر اللامع تحت رجولها.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { makeRig, loadClips } from './rig3d.js';
import { LOOK, REACTS, resolveLook, createMotion, createLabels, createReactions, fxPool, makeHeartTex, makeSparkTex } from './crowd-common.js';

export { LOOK, REACTS, resolveLook };
const T = THREE;
const CAP = 104, NEAR = 16, FAR_M = 40, LABELS = 12, NO_LABELS = new Map();

// الحركات المسجّلة تتحمّل مرة وحدة للصفحة كلها؛ لو فشلت تبقى النسخ المكتوبة بالكود
let clipsP = null;
const ensureClips = base => clipsP || (clipsP = loadClips(base).catch(() => null));

export function createCrowd(scene, { floorAt = () => 0, clipsBase = './anims/' } = {}) {
  ensureClips(clipsBase);
  const chars = new Map(); // n -> {n, name, role, online, buf, x, z, ry, ready, rig, look, lookKey}
  const motion = createMotion(chars), { setAutoPaths, posOf } = motion;
  const labels = createLabels(T, scene, { count: LABELS, heightOf: c => c.role === 'girl' ? 2.2 : 1.95 });
  let localN = null, getLocal = null, previewLook = null, frame = 0;

  // ظل ناعم تحت كل شخصية: InstancedMesh واحد للكل
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'); const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(60,20,40,.45)'); gr.addColorStop(1, 'rgba(60,20,40,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); return new T.CanvasTexture(c); })();
  const blobGeo = new T.PlaneGeometry(.95, .95); blobGeo.rotateX(-Math.PI / 2);
  const blobs = new T.InstancedMesh(blobGeo, new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), CAP);
  blobs.frustumCulled = false; blobs.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(blobs);
  const m4 = new T.Matrix4(), zero = new T.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < CAP; i++) blobs.setMatrixAt(i, zero);
  const free = Array.from({ length: CAP }, (_, i) => CAP - 1 - i);

  function lookOf(c) { return resolveLook(c.n, c.role, c.n === localN && previewLook ? previewLook : c.look); }
  function build(c) {
    if (c.rig) c.rig.dispose();
    c.rig = makeRig({ look: lookOf(c), role: c.role, n: c.n }); c.rig.root.visible = false; scene.add(c.rig.root);
    c.acc = 0;
  }
  function sync(players) {
    const seen = new Set();
    for (const [n, name, role, , online, look] of players) {
      seen.add(n);
      let c = chars.get(n);
      if (!c) {
        if (!free.length) continue;
        c = { n, slot: free.pop(), buf: [], x: 0, z: 0, ry: 0, ready: false, spin: 0, acc: 0 };
        chars.set(n, c);
      }
      const roleChanged = c.role !== role, lookKey = Array.isArray(look) ? look.join() : '';
      if (c.name !== name || roleChanged) labels.set(n, name, role === 'girl');
      c.name = name; c.role = role; c.online = !!online;
      if (roleChanged || !c.rig) { c.look = look; c.lookKey = lookKey; build(c); }
      else if (c.lookKey !== lookKey) { c.look = look; c.lookKey = lookKey; c.rig.setLook(lookOf(c)); }
    }
    for (const [n, c] of chars) if (!seen.has(n)) { if (c.rig) c.rig.dispose(); blobs.setMatrixAt(c.slot, zero); free.push(c.slot); chars.delete(n); labels.remove(n); }
    blobs.instanceMatrix.needsUpdate = true;
  }
  // معاينة شكل اللاعب نفسه في ركن التعديل قبل الحفظ (null = يرجع لشكله المحفوظ)
  function setLocalLook(look) { previewLook = look; const c = chars.get(localN); if (c && c.rig) c.rig.setLook(lookOf(c)); }
  function setLocal(n, getter) { localN = n; getLocal = getter; }

  // ---- المؤثرات وقت الحركات (fx من الشكل): قلوب وشرار وهالة ----
  const heartTex = makeHeartTex(T), sparkTex = makeSparkTex(T);
  const hearts = fxPool(T, scene, heartTex, .5, ['#ff2d7a', '#e11d74', '#ff5fa2', '#c026d3'], false, 1.8, 200);
  const sparks = fxPool(T, scene, sparkTex, .12, ['#ffd27a', '#ffffff', '#ffe9b0', '#f9c6ff'], true, .8, 320);
  const ringMat = new T.MeshBasicMaterial({ color: '#ffc04d', transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const ringGeo = new T.RingGeometry(.36, .52, 40); ringGeo.rotateX(-Math.PI / 2);
  const rings = Array.from({ length: NEAR }, () => { const m = new T.Mesh(ringGeo, ringMat); m.visible = false; m.renderOrder = 4; scene.add(m); return m; });

  // ---- التفاعلات ومطر القلوب (مشتركة مع الكلاسيكي) ----
  const fx = createReactions(T, scene, heartTex);
  // solo: مشهد النهاية — شخصية وحدة بس تبان (صاحبة الحفلة)، بدون أسماء ولا تفاعلات
  let solo = null;
  function react(n, e) {
    const c = chars.get(n); if (!c || !c.ready || !c.online || solo != null) return;
    fx.react(c.x, floorAt(c.x, c.z) + (c.role === 'girl' ? 2.05 : 1.8), c.z, e);
    if (c.rig) c.rig.express(REACTS[e], 1.6);
  }

  // ---- صاحبة الحفلة: سبوت لايت (شعاع وهمي) ودائرة ضوء على الأرض وأثر لامع ----
  const beamGeo = new T.CylinderGeometry(.18, 1.05, 7, 32, 1, true); beamGeo.translate(0, 3.5, 0);
  { const p = beamGeo.attributes.position, col = new Float32Array(p.count * 3); for (let i = 0; i < p.count; i++) { const f = .02 + .11 * (1 - p.getY(i) / 7); col.set([f, f * .92, f * .8], i * 3); } beamGeo.setAttribute('color', new T.BufferAttribute(col, 3)); }
  const beamMat = new T.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
  const beam = new T.Mesh(beamGeo, beamMat); beam.visible = false; beam.renderOrder = 3; scene.add(beam);
  const poolTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'), gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,240,215,.42)'); gr.addColorStop(.6, 'rgba(255,220,200,.16)'); gr.addColorStop(1, 'rgba(255,220,200,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
  const poolGeo = new T.PlaneGeometry(2.4, 2.4); poolGeo.rotateX(-Math.PI / 2);
  const pool = new T.Mesh(poolGeo, new T.MeshBasicMaterial({ map: poolTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false })); pool.visible = false; pool.renderOrder = 3; scene.add(pool);
  let girlFx = false, trailCarry = 0;
  function setGirlFx(on) { girlFx = !!on; }

  // ---- التحديث ----
  const dists = [];
  function update(dt, cam, serverNowMs) {
    frame++;
    let emN = 0, girl = null;
    dists.length = 0;
    for (const c of chars.values()) if (c.online && c.ready && c.rig) dists.push((c.x - cam.position.x) ** 2 + (c.z - cam.position.z) ** 2);
    // مسافة الأقرب رقم NEAR (اللي أقرب منها = تفاصيل كاملة)
    const nearD = dists.length > NEAR ? dists.sort((a, b) => a - b)[NEAR - 1] : Infinity;
    for (const c of chars.values()) {
      const rig = c.rig;
      if (!rig || !c.online || !c.ready || (solo != null && c.n !== solo)) { if (rig) rig.root.visible = false; blobs.setMatrixAt(c.slot, zero); continue; }
      const moving = motion.step(c, dt, serverNowMs, localN, getLocal);
      const an = c.anim === 6 ? 6 : moving ? 1 : (c.anim || 0);
      c.spin = an === 5 ? c.spin + dt * Math.PI * 2 / 1.2 : 0;
      rig.play(an);
      if (moving) rig.setSpeed(c.n === localN ? (c.run ? 3 : 1.5) : (c.speed || 1.3));
      const y = floorAt(c.x, c.z);
      rig.root.visible = true; rig.root.position.set(c.x, y, c.z); rig.root.rotation.y = c.ry + c.spin;
      const d = (c.x - cam.position.x) ** 2 + (c.z - cam.position.z) ** 2, near = d <= nearD || c.n === localN || c.role === 'girl';
      c.acc += dt;
      const every = near ? 1 : d < FAR_M * FAR_M ? 2 : 4;
      if ((frame + c.n) % every === 0) { rig.update(c.acc, near); c.acc = 0; }
      m4.makeTranslation(c.x, y + .015, c.z); blobs.setMatrixAt(c.slot, m4);
      const L = rig.look;
      if (L.fx && an >= 2 && near && emN < NEAR) {
        const R = Math.random, k = Math.floor((c.fxCarry = (c.fxCarry || 0) + dt * (L.fx === 1 ? 7 : 20))); c.fxCarry -= k;
        for (let j = 0; j < Math.min(k, 5); j++) {
          if (L.fx === 1) hearts.spawn(c.x + (R() - .5) * .6, y + 1.3 + R() * .4, c.z + (R() - .5) * .6, (R() - .5) * .3, .6 + R() * .4, (R() - .5) * .3);
          else if (L.fx === 2) { const a = R() * Math.PI * 2; sparks.spawn(c.x + Math.cos(a) * .3, y + .3 + R() * 1.4, c.z + Math.sin(a) * .3, Math.cos(a) * (.5 + R()), .7 + R(), Math.sin(a) * (.5 + R())); }
        }
        if (L.fx === 3) { const m = rings[emN]; m.visible = true; m.position.set(c.x, y + .03, c.z); m.rotation.y = serverNowMs / 600; const s = 1 + Math.sin(serverNowMs / 250 + c.n) * .08; m.scale.set(s, 1, s); }
        emN++;
      }
      if (c.role === 'girl') girl = { c, y, moving: moving || an >= 2 };
    }
    rings.forEach((m, r) => { if (r >= emN) m.visible = false; });
    blobs.instanceMatrix.needsUpdate = true;
    // السبوت لايت يتبعها
    const showFx = girlFx && !!girl;
    beam.visible = pool.visible = showFx;
    if (showFx) {
      beam.position.set(girl.c.x, girl.y, girl.c.z); pool.position.set(girl.c.x, girl.y + .02, girl.c.z);
      beamMat.opacity = .85 + Math.sin(serverNowMs / 400) * .15;
      if (girl.moving) {
        const R = Math.random, k = Math.floor(trailCarry += dt * 26); trailCarry -= k;
        for (let j = 0; j < Math.min(k, 5); j++) sparks.spawn(girl.c.x + (R() - .5) * .9, girl.y + .05 + R() * .25, girl.c.z + (R() - .5) * .9, (R() - .5) * .2, .3 + R() * .5, (R() - .5) * .2);
      }
    }
    hearts.step(dt, -.15); sparks.step(dt, 2.2);
    fx.step(dt, cam, serverNowMs);
    labels.update(dt, solo != null ? NO_LABELS : chars, cam, localN, floorAt);
  }

  // نجهّز shaders الشخصيات (ضيف بقبعة وشعر طويل وفستان، وصاحبة الحفلة) وقت التحميل بدل لحظة ظهورهم
  function prewarm(compile) {
    const tmp = [makeRig({ look: resolveLook(1, 'guest', [0, 1, 1, 1, 1, 1, 0, 3]), role: 'guest', n: 1 }), makeRig({ look: resolveLook(2, 'guest', [1, 2, 2, 2, 5, 0, 0, 1]), role: 'guest', n: 2 }), makeRig({ look: resolveLook(3, 'girl', null), role: 'girl', n: 3 })];
    tmp.forEach(r => { r.root.position.set(0, -50, 0); scene.add(r.root); r.update(.016, true); });
    const vis = [beam, pool, rings[0]]; vis.forEach(m => { m.visible = true; });
    compile();
    vis.forEach(m => { m.visible = false; }); tmp.forEach(r => r.dispose());
  }

  function dispose() {
    for (const c of chars.values()) if (c.rig) c.rig.dispose();
    chars.clear();
    scene.remove(blobs); blobs.geometry.dispose(); blobs.material.dispose(); blobTex.dispose();
    for (const p of [hearts, sparks]) { p.pts.geometry.dispose(); p.pts.material.dispose(); scene.remove(p.pts); }
    fx.dispose(); heartTex.dispose(); sparkTex.dispose();
    rings.forEach(m => scene.remove(m)); ringGeo.dispose(); ringMat.dispose();
    scene.remove(beam, pool); beamGeo.dispose(); beamMat.dispose(); poolGeo.dispose(); pool.material.dispose(); poolTex.dispose();
    labels.dispose();
  }

  // للاختبار: حالة كل شخصية، وعدد الجزيئات الحية
  const debug = () => [...chars.values()].map(c => ({ n: c.n, name: c.name, online: c.online, ready: c.ready, x: +c.x.toFixed(2), z: +c.z.toFixed(2), buf: c.buf.length, slot: c.slot, anim: c.rig ? c.rig.anim : null }));
  const fxDebug = () => Object.assign(fx.debug(), { beam: beam.visible });
  return { sync, apply: motion.apply, update, setLocal, setLocalLook, setAutoPaths, posOf, prewarm, dispose, debug, fxDebug, react, rain: fx.rain, setGirlFx, setSolo: n => { solo = n == null ? null : n; }, kind: 'rig', get count() { return chars.size; } };
}
