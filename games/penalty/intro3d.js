import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FONT = '"IBM Plex Sans Arabic", sans-serif';

export function mountIntro(el, { teams, duration = 30, onProgress, onDone }) {
  const W = () => el.clientWidth || innerWidth, H = () => el.clientHeight || innerHeight;
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  Object.assign(renderer.domElement.style, { width: '100%', height: '100%', display: 'block' });
  el.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0816);
  scene.fog = new THREE.Fog(0x0b0816, 45, 120);
  const camera = new THREE.PerspectiveCamera(42, W() / H(), 0.1, 300);

  scene.add(new THREE.HemisphereLight(0xd6dcff, 0x1a3a20, 0.95));
  const sun = new THREE.DirectionalLight(0xffffff, 2.3);
  sun.position.set(8, 18, 12); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 10, bottom: -10, near: 1, far: 60 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xb9a4ff, 0.9); rim.position.set(-10, 8, -14); scene.add(rim);

  // ---------- pitch ----------
  const PW = 70, PH = 46;
  const cv = document.createElement('canvas'); cv.width = 2048; cv.height = 1346;
  const g = cv.getContext('2d'), sx = cv.width / PW, sz = cv.height / PH;
  g.fillStyle = '#1b6236'; g.fillRect(0, 0, cv.width, cv.height);
  const fx0 = 5 * sx, fz0 = 3 * sz, fw = 60 * sx, fh = 40 * sz;
  for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#2a8a4c' : '#24803f'; g.fillRect(fx0 + i * fw / 12, fz0, fw / 12 + 1, fh); }
  g.strokeStyle = 'rgba(255,255,255,.92)'; g.lineWidth = 6;
  g.strokeRect(fx0, fz0, fw, fh);
  g.beginPath(); g.moveTo(fx0 + fw / 2, fz0); g.lineTo(fx0 + fw / 2, fz0 + fh); g.stroke();
  g.beginPath(); g.arc(fx0 + fw / 2, fz0 + fh / 2, 5 * sx, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#fff'; g.beginPath(); g.arc(fx0 + fw / 2, fz0 + fh / 2, 9, 0, 7); g.fill();
  const bw = 9 * sx, bh = 20 * sz, sbw = 3.5 * sx, sbh = 9 * sz;
  g.strokeRect(fx0, fz0 + (fh - bh) / 2, bw, bh); g.strokeRect(fx0 + fw - bw, fz0 + (fh - bh) / 2, bw, bh);
  g.strokeRect(fx0, fz0 + (fh - sbh) / 2, sbw, sbh); g.strokeRect(fx0 + fw - sbw, fz0 + (fh - sbh) / 2, sbw, sbh);
  const ptex = new THREE.CanvasTexture(cv); ptex.colorSpace = THREE.SRGBColorSpace; ptex.anisotropy = 8;
  const pitch = new THREE.Mesh(new THREE.PlaneGeometry(PW, PH), new THREE.MeshStandardMaterial({ map: ptex, roughness: 0.95 }));
  pitch.rotation.x = -Math.PI / 2; pitch.receiveShadow = true; scene.add(pitch);

  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, ...o });
  const part = (geo, mat, x, y, z, parent) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; parent.add(m); return m; };

  // goals
  const white = M(0xffffff, { roughness: 0.3 });
  for (const s of [-1, 1]) {
    const goal = new THREE.Group(); goal.position.x = s * 30; scene.add(goal);
    for (const z of [-3.66, 3.66]) part(new THREE.CylinderGeometry(0.07, 0.07, 2.44, 10), white, 0, 1.22, z, goal);
    const bar = part(new THREE.CylinderGeometry(0.07, 0.07, 7.32, 10), white, 0, 2.44, 0, goal); bar.rotation.x = Math.PI / 2;
    const net = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.44, 7.32), new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, side: THREE.DoubleSide }));
    net.position.set(s * 0.9, 1.22, 0); goal.add(net);
  }

  // ad boards
  const ad = document.createElement('canvas'); ad.width = 1024; ad.height = 64;
  const ag = ad.getContext('2d'); const grd = ag.createLinearGradient(0, 0, 0, 64); grd.addColorStop(0, '#7c3aed'); grd.addColorStop(1, '#4c1d95');
  ag.fillStyle = grd; ag.fillRect(0, 0, 1024, 64); ag.fillStyle = '#fde7a8'; ag.font = `800 40px ${FONT}`; ag.textAlign = 'center'; ag.textBaseline = 'middle';
  for (let i = 0; i < 4; i++) ag.fillText('ألعاب أيمن', 128 + i * 256, 34);
  const atex = new THREE.CanvasTexture(ad); atex.colorSpace = THREE.SRGBColorSpace; atex.wrapS = THREE.RepeatWrapping;
  const boardMat = (len) => { const t = atex.clone(); t.needsUpdate = true; t.repeat.set(len / 16, 1); return new THREE.MeshStandardMaterial({ map: t, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.55 }); };
  [[0, 21.6, 64, 0], [0, -21.6, 64, Math.PI], [32.6, 0, 40, -Math.PI / 2], [-32.6, 0, 40, Math.PI / 2]].forEach(([x, z, len, ry]) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.9), boardMat(len)); b.position.set(x, 0.45, z); b.rotation.y = ry + Math.PI; scene.add(b);
  });

  // ---------- stands + crowd ----------
  const pal = [teams[0].color, teams[1].color, '#a78bfa', '#ffffff', '#f472b6'];
  const sides = [
    { th: 0, dist: 24, len: 74, mix: [0, 1, 2, 3, 4] },
    { th: Math.PI, dist: 24, len: 74, mix: [0, 1, 2, 3] },
    { th: Math.PI / 2, dist: 36, len: 48, mix: [1, 1, 1, 3, 2] },
    { th: -Math.PI / 2, dist: 36, len: 48, mix: [0, 0, 0, 3, 2] },
  ];
  const fans = [];
  const ROWS = 10;
  sides.forEach(sd => {
    const grp = new THREE.Group(); grp.rotation.y = sd.th; scene.add(grp);
    for (let k = 0; k < ROWS; k++) {
      const row = new THREE.Mesh(new THREE.BoxGeometry(sd.len, 0.75 * (k + 1), 1.1), M(k % 2 ? 0x221a36 : 0x2b2245, { roughness: 0.9 }));
      row.position.set(0, 0.375 * (k + 1), sd.dist + k * 1.1 + 0.55); row.receiveShadow = true; grp.add(row);
      const c = Math.cos(sd.th), s = Math.sin(sd.th);
      for (let lx = -sd.len / 2 + 0.5; lx < sd.len / 2 - 0.3; lx += 0.75) {
        const lz = sd.dist + k * 1.1 + 0.55 + (Math.random() - 0.5) * 0.2;
        fans.push({ x: lx * c + lz * s, z: -lx * s + lz * c, y: 0.75 * (k + 1) + 0.42, col: pal[sd.mix[Math.floor(Math.random() * sd.mix.length)]],
          f: 5 + Math.random() * 5, ph: Math.random() * 7, amp: 0.08 + Math.random() * 0.4 });
      }
    }
  });
  const fanGeo = new THREE.CapsuleGeometry(0.22, 0.42, 3, 8);
  const crowd = new THREE.InstancedMesh(fanGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), fans.length);
  const dummy = new THREE.Object3D(), col = new THREE.Color();
  fans.forEach((f, i) => { col.set(f.col).multiplyScalar(0.75 + Math.random() * 0.35); crowd.setColorAt(i, col); });
  scene.add(crowd);

  // floodlights
  const glowCv = document.createElement('canvas'); glowCv.width = glowCv.height = 128;
  const gg = glowCv.getContext('2d'), rg = gg.createRadialGradient(64, 64, 0, 64, 64, 64);
  rg.addColorStop(0, 'rgba(255,255,240,1)'); rg.addColorStop(0.25, 'rgba(255,250,220,.5)'); rg.addColorStop(1, 'rgba(255,250,220,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 128, 128);
  const glowTex = new THREE.CanvasTexture(glowCv);
  for (const [x, z] of [[40, 30], [-40, 30], [40, -30], [-40, -30]]) {
    part(new THREE.CylinderGeometry(0.35, 0.5, 24, 10), M(0x3a3550), x, 12, z, scene);
    const head = part(new THREE.BoxGeometry(5, 3, 0.6), M(0xffffff, { emissive: 0xfffbe6, emissiveIntensity: 1.6 }), x, 24.5, z, scene);
    head.lookAt(0, 0, 0);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    spr.scale.set(18, 18, 1); spr.position.set(x * 0.97, 24.5, z * 0.97); scene.add(spr);
  }

  // ---------- people ----------
  const skins = [0xf2b48a, 0xd99a6c, 0xb7794d, 0xf7c9a5];
  const hairs = [0x2b190d, 0x111111, 0x5a3a1e, 0x3b2414];
  const numberTex = (n, fg, bg) => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    x.fillStyle = bg; x.fillRect(0, 0, 128, 128); x.fillStyle = fg; x.font = `800 92px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(n), 64, 70);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const nameSprite = (name, color) => {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d');
    x.font = `700 58px ${FONT}`; const w = Math.min(480, x.measureText(name).width + 70);
    x.fillStyle = 'rgba(10,9,15,.82)'; x.beginPath(); x.roundRect(256 - w / 2, 18, w, 92, 46); x.fill();
    x.lineWidth = 5; x.strokeStyle = color; x.stroke();
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.direction = 'rtl'; x.fillText(name, 256, 68);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
    s.scale.set(1.9, 0.475, 1); return s;
  };
  function person(o) {
    const p = new THREE.Group();
    const skin = M(o.skin), kit = M(o.kit, { roughness: 0.45 }), shorts = M(o.shorts), socks = M(o.socks), boot = M(0x111111, { roughness: 0.3 }), hair = M(o.hair, { roughness: 0.85 });
    for (const s of [-1, 1]) {
      part(new THREE.CapsuleGeometry(0.12, 0.32, 4, 10), skin, s * 0.16, 0.64, 0, p);
      part(new THREE.CylinderGeometry(0.135, 0.12, 0.38, 12), socks, s * 0.16, 0.3, 0, p);
      part(new THREE.BoxGeometry(0.24, 0.12, 0.38), boot, s * 0.16, 0.06, 0.05, p);
    }
    part(new THREE.CylinderGeometry(0.34, 0.37, 0.32, 18), shorts, 0, 0.93, 0, p);
    part(new THREE.CapsuleGeometry(0.34, 0.38, 6, 18), kit, 0, 1.37, 0, p);
    const arms = [];
    for (const s of [-1, 1]) {
      const piv = new THREE.Group(); piv.position.set(s * 0.44, 1.62, 0); p.add(piv);
      part(new THREE.SphereGeometry(0.15, 14, 10), kit, 0, 0, 0, piv);
      part(new THREE.CapsuleGeometry(0.1, 0.42, 4, 10), skin, 0, -0.3, 0, piv);
      if (o.flag && s === 1) {
        part(new THREE.CylinderGeometry(0.02, 0.02, 0.9, 6), M(0xdddddd), 0, -0.55, 0.12, piv);
        const fl = part(new THREE.PlaneGeometry(0.4, 0.3), new THREE.MeshStandardMaterial({ color: o.flag, side: THREE.DoubleSide }), 0.2, -0.25, 0.12, piv);
        fl.castShadow = false;
      }
      piv.rotation.z = s * 0.18; arms.push(piv);
    }
    const head = new THREE.Group(); head.position.y = 2.1; p.add(head);
    part(new THREE.SphereGeometry(0.38, 26, 20), skin, 0, 0, 0, head);
    part(new THREE.SphereGeometry(0.4, 26, 14, 0, Math.PI * 2, 0, Math.PI * 0.46), hair, 0, 0.03, -0.01, head);
    part(new THREE.SphereGeometry(0.395, 26, 14, Math.PI, Math.PI, Math.PI * 0.45, Math.PI * 0.27), hair, 0, 0.02, 0, head);
    for (const s of [-1, 1]) {
      part(new THREE.SphereGeometry(0.075, 10, 8), skin, s * 0.38, -0.02, 0, head);
      part(new THREE.SphereGeometry(0.05, 10, 8), M(0x111111, { roughness: 0.2 }), s * 0.13, 0.0, 0.345, head);
      part(new THREE.SphereGeometry(0.06, 10, 8), M(0xf472b6, { transparent: true, opacity: 0.45 }), s * 0.22, -0.11, 0.31, head);
    }
    const mouth = part(new THREE.TorusGeometry(0.07, 0.018, 6, 12, Math.PI), M(0x9f1239), 0, -0.13, 0.35, head); mouth.rotation.z = Math.PI;
    if (o.num != null) {
      const back = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.42), new THREE.MeshStandardMaterial({ map: numberTex(o.num, o.numColor || '#fff', o.kit), roughness: 0.5 }));
      back.position.set(0, 1.42, -0.36); back.rotation.y = Math.PI; p.add(back);
      const front = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), new THREE.MeshStandardMaterial({ map: numberTex(o.num, o.numColor || '#fff', o.kit) }));
      front.position.set(0.14, 1.55, 0.345); p.add(front);
    }
    if (o.name) { const s = nameSprite(o.name, o.tag); s.position.y = 2.95; p.add(s); }
    return { p, arms, head, ph: Math.random() * 7, wave: o.wave !== false };
  }

  const people = [];
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  teams.forEach((T, k) => {
    const side = k ? 1 : -1;
    const lineup = [...T.players.slice(0, 5).map((n, i) => ({ name: n, num: [7, 10, 9, 4, 11][i] })), { name: 'الحارس', num: 1, gk: true }];
    lineup.forEach((pl, i) => {
      const o = pl.gk
        ? { kit: k ? 0xec4899 : 0x16a34a, shorts: 0x111827, socks: k ? 0xec4899 : 0x16a34a }
        : { kit: T.kit, shorts: T.shorts, socks: T.socks };
      const h = person({ ...o, skin: rnd(skins), hair: rnd(hairs), num: pl.num, name: pl.name, tag: T.color, numColor: T.numColor });
      h.p.position.set(side * (2.7 + i * 1.3), 0, 0); scene.add(h.p); people.push(h);
    });
  });
  const refs = [
    person({ kit: 0x111827, shorts: 0x111827, socks: 0x111827, skin: rnd(skins), hair: 0x111111, name: 'الحكم', tag: '#f0c25a', wave: false }),
    person({ kit: 0x111827, shorts: 0x111827, socks: 0x111827, skin: rnd(skins), hair: 0x2b190d, flag: 0xfacc15, wave: false }),
    person({ kit: 0x111827, shorts: 0x111827, socks: 0x111827, skin: rnd(skins), hair: 0x3b2414, flag: 0xef4444, wave: false }),
  ];
  [0, -1.15, 1.15].forEach((x, i) => { refs[i].p.position.set(x, 0, i ? 0.25 : 0.1); scene.add(refs[i].p); people.push(refs[i]); });

  // ball
  const bc = document.createElement('canvas'); bc.width = 256; bc.height = 128; const bx = bc.getContext('2d');
  bx.fillStyle = '#fff'; bx.fillRect(0, 0, 256, 128); bx.fillStyle = '#111';
  for (let i = 0; i < 12; i++) { bx.beginPath(); bx.arc((i % 6) * 44 + (i > 5 ? 22 : 0) + 10, i > 5 ? 90 : 38, 13, 0, 7); bx.fill(); }
  const btex = new THREE.CanvasTexture(bc); btex.colorSpace = THREE.SRGBColorSpace;
  const ball = part(new THREE.SphereGeometry(0.22, 24, 18), new THREE.MeshStandardMaterial({ map: btex, roughness: 0.4 }), 0, 0.22, 0.85, scene);

  // confetti
  const N = 1400, cpos = new Float32Array(N * 3), ccol = new Float32Array(N * 3), cvel = [];
  for (let i = 0; i < N; i++) {
    cpos.set([(Math.random() - 0.5) * 34, Math.random() * 16, (Math.random() - 0.5) * 22], i * 3);
    col.set(pal[i % pal.length]); ccol.set([col.r, col.g, col.b], i * 3);
    cvel.push({ v: 0.8 + Math.random() * 1.6, ph: Math.random() * 7 });
  }
  const cgeo = new THREE.BufferGeometry(); cgeo.setAttribute('position', new THREE.BufferAttribute(cpos, 3)); cgeo.setAttribute('color', new THREE.BufferAttribute(ccol, 3));
  const confetti = new THREE.Points(cgeo, new THREE.PointsMaterial({ size: 0.16, vertexColors: true }));
  scene.add(confetti);

  // ---------- loop ----------
  const ease = (x) => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);
  let raf, last = performance.now(), t0 = last, lastP = -1, done = false;
  const target = new THREE.Vector3(0, 1.3, 0);
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    const t = (now - t0) / 1000, p = Math.min(1, t / duration);
    const a = p * Math.PI * 2;
    const intro = ease(t / 3.5);
    const r = THREE.MathUtils.lerp(38, 15 + 9 * Math.abs(Math.sin(a)) + 1.5 * Math.sin(t * 0.35), intro);
    const h = THREE.MathUtils.lerp(17, 4 + 1.6 * Math.abs(Math.sin(a)) + 1 * Math.sin(t * 0.27 + 0.6), intro);
    camera.position.set(Math.sin(a) * r, h, Math.cos(a) * r);
    camera.lookAt(target);

    fans.forEach((f, i) => {
      dummy.position.set(f.x, f.y + Math.abs(Math.sin(t * f.f + f.ph)) * f.amp, f.z);
      dummy.updateMatrix(); crowd.setMatrixAt(i, dummy.matrix);
    });
    crowd.instanceMatrix.needsUpdate = true;

    people.forEach((h) => {
      h.p.position.y = Math.abs(Math.sin(t * 2.2 + h.ph)) * 0.035;
      h.head.rotation.y = Math.sin(t * 0.6 + h.ph) * 0.3;
      if (h.wave) { const w = Math.pow(Math.max(0, Math.sin(t * 0.9 + h.ph)), 3); h.arms[1].rotation.z = 0.18 + w * 2.5 + Math.sin(t * 9) * 0.25 * w; }
    });
    ball.rotation.y += dt * 0.8;

    for (let i = 0; i < N; i++) {
      const c = cvel[i]; cpos[i * 3 + 1] -= c.v * dt; cpos[i * 3] += Math.sin(t * 2 + c.ph) * dt * 0.6;
      if (cpos[i * 3 + 1] < 0) cpos[i * 3 + 1] = 14 + Math.random() * 3;
    }
    cgeo.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
    if (onProgress && Math.abs(p - lastP) > 0.01) { lastP = p; onProgress(p); }
    if (p >= 1) { finish(); return; }
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  const onResize = () => { renderer.setSize(W(), H()); camera.aspect = W() / H(); camera.updateProjectionMatrix(); };
  addEventListener('resize', onResize);

  function stop() {
    cancelAnimationFrame(raf); removeEventListener('resize', onResize);
    scene.traverse((o) => { o.geometry && o.geometry.dispose(); if (o.material) { (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.map && m.map.dispose(); m.dispose(); }); } });
    renderer.dispose(); renderer.domElement.remove();
  }
  function finish() { if (done) return; done = true; onDone && onDone(); }
  return { stop };
}
