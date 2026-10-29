// المشترك بين نوعي الشخصيات (الكلاسيكي crowd3d.js والهيكل العظمي crowd-rig.js):
// الألوان وأسماء الخيارات، والشكل الافتراضي المشتق من رقم اللاعب.
// الشكل look = [st, o, s, h, hs, acc, fx, hat] بنفس الترتيب والحدود اللي يفرضها السيرفر (LOOK_MAX).

export const SKIN = ['#f9d7c3', '#f1c3a5', '#e0a882', '#c98d66', '#9c6a4a'];
export const HAIR = ['#3b2418', '#5a3622', '#8a5a35', '#c99a5b', '#1f1a1d', '#7a3b52', '#e8cf9a', '#a8432f'];
export const OUTFIT = ['#f4a3c0', '#cdb6ef', '#a9dcc8', '#f7c59f', '#9fc6f0', '#f6d3e2', '#e98bb0', '#d9b8e8', '#ffd6a5', '#b5e2f0', '#8e6cc9', '#c94f7e'];

// أسماء الخيارات للوحة التعديل
export const LOOK = {
  styles: ['فستان', 'بنطلون وقميص'],
  outfits: OUTFIT, skins: SKIN, hairs: HAIR,
  hairStyles: ['قصير', 'طويل', 'كعكة', 'ذيلين', 'كيرلي قصير', 'كيرلي طويل'],
  accs: ['بدون', 'فيونكة', 'تاج صغير', 'وردة', 'نظارة', 'قبعة حفلة'],
  fxs: ['بدون', 'قلوب', 'شرار', 'هالة'],
  hats: ['بدون', 'منقّطة', 'مخطّطة', 'ذهبية لامعة', 'وردية بشراشيب'],
};

export const hash = n => { let h = (n * 2654435761) >>> 0; h ^= h >>> 13; h = Math.imul(h, 1274126177) >>> 0; return h ^ (h >>> 16); };

// الشكل الفعلي: -1 (أو ما فيه شكل) ← الافتراضي المشتق من n. صاحبة الحفلة st = 0 دايماً (فستانها الفخم)
// القبعة الافتراضية «بدون» — اللاعب يختارها من ركن التعديل
export function resolveLook(n, role, look) {
  const h = hash(n), L = Array.isArray(look) ? look : [], pick = (i, def) => (Number.isInteger(L[i]) && L[i] >= 0 ? L[i] : def);
  return {
    st: role === 'girl' ? 0 : pick(0, 0), o: pick(1, role === 'girl' ? -1 : h % OUTFIT.length), s: pick(2, (h >>> 8) % SKIN.length),
    h: pick(3, (h >>> 12) % 6), hs: pick(4, role === 'girl' ? 1 : (h >>> 18) % 3), acc: pick(5, 0), fx: pick(6, 0), hat: pick(7, 0),
  };
}

// ================= الحركة: التنقّل بين عيّنات السيرفر والمشي التلقائي =================
// مواقع الباقين توصل من السيرفر 8 مرات/ث، ونعرضها متأخرة DELAY_MS ونتنقّل بنعومة بين آخر عيّنتين.
// شخصية اللاعب نفسه تُقرأ مباشرة من getLocal(). وقت المشي التلقائي (setAutoPaths) كل شخصية تمشي
// على مسار يحسبه الجوال نفسه بتوقيت السيرفر — نفس الشي على كل الجوالات بدون إرسال حركة.
export const DELAY_MS = 150;
export const lerpAngle = (a, b, k) => { let d = b - a; d = Math.atan2(Math.sin(d), Math.cos(d)); return a + d * k; };

export function createMotion(chars) {
  let autoPaths = null; // {map: n → {points, cum, len}, t0, t1, endRy}
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
  // rows = [[n, x, z, ry, a], ...] بتوقيت السيرفر now؛ reset=true لرسالة 'all'
  function apply(rows, now, reset) {
    for (const [n, x, z, ry, a] of rows) {
      const c = chars.get(n); if (!c) continue;
      if (reset || !c.ready) { c.buf.length = 0; c.x = x; c.z = z; c.ry = ry; c.ready = true; }
      c.buf.push({ t: now, x, z, ry, a });
      if (c.buf.length > 12) c.buf.shift();
    }
  }
  // يحدّث مكان الشخصية واتجاهها وحركتها (c.x, c.z, c.ry, c.run, c.anim) ويرجع هل هي تمشي
  function step(c, dt, serverNowMs, localN, getLocal) {
    const renderT = serverNowMs - DELAY_MS;
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
      const ox = c.x, oz = c.z;
      c.x += (tx - c.x) * sm; c.z += (tz - c.z) * sm; c.ry = lerpAngle(c.ry, a1.ry, 1 - Math.exp(-dt * 10));
      c.speed = dt > 0 ? Math.hypot(c.x - ox, c.z - oz) / dt : 0;
      c.run = false; c.anim = moving ? 1 : (a1.a || 0);
    }
    c.moving = moving;
    return moving;
  }
  return { setAutoPaths, posOf, apply, step };
}

