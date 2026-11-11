// <abyss-3d> — مشهد «الهاوية»: جسر زجاجي معلّق بين الجبال فوق هاوية.
// كل خطوة بالجسر صف فيه مربعين: يمين = الخيار 1 (أو «صح») · يسار = الخيار 2 (أو «خطأ»).
// المربع الغلط ينكسر ويطيح اللي فوقه.
//
// الشخصيات نفسها حق سفينة النجاة: الكلاس يورث <ship-3d> (games/survival-ship/ship3d.js) ويستخدم
// figure() و attachVrm() و loadVrm() كما هي، فلازم ship3d.js ينحمّل قبل هذا الملف.
//
// attr scene = JSON {
//   players:[{id,name,skin,hair,girl,outfit,pants,vrm, row, lane, fall}],  row: -1 = منصة البداية · lane: 0 يمين / 1 يسار
//   rows:[{labels:['1','2'], broken:null|0|1, safe:null|0|1}],               صفوف الجسر الموجودة حالياً
//   row: رقم الصف اللي عليه السؤال الحين · finish: true = فيه منصة نهاية بعد آخر صف (نمط عدد الخطوات)
//   cam: 'overview'|'play'|'win' · win:[ids] · names: true/false
// }
(function () {
  'use strict';
  const Base = customElements.get('ship-3d');
  if (!Base || customElements.get('abyss-3d')) return;

  // ألواح أكبر وجسر أعرض عشان تكون المرحلة أوضح على البث
  const TW = 7.4, TD = 6.6, GAP = 9.6, LX = 4.2, FRAME_X = LX + TW / 2 + .45;
  const rowZ = r => r < 0 ? 5 : -6.8 - r * GAP;          // منصة البداية مركزها z=5 وعمقها 12
  const laneX = l => l ? -LX : LX;

  class Abyss3D extends Base {
    static get observedAttributes() { return ['scene']; }
    constructor() { super(); this.data = { players: [], rows: [], row: 0 }; this.tiles = []; this.shards = []; this.builtRows = 0; }

    // ---------- بناء المشهد ----------
    init() {
      const T = this.T, r = this.r = new T.WebGLRenderer({ antialias: true });
      r.setPixelRatio(Math.min(devicePixelRatio, 1)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
      r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; this.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%';
      const sc = this.sc = new T.Scene();
      sc.background = this.tex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#120c35'); gr.addColorStop(.38, '#3b2380'); gr.addColorStop(.62, '#a0559e'); gr.addColorStop(.78, '#f08a73'); gr.addColorStop(1, '#2a1846'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      sc.fog = new T.Fog('#4a3075', 90, 460);
      const cam = this.cam = new T.PerspectiveCamera(46, 1, .1, 900); cam.position.set(10, 14, 28);
      sc.add(new T.HemisphereLight('#ffd9e8', '#2b1f4d', 1.05));
      const sun = this.sun = new T.DirectionalLight('#ffd2a1', 2.4); sun.position.set(-30, 45, -60); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
      Object.assign(sun.shadow.camera, { left: -40, right: 40, top: 40, bottom: -40, near: 1, far: 200 }); sc.add(sun); sc.add(sun.target);
      const rim = new T.DirectionalLight('#8fd8ff', .8); rim.position.set(30, 20, 40); sc.add(rim);
      this.world = new T.Group(); sc.add(this.world);
      this.buildSky(); this.buildMountains(); this.buildAbyss();
      this.bridge = new T.Group(); this.world.add(this.bridge);
      this.startPad = this.cliff(rowZ(-1), 12, 24, false);
      this.crew = new T.Group(); sc.add(this.crew);
      this.buildFx();
      this.ro = new ResizeObserver(() => { const w = this.clientWidth || 1, h = this.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }); this.ro.observe(this);
      this.clock = new T.Clock(); this.camLook = new T.Vector3(0, 0, -10);
      let last = -1e9; const loop = now => { this.raf = requestAnimationFrame(loop); if (now - last < 29) return; last = now; this.tick(); }; this.raf = requestAnimationFrame(loop);
    }
    rock(c) { return new this.T.MeshStandardMaterial({ color: c, roughness: .95, flatShading: true, vertexColors: true }); }
    // قمة جبل: مخروط وعر بألوان رأسية (صخر غامق تحت، بنفسجي بالنص، ثلج فوق)
    peak(x, z, h, rad) {
      const T = this.T, g = new T.ConeGeometry(rad, h, 9, 6), p = g.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) { const y = p.getY(i), k = (y + h / 2) / h, j = (1 - k) * rad * .28;
        if (k < .99) { p.setX(i, p.getX(i) + (Math.random() - .5) * j * 2); p.setZ(i, p.getZ(i) + (Math.random() - .5) * j * 2); p.setY(i, y + (Math.random() - .5) * h * .04); }
        const snow = k > .8 + Math.random() * .06, c = new T.Color(snow ? '#efe9ff' : k > .5 ? '#4a3b72' : '#241c3b'); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new T.Mesh(g, this.rock('#ffffff')); m.position.set(x, h / 2 - 230, z); m.rotation.y = Math.random() * 6; m.castShadow = false; m.receiveShadow = true; this.world.add(m); return m;
    }
    buildSky() {
      const T = this.T, sunTex = this.tex(256, 256, (g, w, h) => { const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128); gr.addColorStop(0, 'rgba(255,240,210,1)'); gr.addColorStop(.18, 'rgba(255,200,150,.9)'); gr.addColorStop(1, 'rgba(255,140,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
      const s = new T.Sprite(new T.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true })); s.scale.set(140, 140, 1); s.position.set(-40, 40, -420); this.sc.add(s);
      // نجوم خفيفة فوق
      const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = .35 + Math.random() * .9; pos[i * 3] = Math.cos(a) * Math.cos(e) * 600; pos[i * 3 + 1] = Math.sin(e) * 600; pos[i * 3 + 2] = Math.sin(a) * Math.cos(e) * 600; }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pos, 3));
      this.sc.add(new T.Points(sg, new T.PointsMaterial({ color: '#ffffff', size: 1.6, fog: false, transparent: true, opacity: .7 })));
    }
    buildMountains() {
      for (let side of [-1, 1]) for (let i = 0; i < 16; i++) { const z = 60 - i * 34 + Math.random() * 14, x = side * (95 + Math.random() * 40 + (i % 2) * 50);
        this.peak(x, z, 210 + Math.random() * 90, 62 + Math.random() * 30); }
      // سلسلة بعيدة ورا نهاية الجسر
      for (let i = 0; i < 14; i++) this.peak(-210 + i * 32 + Math.random() * 12, -380 - Math.random() * 60, 290 + Math.random() * 120, 44 + Math.random() * 20);
    }
    buildAbyss() {
      const T = this.T;
      const fl = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshBasicMaterial({ color: '#0b0620' })); fl.rotation.x = -Math.PI / 2; fl.position.y = -240; this.world.add(fl);
      // طبقات ضباب تتحرك تحت الجسر (عمق الهاوية)
      const cloud = this.tex(512, 512, (g, w, h) => { for (let i = 0; i < 70; i++) { const x = Math.random() * w, y = Math.random() * h, r = 30 + Math.random() * 90, gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,235,255,.32)'); gr.addColorStop(1, 'rgba(255,235,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } });
      cloud.wrapS = cloud.wrapT = T.RepeatWrapping;
      this.mist = [-46, -84, -130].map((y, i) => { const t = cloud.clone(); t.needsUpdate = true; t.repeat.set(3, 3);
        const m = new T.Mesh(new T.PlaneGeometry(700, 700), new T.MeshBasicMaterial({ map: t, transparent: true, opacity: .55 - i * .12, depthWrite: false, color: i ? '#9b7fe0' : '#d9c8ff' }));
        m.rotation.x = -Math.PI / 2; m.position.set(0, y, -150); this.world.add(m); return m; });
    }
    // جرف صخري تحت منصة (البداية أو النهاية) + سطح حجري
    cliff(z, depth, width, end) {
      const T = this.T, G = new T.Group(); G.position.z = z; this.world.add(G);
      const top = this.tex(256, 256, (g, w, h) => { g.fillStyle = '#6f6488'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(30,20,50,.35)'; g.lineWidth = 3;
        for (let y = 0; y < h; y += 42) for (let x = (y / 42 % 2) * 32; x < w; x += 64) g.strokeRect(x, y, 64, 42); });
      top.wrapS = top.wrapT = T.RepeatWrapping; top.repeat.set(width / 6, depth / 6);
      const slab = new T.Mesh(new T.BoxGeometry(width, 1.2, depth), [this.mat('#4a3f63'), this.mat('#4a3f63'), new T.MeshStandardMaterial({ map: top, roughness: .9 }), this.mat('#4a3f63'), this.mat('#4a3f63'), this.mat('#4a3f63')]);
      slab.position.y = -.6; slab.receiveShadow = true; G.add(slab);
      const g = new T.CylinderGeometry(width * .62, width * .25, 230, 8, 8), p = g.attributes.position, col = [];
      for (let i = 0; i < p.count; i++) { if (p.getY(i) < 114) { p.setX(i, p.getX(i) * (1 + (Math.random() - .5) * .25)); p.setZ(i, p.getZ(i) * (1 + (Math.random() - .5) * .25)); } const c = new T.Color(p.getY(i) > 80 ? '#4b3d6b' : '#2a2042'); col.push(c.r, c.g, c.b); }
      g.setAttribute('color', new T.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
      const rk = new T.Mesh(g, this.rock('#ffffff')); rk.scale.z = depth / width * 1.1; rk.position.y = -116.2; rk.receiveShadow = true; G.add(rk);
      // مشاعل على أطراف المنصة
      for (const sx of [-1, 1]) { const pole = new T.Mesh(new T.CylinderGeometry(.12, .16, 3, 8), this.mat('#d4a24c', { metalness: .7, roughness: .3 })); pole.position.set(sx * (width / 2 - .6), 1.5, (end ? 1 : -1) * (depth / 2 - .6)); G.add(pole);
        const fl = new T.Mesh(new T.SphereGeometry(.32, 10, 8), new T.MeshBasicMaterial({ color: end ? '#fde68a' : '#7dd3fc' })); fl.position.set(pole.position.x, 3.15, pole.position.z); G.add(fl);
        const li = new T.PointLight(end ? '#fbbf24' : '#38bdf8', 18, 14, 2); li.position.copy(fl.position); G.add(li); }
      if (end) { // قوس النهاية
        const gold = this.mat('#f5c451', { metalness: .8, roughness: .25, emissive: '#7c4a03', emissiveIntensity: .35 });
        for (const sx of [-1, 1]) { const c = new T.Mesh(new T.BoxGeometry(.7, 7, .7), gold); c.position.set(sx * 9.5, 3.5, depth / 2 - 1.5); c.castShadow = true; G.add(c); }
        const beam = new T.Mesh(new T.BoxGeometry(20, 1.1, .8), gold); beam.position.set(0, 7.2, depth / 2 - 1.5); G.add(beam);
        const sign = new T.Mesh(new T.PlaneGeometry(9, 1.6), new T.MeshBasicMaterial({ map: this.tex(512, 96, (g, w, h) => { g.fillStyle = '#1a0f3a'; g.fillRect(0, 0, w, h); g.fillStyle = '#fde68a'; g.font = '900 64px Zain, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText('خط النجاة', w / 2, h / 2 + 4); }) }));
        sign.position.set(0, 7.2, depth / 2 - 1.05); G.add(sign);
      }
      return G;
    }
    // نص المربع (رقم الخيار أو صح/خطأ) كخامة شفافة فوق الزجاج
    tileLabel(txt, color) { return this.tex(256, 256, (g, w, h) => { g.clearRect(0, 0, w, h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      const big = /^\d+$/.test(txt); g.font = '900 ' + (big ? 190 : 120) + 'px Zain, "IBM Plex Sans Arabic", sans-serif';
      g.lineJoin = 'round'; g.lineWidth = 14; g.strokeStyle = color; g.shadowColor = color; g.shadowBlur = 30; g.strokeText(txt, w / 2, h / 2 + 10); g.shadowBlur = 0; g.fillStyle = '#ffffff'; g.fillText(txt, w / 2, h / 2 + 10); }); }
    buildTile(r, lane, label) {
      const T = this.T, G = new T.Group(); G.position.set(laneX(lane), 0, rowZ(r)); this.bridge.add(G);
      const glass = new T.MeshPhysicalMaterial({ color: '#c8f1ff', roughness: .04, metalness: .05, transparent: true, opacity: .4, clearcoat: 1, clearcoatRoughness: .05, emissive: '#38bdf8', emissiveIntensity: .1, depthWrite: false });
      const slab = new T.Mesh(new T.BoxGeometry(TW, .32, TD), glass); slab.position.y = -.16; slab.receiveShadow = true; G.add(slab);
      const edge = new T.LineSegments(new T.EdgesGeometry(slab.geometry), new T.LineBasicMaterial({ color: '#dff6ff', transparent: true, opacity: .9 })); edge.position.copy(slab.position); G.add(edge);
      // لمعة قطرية خفيفة على سطح الزجاج
      const shine = new T.Mesh(new T.PlaneGeometry(TW * .9, TD * .9), new T.MeshBasicMaterial({ map: this.shineTex || (this.shineTex = this.tex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.45, 'rgba(255,255,255,0)'); gr.addColorStop(.5, 'rgba(255,255,255,.35)'); gr.addColorStop(.58, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); })), transparent: true, depthWrite: false }));
      shine.rotation.x = -Math.PI / 2; shine.position.y = .01; G.add(shine);
      const lb = new T.Mesh(new T.PlaneGeometry(4.6, 4.6), new T.MeshBasicMaterial({ map: this.tileLabel(label, lane ? '#a855f7' : '#0ea5e9'), transparent: true, depthWrite: false, opacity: .95 }));
      lb.rotation.x = -Math.PI / 2; lb.position.y = .02; G.add(lb);
      return { g: G, slab, edge, lb, glass, label, broken: false, safe: false, shakeT: null, r, lane };
    }
    // إطار الجسر المعدني (عوارض طولية + عرضية + درابزين) — ينعاد بناؤه لما يزيد عدد الصفوف
    buildFrame(n, finish) {
      const T = this.T; if (this.frame) { this.bridge.remove(this.frame); this.frame.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
      const F = this.frame = new T.Group(); this.bridge.add(F);
      const steel = this.mat('#2b2540', { metalness: .8, roughness: .35, flatShading: false }), gold = this.mat('#e0b25a', { metalness: .85, roughness: .25, flatShading: false });
      const z0 = rowZ(-1) - 6, z1 = rowZ(n - 1) - TD / 2 - (finish ? 2.4 : 6), len = z0 - z1, zc = (z0 + z1) / 2;
      for (const x of [-FRAME_X, 0, FRAME_X]) { const b = new T.Mesh(new T.BoxGeometry(x ? .5 : .35, .55, len), steel); b.position.set(x, -.45, zc); b.castShadow = true; F.add(b); }
      for (let i = 0; i < n; i++) for (const s of [-1, 1]) { const z = rowZ(i) + s * TD / 2 + s * .12; const c = new T.Mesh(new T.BoxGeometry(FRAME_X * 2 + .5, .4, .24), steel); c.position.set(0, -.42, z); F.add(c); }
      // دعامات سفلية على شكل X تعطي إحساس الارتفاع
      for (let i = 0; i < n; i++) { const z = rowZ(i), k = new T.Mesh(new T.BoxGeometry(.18, .18, GAP * 1.05), steel); for (const x of [-FRAME_X, FRAME_X]) { const a = k.clone(); a.position.set(x, -1.6, z); a.rotation.x = .32; F.add(a); const b = k.clone(); b.position.set(x, -1.6, z); b.rotation.x = -.32; F.add(b); } }
      for (const x of [-FRAME_X - .1, FRAME_X + .1]) { const rail = new T.Mesh(new T.CylinderGeometry(.08, .08, len, 8), gold); rail.rotation.x = Math.PI / 2; rail.position.set(x, 1.15, zc); F.add(rail);
        for (let z = z0; z >= z1; z -= GAP / 2) { const p = new T.Mesh(new T.CylinderGeometry(.07, .07, 1.3, 6), gold); p.position.set(x, .5, z); F.add(p); } }
    }
    buildFx() {
      const T = this.T; this.shardGeo = new T.BufferGeometry(); const v = new Float32Array([0, 0, 0, .9, 0, .2, .3, 0, .8, 0, 0, 0, .3, 0, .8, -.5, 0, .5]); this.shardGeo.setAttribute('position', new T.BufferAttribute(v, 3)); this.shardGeo.computeVertexNormals();
      this.shardMat = new T.MeshPhysicalMaterial({ color: '#d7f5ff', roughness: .05, transparent: true, opacity: .75, side: T.DoubleSide, emissive: '#7dd3fc', emissiveIntensity: .25, depthWrite: false });
      this.flash = new T.PointLight('#bae6fd', 0, 18, 2); this.sc.add(this.flash);
      // رقم كبير يطفو فوق اللوحين اللي المفروض ينطون عليها الحين (1 يمين · 2 يسار)
      this.marks = [0, 1].map(l => { const c = l ? ['#c084fc', '#6d28d9'] : ['#38bdf8', '#1d4ed8'];
        const sp = new T.Sprite(new T.SpriteMaterial({ map: this.tex(256, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, w, h); gr.addColorStop(0, c[0]); gr.addColorStop(1, c[1]);
          g.shadowColor = c[0]; g.shadowBlur = 28; g.fillStyle = gr; g.beginPath(); g.arc(w / 2, h / 2, 96, 0, 7); g.fill(); g.shadowBlur = 0; g.lineWidth = 8; g.strokeStyle = 'rgba(255,255,255,.85)'; g.stroke();
          g.fillStyle = '#fff'; g.font = '900 150px Zain, "IBM Plex Sans Arabic", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(l + 1), w / 2, h / 2 + 12); }), depthTest: false, transparent: true }));
        sp.scale.setScalar(2.4); sp.renderOrder = 20; sp.visible = false; this.sc.add(sp); return sp; });
    }
    shatter(t) {
      const T = this.T, n = 46, im = new T.InstancedMesh(this.shardGeo, this.shardMat, n), w = new T.Vector3(); t.g.getWorldPosition(w); this.sc.add(im);
      const parts = Array.from({ length: n }, () => ({ p: new T.Vector3(w.x + (Math.random() - .5) * TW, -.1, w.z + (Math.random() - .5) * TD), v: new T.Vector3((Math.random() - .5) * 4, 1 + Math.random() * 3, (Math.random() - .5) * 4),
        q: new T.Euler(Math.random() * 6, Math.random() * 6, Math.random() * 6), s: .4 + Math.random() * 1.1, w: new T.Vector3(Math.random() * 6, Math.random() * 6, Math.random() * 6) }));
      this.shards.push({ im, parts, t: 0 }); this.flash.position.set(w.x, 1.5, w.z); this.flash.intensity = 60; this.shakeK = .6;
    }

    // ---------- مزامنة الحالة ----------
    slotsFor(n, r, lane) {
      const out = [], wide = r < 0 && lane == null, W = wide ? 16 : TW - 1, D = wide ? 8 : TD - 1, cols = Math.max(1, Math.ceil(Math.sqrt(n * W / D))), rows = Math.ceil(n / cols);
      const sx = cols > 1 ? Math.min(1.7, W / (cols - 1)) : 0, sz = rows > 1 ? Math.min(1.7, D / (rows - 1)) : 0, cx = lane == null ? 0 : laneX(lane), cz = rowZ(r);
      const s = Math.min(1, Math.max(.45, Math.min(cols > 1 ? sx : 9, rows > 1 ? sz : 9) / 1.55));
      for (let i = 0; i < n; i++) { const rr = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - rr * cols);
        out.push({ v: new this.T.Vector3(cx + (c - (inRow - 1) / 2) * sx, 0, cz + (rr - (rows - 1) / 2) * sz), s }); }
      return out;
    }
    endZ() { return rowZ((this.data.rows || []).length - 1) - TD / 2 - 9.4; }
    sync() {
      const d = this.data, T = this.T, rows = d.rows || [];
      // صفوف جديدة
      if (rows.length !== this.builtRows || !!d.finish !== this.builtFinish) {
        for (let i = this.tiles.length; i < rows.length; i++) this.tiles.push([this.buildTile(i, 0, rows[i].labels[0]), this.buildTile(i, 1, rows[i].labels[1])]);
        this.buildFrame(rows.length, d.finish); this.builtRows = rows.length; this.builtFinish = !!d.finish;
        if (this.endPad) this.world.remove(this.endPad); this.endPad = d.finish && rows.length ? this.cliff(this.endZ(), 14, 24, true) : null;
      }
      rows.forEach((rw, i) => this.tiles[i].forEach((t, l) => {
        if (t.label !== rw.labels[l]) { t.label = rw.labels[l]; t.lb.material.map = this.tileLabel(t.label, l ? '#a855f7' : '#0ea5e9'); }
        if (rw.broken === l && !t.broken) { t.broken = true; t.shakeT = 0; }
        if (rw.safe === l && !t.safe) { t.safe = true; t.glass.emissive.set('#22c55e'); t.glass.emissiveIntensity = .55; t.glass.color.set('#bbf7d0'); t.edge.material.color.set('#4ade80'); }
      }));
      // اللاعبين
      const ps = d.players || [], keep = new Set(ps.map(p => p.id));
      for (const [id, f] of this.figs) if (!keep.has(id)) { this.dropFig(f); this.figs.delete(id); }
      if (ps.some(p => p.vrm)) this.loadVrm();
      const groups = new Map(); ps.forEach(p => { if (p.fall) return; const k = p.row >= rows.length && d.finish ? 'end' : p.row < 0 ? 'start' : p.row + ':' + p.lane; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
      const slot = new Map(); for (const [k, list] of groups) { const sl = k === 'start' ? this.slotsFor(list.length, -1, null) : k === 'end' ? this.slotsFor(list.length, -1, null).map(o => ({ v: o.v.setZ(o.v.z - rowZ(-1) + this.endZ()), s: o.s })) : this.slotsFor(list.length, +k.split(':')[0], +k.split(':')[1]);
        list.forEach((p, i) => slot.set(p.id, sl[i])); }
      ps.forEach(p => {
        let f = this.figs.get(p.id), born = false; const vrm = (p.vrm === 'girl' || p.vrm === 'boy') && this.V ? p.vrm : null;
        if (!f || f.name !== p.name || f.vrm !== vrm) { const was = f && f.g.position.clone(); if (f) this.dropFig(f); f = { g: this.figure(p, vrm), name: p.name, vrm, ph: Math.random() * 6 }; this.crew.add(f.g); this.figs.set(p.id, f); born = !was; if (was) f.g.position.copy(was); }
        const key = p.row + ':' + p.lane;
        if (p.fall) { if (f.fallT == null) { f.fallT = -.45; f.fallV = new T.Vector3((Math.random() - .5) * 1.5, 1.5, (Math.random() - .5) * 1.5); } f.key = key; return; }
        f.fallT = null; f.g.visible = true; const sl = slot.get(p.id); f.scale = sl.s;
        if (born) { f.g.position.copy(sl.v); f.g.scale.setScalar(sl.s); }
        else if (f.key !== key) { f.jT = -Math.random() * .35; f.jFrom = f.g.position.clone(); }
        f.key = key; f.target = sl.v;
      });
    }

    // ---------- كل إطار ----------
    tick() {
      const T = this.T, raw = this.clock.getDelta(), dt = Math.min(raw, .05), t = this.clock.elapsedTime, d = this.data; this.perf(raw);
      this.mist.forEach((m, i) => { m.material.map.offset.set(t * (.004 + i * .002), t * (.006 - i * .001)); });
      for (const [, f] of this.figs) if (f.g.userData.sp) f.g.userData.sp.visible = d.names !== false && f.fallT == null;
      // المربعات: نبض الصف الحالي، رجفة ثم كسر المربع الغلط
      const cur = d.row;
      const mrow = this.tiles[cur], showM = d.cam === 'play' && mrow && !mrow[0].broken && !mrow[1].broken && !mrow[0].safe && !mrow[1].safe;
      this.marks.forEach((m, l) => { m.visible = !!showM; if (showM) { const b = Math.sin(t * 3 + l) * .18, pu = 2.8 + Math.sin(t * 4 + l) * .12; m.position.set(laneX(l), 3.8 + b, rowZ(cur)); m.scale.setScalar(pu); } });
      this.tiles.forEach((pair, i) => pair.forEach(tl => {
        if (tl.shakeT != null) { tl.shakeT += dt; tl.g.position.x = laneX(tl.lane) + Math.sin(tl.shakeT * 90) * .07 * (1 - tl.shakeT / .45); if (tl.shakeT > .45) { tl.shakeT = null; tl.g.visible = false; this.shatter(tl); } return; }
        if (!tl.safe && !tl.broken) { const on = i === cur; tl.edge.material.opacity = on ? .65 + Math.sin(t * 4) * .35 : .55; tl.glass.emissiveIntensity = on ? .18 + Math.sin(t * 4) * .08 : .08; }
      }));
      // الشظايا
      this.shards = this.shards.filter(s => { s.t += dt; const m = new T.Matrix4(), q = new T.Quaternion();
        s.parts.forEach((o, i) => { o.v.y -= 22 * dt; o.p.addScaledVector(o.v, dt); o.q.x += o.w.x * dt; o.q.y += o.w.y * dt; o.q.z += o.w.z * dt; m.compose(o.p, q.setFromEuler(o.q), new T.Vector3(o.s, o.s, o.s)); s.im.setMatrixAt(i, m); });
        s.im.instanceMatrix.needsUpdate = true; if (s.t > 4) { this.sc.remove(s.im); s.im.dispose(); return false; } return true; });
      this.flash.intensity *= Math.exp(-dt * 5); this.shakeK = (this.shakeK || 0) * Math.exp(-dt * 6);
      const win = new Set(d.win || []); let falling = null;
      for (const [id, f] of this.figs) { const U = f.g.userData, ph = t * 2 + f.ph;
        if (f.fallT != null) { f.fallT += dt; if (f.fallT < 0) { U.arms[0].rotation.z = -2.4 + Math.sin(t * 30) * .3; U.arms[1].rotation.z = 2.4 - Math.sin(t * 30) * .3; continue; }
          falling = f; f.fallV.y -= 26 * dt; f.g.position.addScaledVector(f.fallV, dt); f.g.rotation.x += dt * 2.2; f.g.rotation.z += dt * 1.3;
          U.arms[0].rotation.z = -2.6 + Math.sin(t * 22) * .5; U.arms[1].rotation.z = 2.6 - Math.sin(t * 22) * .5; U.legs[0].rotation.x = Math.sin(t * 18) * .8; U.legs[1].rotation.x = -Math.sin(t * 18) * .8;
          if (f.g.position.y < -90) f.g.visible = false; continue; }
        if (!f.target) continue; const sk = f.g.scale.x + ((f.scale || 1) - f.g.scale.x) * Math.min(1, dt * 4); f.g.scale.setScalar(sk);
        if (f.jT != null) { f.jT += dt; const k = Math.max(0, Math.min(1, f.jT / .7)); const e = k * k * (3 - 2 * k);
          f.g.position.lerpVectors(f.jFrom, f.target, e); f.g.position.y = Math.sin(k * Math.PI) * 1.8; f.g.rotation.y = Math.atan2(f.target.x - f.jFrom.x, f.target.z - f.jFrom.z) || Math.PI;
          U.legs[0].rotation.x = U.legs[1].rotation.x = k > 0 && k < 1 ? -.9 : 0; U.arms[0].rotation.z = -1.6 * Math.sin(k * Math.PI); U.arms[1].rotation.z = 1.6 * Math.sin(k * Math.PI);
          if (f.jT >= .7) { f.jT = null; f.g.position.copy(f.target); } continue; }
        const dx = f.target.x - f.g.position.x, dz = f.target.z - f.g.position.z, dist = Math.hypot(dx, dz);
        if (dist > .05) { const st = Math.min(dist, dt * 4), w = t * 14 + f.ph; f.g.position.x += dx / dist * st; f.g.position.z += dz / dist * st; f.g.position.y = 0; f.g.rotation.y = Math.atan2(dx, dz);
          U.legs[0].rotation.x = Math.sin(w) * .6; U.legs[1].rotation.x = -Math.sin(w) * .6; U.arms[0].rotation.x = -Math.sin(w) * .5; U.arms[1].rotation.x = Math.sin(w) * .5; continue; }
        if (win.has(id)) { if (U.rig) { f.g.rotation.y = Math.PI * 0; continue; } const c = t * 7; f.g.position.y = Math.abs(Math.sin(c * .5)) * 1.1; U.arms[0].rotation.z = -2.7 + Math.sin(c) * .35; U.arms[1].rotation.z = 2.7 - Math.sin(c) * .35; f.g.rotation.y += dt * 4; continue; }
        // وقوف: ظهره للكاميرا ووجهه للجسر قدامه (Math.PI)، مع تمايل خفيف
        f.g.position.y = Math.abs(Math.sin(ph)) * .04; f.g.rotation.y = Math.PI + Math.sin(ph * .3) * .12;
        U.arms[0].rotation.x = Math.sin(ph) * .15; U.arms[1].rotation.x = -Math.sin(ph) * .15; U.arms[0].rotation.z = -.18; U.arms[1].rotation.z = .18; U.legs[0].rotation.x = U.legs[1].rotation.x = 0; U.head.rotation.z = Math.sin(ph * .5) * .06; }
      // شخصيات الأنمي
      for (const [id, f] of this.figs) { const U = f.g.userData, r = U.rig; if (!r || !f.g.visible) continue; let a = 0, m = 'smile';
        if (f.fallT != null) { a = 5; m = 'scared'; } else if (f.jT != null || (f.target && Math.hypot(f.target.x - f.g.position.x, f.target.z - f.g.position.z) > .05)) a = 1; else if (win.has(id)) { a = 'win'; m = 'laugh'; } else if (d.cam === 'play') m = 'focus';
        if (U.vrmAnim !== a) { r.play(a); U.vrmAnim = a; } r.mood(m); r.update(dt); r.sync(); }
      // الكاميرا
      const cam = this.cam, P = new T.Vector3(), L = new T.Vector3(); let rate = 1.5; const rows = (d.rows || []).length;
      const standZ = rowZ(Math.max(-1, (cur || 0) - 1)), nextZ = rowZ(Math.max(0, cur || 0)), midZ = (standZ + nextZ) / 2;
      if (d.cam === 'overview') { const zm = (rowZ(-1) + rowZ(Math.max(0, rows - 1))) / 2, a = t * .05; P.set(26 + Math.sin(a) * 6, 26, rowZ(-1) + 26); L.set(0, -3, zm * .55); rate = 1; }
      else if (d.cam === 'win') { const zE = d.finish ? this.endZ() : standZ, a = t * .15; P.set(Math.sin(a) * 15, 7.5, zE + Math.cos(a) * 15); L.set(0, 2, zE); rate = 1.6; }
      else if (falling && falling.fallT < 2.2) { const w = new T.Vector3(); falling.g.getWorldPosition(w); P.set(w.x * .8 + 2.5, 8.5, standZ + 11); L.set(w.x * .6, Math.max(-8, w.y * .5), nextZ); rate = 2.2; }
      else { P.set(1.5 + Math.sin(t * .2) * .5, 7.5, standZ + 10.5); L.set(0, 1, nextZ - 1); rate = 1.6; } // قريبة ونازلة: ورا اللاعبين مباشرة
      const k = 1 - Math.exp(-dt * rate); cam.position.lerp(P, k); this.camLook.lerp(L, k);
      if (this.shakeK > .01) cam.position.add(new T.Vector3((Math.random() - .5) * this.shakeK, (Math.random() - .5) * this.shakeK, 0));
      cam.lookAt(this.camLook);
      // أثناء اللعب الكادر ينزل لتحت عشان بطاقة السؤال فوق ما تغطي اللاعبين
      const vt = d.cam === 'play' ? .12 : d.cam === 'win' ? .2 : 0; this.vo = (this.vo || 0) + (vt - (this.vo || 0)) * k; const vw = this.clientWidth || 1, vh = this.clientHeight || 1;
      if (this.vo > .001) cam.setViewOffset(vw, vh, 0, -vh * this.vo, vw, vh); else if (cam.view && cam.view.enabled) cam.clearViewOffset();
      this.sun.target.position.set(0, 0, standZ); this.sun.position.set(-30, 45, standZ - 60);
      this.r.render(this.sc, cam);
    }
  }
  customElements.define('abyss-3d', Abyss3D);
}());
