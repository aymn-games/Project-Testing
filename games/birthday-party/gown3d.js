// فستان صاحبة الحفلة الفخم — مجسّم خاص لها وحدها (Mesh عادي، مو Instanced) بخامات أغنى
// من باقي الشخصيات: تنورة سهرة طويلة 3 طبقات بحواف متموّجة وتدرّج بنفسجي، شيفون شفاف فوقها،
// كورسيه وحزام ذهبي ببروش كريستال، نقاط لامعة تبرق، ذيل على الأرض، وأكمام شيفون منفوخة.
// يحل مكان الفستان والجذع الموحّدين عندها (crowd3d يخفيهم لما c.gown = true)،
// ويتحرك مع جسمها: يدور معها، والتنورة تتمايل وقت الرقص وتنفتح وقت اللفّة.
// مع شخصيات الهيكل العظمي (rig3d) ينربط بعظمة الورك عبر attachTo(bone, hipsY): يتبعها بنفسه،
// والكورسيه والأكمام تنخفى لأن جذعها المرن (skinned) هو اللي يلبسها.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const T = THREE;
// التدرّج الافتراضي من الخصر للأطراف، والشيفون والذهب
const PURPLE = ['#3b1a5c', '#6d3fa0', '#b38ae0'];
const CHIFFON = '#e6d4ff', SHEEN = '#f3e6ff', GOLD = '#f2cf8e';
const WAIST = .93;

// تدرّج بدرجات أي لون يختاره (غامق ← اللون ← فاتح)، بنفس فكرة التدرّج البنفسجي
function shadesOf(hex) {
  const c = new T.Color(hex);
  return [c.clone().multiplyScalar(.38), c.clone().multiplyScalar(.78), c.clone().lerp(new T.Color('#ffffff'), .35)];
}