// ================= لوحات الأسماء: عدد ثابت لأقرب الشخصيات للكاميرا =================
const FONT = '"IBM Plex Sans Arabic", sans-serif';
// heightOf(c): ارتفاع اللوحة فوق الأرض لكل شخصية
export function createLabels(T, scene, { count = 12, heightOf }) {
  const cache = new Map(); // n -> texture
  const labelTex = (name, girl) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const g = c.getContext('2d');
    g.font = '700 54px ' + FONT; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = Math.min(500, g.measureText(name).width + 56);
    g.fillStyle = girl ? 'rgba(201,79,126,.92)' : 'rgba(60,24,48,.72)'; g.beginPath(); g.roundRect((512 - w) / 2, 20, w, 88, 44); g.fill();
    g.fillStyle = '#fff'; g.fillText(name, 256, 66, 470);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
  };
  const sprites = Array.from({ length: count }, () => { const s = new T.Sprite(new T.SpriteMaterial({ transparent: true, depthWrite: false })); s.scale.set(1.9, .48, 1); s.visible = false; s.renderOrder = 5; scene.add(s); return s; });
  let t = 0;
  return {
    set(n, name, girl) { const old = cache.get(n); if (old) old.dispose(); cache.set(n, labelTex(name, girl)); },
    remove(n) { const x = cache.get(n); if (x) { x.dispose(); cache.delete(n); } },
    // الأسماء لأقرب count (تتحدث كل نص ثانية)
    update(dt, chars, cam, localN, floorAt) {
      t -= dt;
      if (t <= 0) {
        t = .5;
        const list = [...chars.values()].filter(c => c.online && c.ready && c.n !== localN).map(c => ({ c, d: (c.x - cam.position.x) ** 2 + (c.z - cam.position.z) ** 2 })).sort((a, b) => a.d - b.d).slice(0, count);
        sprites.forEach((s, k) => { const it = list[k]; s.userData.c = it ? it.c : null; s.visible = !!it; if (it) { s.material.map = cache.get(it.c.n) || null; s.material.needsUpdate = true; } });
      }
      sprites.forEach(s => { const c = s.userData.c; if (c && s.visible) s.position.set(c.x, floorAt(c.x, c.z) + heightOf(c), c.z); });
    },
    dispose() { sprites.forEach(s => { s.material.dispose(); scene.remove(s); }); cache.forEach(x => x.dispose()); cache.clear(); },
  };
}