export function createGown(scene) {
  const group = new T.Group(); group.visible = false; scene.add(group);
  const skirt = new T.Group(); group.add(skirt); // التنورة لحالها عشان تتمايل
  const geos = [], mats = [];
  const keep = (g) => { geos.push(g); return g; };

  // الخامة: ساتان بلمعة (sheen) وطبقة لمعان خفيفة (clearcoat)، واللون من vertex colors (التدرّج)
  const satin = new T.MeshPhysicalMaterial({ color: '#ffffff', vertexColors: true, roughness: .42, metalness: 0, sheen: 1, sheenColor: new T.Color(SHEEN), sheenRoughness: .3, clearcoat: .35, clearcoatRoughness: .35, side: T.DoubleSide });
  const chiffon = new T.MeshPhysicalMaterial({ color: CHIFFON, transparent: true, opacity: .22, roughness: .6, sheen: .8, sheenColor: new T.Color('#ffffff'), side: T.DoubleSide, depthWrite: false });
  const gold = new T.MeshStandardMaterial({ color: GOLD, metalness: .9, roughness: .22 });
  const crystal = new T.MeshPhysicalMaterial({ color: '#f6eaff', roughness: .05, metalness: .1, clearcoat: 1, emissive: '#b38ae0', emissiveIntensity: .35 });
  mats.push(satin, chiffon, gold, crystal);

  // كل جزء يلوّن نفسه حسب t (0 عند الخصر ← 1 عند الطرف)، فنحفظ t عشان نعيد التلوين لو تغيّر اللون
  const tinted = []; // {geo, t: Float32Array, k0, k1} — k0..k1 جزء التدرّج اللي يستخدمه
  function tint(geo, tFn, k0 = 0, k1 = 1) {
    const p = geo.attributes.position, t = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) t[i] = tFn(p.getX(i), p.getY(i), p.getZ(i));
    geo.setAttribute('color', new T.BufferAttribute(new Float32Array(p.count * 3), 3));
    tinted.push({ geo, t, k0, k1 });
  }

  // طبقة تنورة: Lathe من الخصر للحافة، وبعدين نموّج الحافة (طيّات) ونرفعها شوي بين الطيّات
  function layer(topY, topR, hemY, hemR, folds, amp, seed) {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const f = i / 14, y = topY + (hemY - topY) * f;
      pts.push(new T.Vector2(topR + (hemR - topR) * Math.pow(f, .72), y)); // تنفتح أكثر تحت (شكل جرس)
    }
    const g = new T.LatheGeometry(pts, 72), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i), f = Math.max(0, (topY - y) / (topY - hemY)), a = Math.atan2(z, x);
      const w = Math.sin(a * folds + seed) * .6 + Math.sin(a * folds * 2.3 + seed * 2) * .4;
      const k = 1 + w * amp * f * f;
      p.setXYZ(i, x * k, y + Math.max(0, w) * amp * .5 * Math.pow(f, 4), z * k);
    }
    g.computeVertexNormals();
    return keep(g);
  }
  // الأس 1.4: الغامق والمتوسط ياخذون مساحة أكبر، والفاتح بس قرب الحافة
  const skirtT = (lo, hi) => (x, y) => Math.pow(Math.max(0, Math.min(1, (WAIST - y) / (WAIST - lo))), 1.4) * hi;
  // من تحت لفوق: الطويلة لين الأرض، ثم الوسطى، ثم القصيرة
  const lay1 = layer(WAIST, .19, .015, .66, 9, .09, 0), lay2 = layer(WAIST + .01, .2, .24, .58, 8, .1, 1.3), lay3 = layer(WAIST + .02, .21, .5, .48, 7, .11, 2.6);
  tint(lay1, skirtT(.015, 1)); tint(lay2, skirtT(.24, .82)); tint(lay3, skirtT(.5, .62));
  for (const g of [lay1, lay2, lay3]) skirt.add(new T.Mesh(g, satin));
  // الشيفون فوق الكل، أوسع شوي
  const veil = layer(WAIST + .03, .22, .1, .7, 11, .07, 4.1);
  const veilM = new T.Mesh(veil, chiffon); veilM.renderOrder = 2; skirt.add(veilM);

  // الذيل: بيضاوي مفلطح ينسحب على الأرض ورا الحافة
  const train = keep(new T.SphereGeometry(1, 36, 12, 0, Math.PI * 2, 0, Math.PI / 2));
  train.scale(.42, .07, .78); train.translate(0, .012, -.42);
  tint(train, (x, y, z) => .55 + Math.min(1, Math.max(0, -z - .2) / .9) * .45);
  skirt.add(new T.Mesh(train, satin));

  // الكورسيه: من الخصر للصدر، أغمق من التنورة
  const bodice = keep(new T.LatheGeometry([[.16, WAIST - .02], [.165, .98], [.2, 1.06], [.235, 1.13], [.225, 1.2], [.2, 1.26]].map(([r, y]) => new T.Vector2(r, y)), 48));
  bodice.scale(1, 1, .84); bodice.computeVertexNormals();
  tint(bodice, (x, y) => .08 + Math.max(0, y - .98) * .55, 0, 1);
  const upper = []; // الكورسيه والحافة والأكمام: تنخفى وقت الربط بالعظمة
  const bodiceM = new T.Mesh(bodice, satin); group.add(bodiceM); upper.push(bodiceM);
  // حزام الخصر الذهبي + بروش كريستال بالنص + حافة ذهبية رفيعة فوق الصدر
  const belt = keep(new T.TorusGeometry(.172, .024, 10, 48)); belt.rotateX(Math.PI / 2); belt.scale(1, 1, .86); belt.translate(0, WAIST + .01, 0);
  group.add(new T.Mesh(belt, gold));
  const trim = keep(new T.TorusGeometry(.2, .009, 6, 48)); trim.rotateX(Math.PI / 2); trim.scale(1, 1, .84); trim.translate(0, 1.255, 0);
  const trimM = new T.Mesh(trim, gold); group.add(trimM); upper.push(trimM);
  const gem = keep(new T.OctahedronGeometry(.042, 0)); gem.scale(1, 1.25, .6); gem.translate(0, WAIST + .01, .158);
  group.add(new T.Mesh(gem, crystal));
  const setting = keep(new T.TorusGeometry(.05, .008, 6, 20)); setting.translate(0, WAIST + .01, .152);
  group.add(new T.Mesh(setting, gold));

  // الأكمام: كتوف شيفون منفوخة
  const puff = keep(new T.SphereGeometry(.115, 16, 12)); puff.scale(1, .82, 1);
  for (const sd of [-1, 1]) { const m = new T.Mesh(puff, chiffon); m.position.set(sd * .29, 1.22, 0); m.renderOrder = 2; group.add(m); upper.push(m); }

  // اللمعان: نقاط موزعة على الطبقة الطويلة، كل وحدة تبرق ببطء بطورها الخاص
  const SP = 110, spPos = new Float32Array(SP * 3), spCol = new Float32Array(SP * 3), spPh = new Float32Array(SP);
  for (let k = 0; k < SP; k++) {
    const f = .15 + Math.random() * .85, a = Math.random() * Math.PI * 2, y = WAIST + (.02 - WAIST) * f, r = (.19 + (.66 - .19) * Math.pow(f, .72)) * 1.015 + .01;
    spPos.set([Math.cos(a) * r, y, Math.sin(a) * r], k * 3); spPh[k] = Math.random() * Math.PI * 2;
  }
  const spGeo = keep(new T.BufferGeometry()); spGeo.setAttribute('position', new T.BufferAttribute(spPos, 3)); spGeo.setAttribute('color', new T.BufferAttribute(spCol, 3));
  const spTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 32; const g = c.getContext('2d'); const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.3, 'rgba(255,255,255,.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 32); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; })();
  const spMat = new T.PointsMaterial({ map: spTex, size: .06, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  mats.push(spMat);
  const sparkle = new T.Points(spGeo, spMat); sparkle.frustumCulled = false; skirt.add(sparkle);

  // التلوين: o = -1 البنفسجي الافتراضي، غيره درجات اللون المختار
  const g0 = new T.Color(), g1 = new T.Color();
  let colorKey = null;
  function setColor(hex) {
    const key = hex || 'purple'; if (key === colorKey) return; colorKey = key;
    const S = hex ? shadesOf(hex) : PURPLE.map(c => new T.Color(c));
    chiffon.color.set(hex ? new T.Color(hex).lerp(new T.Color('#ffffff'), .7) : CHIFFON);
    for (const { geo, t, k0, k1 } of tinted) {
      const col = geo.attributes.color.array;
      for (let i = 0; i < t.length; i++) {
        const u = k0 + (k1 - k0) * t[i];
        if (u < .5) g0.copy(S[0]).lerp(S[1], u * 2); else g0.copy(S[1]).lerp(S[2], (u - .5) * 2);
        col[i * 3] = g0.r; col[i * 3 + 1] = g0.g; col[i * 3 + 2] = g0.b;
      }
      geo.attributes.color.needsUpdate = true;
    }
  }
  setColor(null);

  let time = 0, flare = 1, attached = false;
  // يركب على عظمة الورك: الأصل (القدمين) تحت الورك بـ hipsY
  function attachTo(bone, hipsY) {
    attached = true; bone.add(group); group.position.set(0, -hipsY, 0); group.rotation.set(0, 0, 0); group.scale.setScalar(1);
    upper.forEach(m => { m.visible = false; });
  }
  // girl = {x, y, z, ry, s, an, phase, roll} من crowd.update، أو null لو ما هي موجودة
  function update(girl, dt) {
    group.visible = !!girl; if (!girl) return;
    time += dt;
    if (!attached) { group.position.set(girl.x, girl.y, girl.z); group.rotation.set(0, girl.ry, girl.roll, 'YXZ'); group.scale.setScalar(girl.s); }
    // تمايل التنورة مع الرقص، وتنفتح وقت اللفّة
    const an = girl.an, dancing = an === 2 || an === 8 || an === 6;
    skirt.rotation.y = dancing ? Math.sin(girl.phase) * .14 : Math.sin(time * .8) * .02;
    skirt.rotation.x = dancing ? Math.sin(girl.phase * .5) * .035 : 0;
    flare += ((an === 5 ? 1.16 : an === 2 ? 1.05 : 1) - flare) * (1 - Math.exp(-dt * 6));
    skirt.scale.set(flare, 1 - (flare - 1) * .35, flare);
    for (let k = 0; k < SP; k++) {
      const b = Math.max(0, Math.sin(time * 1.6 + spPh[k] * 3)) ** 6; // ومضة قصيرة وهدوء طويل
      const v = .12 + b * .95; spCol[k * 3] = v; spCol[k * 3 + 1] = v * .92; spCol[k * 3 + 2] = v;
    }
    spGeo.attributes.color.needsUpdate = true;
  }

  function dispose() { group.removeFromParent(); geos.forEach(g => g.dispose()); mats.forEach(m => m.dispose()); spTex.dispose(); }
  return { update, setColor, attachTo, setVisible: v => { group.visible = v; }, dispose };
}