// ================= جزيئات المؤثرات (قلوب وشرار) — pool ثابت، أمر رسم واحد لكل نوع =================
const spriteTex = (T, draw) => { const c = document.createElement('canvas'); c.width = c.height = 64; draw(c.getContext('2d')); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t; };
// القلب: حافة أغمق (تنضرب بلون الجزيء) عشان يبان فوق أرضية القاعة الوردية، ولمعة صغيرة
export const makeHeartTex = T => spriteTex(T, g => {
  g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(4, 36, 8, 8, 32, 21); g.bezierCurveTo(56, 8, 60, 36, 32, 56); g.closePath();
  g.fillStyle = '#fff'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#7a7a7a'; g.lineJoin = 'round'; g.stroke();
  g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.ellipse(21, 24, 5, 3.4, -.6, 0, Math.PI * 2); g.fill();
});
export const makeSparkTex = T => spriteTex(T, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.22, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
export function fxPool(T, scene, tex, size, colors, additive, maxLife, FXN) {
  const pos = new Float32Array(FXN * 3).fill(-100), col = new Float32Array(FXN * 3), base = new Float32Array(FXN * 3), vel = new Float32Array(FXN * 3), life = new Float32Array(FXN);
  const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
  const pts = new T.Points(geo, new T.PointsMaterial({ map: tex, size, vertexColors: true, transparent: true, depthWrite: false, alphaTest: .05, blending: additive ? T.AdditiveBlending : T.NormalBlending }));
  pts.frustumCulled = false; scene.add(pts);
  const cc = new T.Color(); let next = 0;
  return {
    pts, tex,
    spawn(x, y, z, vx, vy, vz) {
      const k = next; next = (next + 1) % FXN;
      pos.set([x, y, z], k * 3); vel.set([vx, vy, vz], k * 3); life[k] = maxLife * (.75 + Math.random() * .25);
      cc.set(colors[Math.floor(Math.random() * colors.length)]); base.set([cc.r, cc.g, cc.b], k * 3); col.set([cc.r, cc.g, cc.b], k * 3);
    },
    step(dt, gravity) {
      let any = false;
      for (let k = 0; k < FXN; k++) {
        if (life[k] <= 0) continue;
        any = true; life[k] -= dt;
        if (life[k] <= 0) { pos[k * 3 + 1] = -100; continue; }
        vel[k * 3 + 1] -= gravity * dt;
        pos[k * 3] += vel[k * 3] * dt; pos[k * 3 + 1] += vel[k * 3 + 1] * dt; pos[k * 3 + 2] += vel[k * 3 + 2] * dt;
        if (additive) { const f = Math.min(1, life[k] / (maxLife * .5)); for (let j = 0; j < 3; j++) col[k * 3 + j] = base[k * 3 + j] * f; }
      }
      if (any) { geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true; }
    },
    alive() { let n = 0; for (let k = 0; k < FXN; k++) if (life[k] > 0) n++; return n; },
  };
}

// ================= التفاعلات (إيموجي يطير فوق الراس) ومطر القلوب =================
// نفس ترتيب السيرفر (REACTS)؛ الثلاثة الأخيرة لصاحبة الحفلة بس
export const REACTS = ['heart', 'smile', 'laugh', 'party', 'crown', 'love', 'sparkle'];
export const REACT_EMOJI = ['❤️', '😊', '😂', '🎉', '👑', '💖', '✨'];
const REACT_POOL = 64, RAIN_MS = 4000;
function emojiTex(T, ch) {
  const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.font = '72px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 48, 54);
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return t;
}
// pool ثابت لكل نوع (64، أمر رسم واحد لكل نوع): سيل تفاعلات يكتب فوق الأقدم بدل ما يكبر
export function createReactions(T, scene, heartTex) {
  const texs = REACT_EMOJI.map(ch => emojiTex(T, ch));
  const pools = texs.map(t => fxPool(T, scene, t, .55, ['#ffffff'], false, 1.6, REACT_POOL));
  const rain = fxPool(T, scene, heartTex, .42, ['#ff2d7a', '#ff5fa2', '#ff8fc0', '#e11d74', '#ffffff'], false, 3.2, 320);
  let rainAt = -1e15, carry = 0;
  const dir = new T.Vector3();
  return {
    // x, top, z: فوق راس صاحب التفاعل
    react(x, top, z, e) { const p = pools[e], R = Math.random; if (p) p.spawn(x + (R() - .5) * .3, top, z + (R() - .5) * .3, (R() - .5) * .4, 1.1 + R() * .3, (R() - .5) * .4); },
    // at بتوقيت السيرفر؛ القلوب تنزل 4ث قدام الكاميرا (اللي فاته الوقت ما يشوف شي)
    rain(at) { rainAt = at; },
    step(dt, cam, now) {
      pools.forEach(p => p.step(dt, -.2));
      if (now - rainAt < RAIN_MS && now >= rainAt - 1000) {
        cam.getWorldDirection(dir); dir.y = 0; dir.normalize();
        const n = Math.floor(carry += dt * 75); carry -= n;
        for (let k = 0; k < Math.min(n, 12); k++) {
          const R = Math.random, f = 2 + R() * 11, sx = (R() - .5) * (4 + f * 1.1);
          rain.spawn(cam.position.x + dir.x * f - dir.z * sx, 5 + R() * 3, cam.position.z + dir.z * f + dir.x * sx, (R() - .5) * .4, -1.6 - R(), (R() - .5) * .4);
        }
      }
      rain.step(dt, .6);
    },
    debug() { return { reacts: pools.map(p => p.alive()), rain: rain.alive() }; },
    dispose() { for (const p of [...pools, rain]) { p.pts.geometry.dispose(); p.pts.material.dispose(); scene.remove(p.pts); } texs.forEach(t => t.dispose()); },
  };
}
