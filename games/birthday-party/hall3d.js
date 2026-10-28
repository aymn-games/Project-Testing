// قاعة الحفلة — مشهد Three.js لحفلة عيد الميلاد (الماب الرئيسي / قاعة الاستقبال).
// القاعة كبيرة بالمساحة (64×96م وسقف 16م) لكن خفيفة بالأداء: كل العناصر
// المتكررة (كراسي، طاولات، بالونات، كريستال، هدايا...) InstancedMesh واحد
// لكل نوع، والخامات كلها CanvasTexture مرسومة بالكود — بدون أي ملفات موديل.
// الطبقة هذي "عرض" فقط: تبني المشهد وتحرك الكاميرا (جولة سينمائية أو تجوّل)
// وتبلّغ الصفحة لما يقرّب اللاعب من باب قسم. منطق اللعبة يبقى خارجها.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const T = THREE;
const HALL = { w: 64, l: 96, h: 16 };
const HX = HALL.w / 2, HZ = HALL.l / 2;
const STAGE = { w: 34, d: 14, h: 1.2, front: -HZ + 14 };
const EYE = 1.65;

// أبواب الأقسام على الجدارين الجانبيين — كل باب يودي لمشهد مستقل لاحقاً.
// side: -1 = الجدار الغربي، 1 = الشرقي.
export const SECTIONS = [
  { id: 'wishes', title: 'حديقة الأمنيات', side: -1, z: -12, c1: '#bff5dc', c2: '#ffc9e0' },
  { id: 'gifts', title: 'غرفة الهدايا', side: 1, z: -12, c1: '#e6d4ff', c2: '#ffd0e6' },
  { id: 'dance', title: 'ساحة الرقص', side: -1, z: 12, c1: '#ffc2e0', c2: '#cbb8ff' },
  { id: 'photos', title: 'ركن الصور', side: 1, z: 12, c1: '#ffe0c2', c2: '#ffc0d6' },
];

// لوحة ألوان ناعمة متناسقة: وردي غبار، بلاش، ليلكي، لافندر، عاجي
const PASTEL = ['#f4a3c0', '#f8c4d6', '#fde6ee', '#e8c8f0', '#cdb6ef', '#e98bb0', '#f6d3e2', '#d9b8e8'];
const CHROME = ['#efb7a4', '#ecc98f', '#f2b6cc', '#d6b6f2'];
const FONT_AR = '"IBM Plex Sans Arabic", sans-serif';

// مولّد عشوائي ثابت — نفس توزيع الديكور بكل مرة تنفتح فيها القاعة
function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

export function mountHall(el, opts = {}) {
  const { controls, onSectionNear, onModeChange, onReady } = opts;
  const rand = rng(20261028);
  const pick = a => a[Math.floor(rand() * a.length)];
  const W = () => el.clientWidth || innerWidth, H = () => el.clientHeight || innerHeight;

  // ---------- المحرك ----------
  const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  let dpr = Math.min(devicePixelRatio, 1.5);
  r.setPixelRatio(dpr);
  r.setSize(W(), H(), false);
  r.outputColorSpace = T.SRGBColorSpace;
  r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 0.95;
  r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
  Object.assign(r.domElement.style, { display: 'block', width: '100%', height: '100%' });
  el.appendChild(r.domElement);
  const ANISO = Math.min(8, r.capabilities.getMaxAnisotropy());

  const scene = new T.Scene();
  scene.background = new T.Color('#f3d3e0');
  scene.fog = new T.Fog('#e7c0d2', 90, 230);
  const cam = new T.PerspectiveCamera(52, W() / H(), 0.1, 260);
  cam.rotation.order = 'YXZ';

  // ---------- أدوات مساعدة ----------
  const tex = (w, h, draw, repeat) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = ANISO;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
    return t;
  };
  const std = (color, o = {}) => new T.MeshStandardMaterial({ color, roughness: 0.6, ...o });
  const basic = (o) => new T.MeshBasicMaterial(o);
  const add = (m, shadow) => { if (shadow) m.castShadow = m.receiveShadow = true; scene.add(m); return m; };
  const mesh = (geo, mat, x, y, z, shadow, parent) => { const m = new T.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) m.castShadow = m.receiveShadow = true; (parent || scene).add(m); return m; };
  const dummy = new T.Object3D();
  const setInst = (im, i, p) => {
    dummy.position.set(p.x, p.y, p.z); dummy.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    const s = p.s == null ? 1 : p.s; Array.isArray(s) ? dummy.scale.set(s[0], s[1], s[2]) : dummy.scale.setScalar(s);
    dummy.updateMatrix(); im.setMatrixAt(i, dummy.matrix);
  };
  const instanced = (geo, mat, list, { shadow = false, cast = shadow, receive = shadow } = {}) => {
    const im = new T.InstancedMesh(geo, mat, Math.max(1, list.length));
    im.count = list.length;
    list.forEach((p, i) => { setInst(im, i, p); if (p.c) im.setColorAt(i, new T.Color(p.c)); });
    im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true;
    im.castShadow = cast; im.receiveShadow = receive; scene.add(im); return im;
  };
  // يحوّل UV شكل (Shape) لنطاق 0..1 حتى تنطبق عليه الخامة كاملة
  const normUV = (geo, sx, sy) => {
    geo.computeBoundingBox(); const b = geo.boundingBox, p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, sx ? (p.getX(i) - b.min.x) / sx : (p.getX(i) - b.min.x) / (b.max.x - b.min.x), sy ? (p.getY(i) - b.min.y) / sy : (p.getY(i) - b.min.y) / (b.max.y - b.min.y));
    uv.needsUpdate = true; return geo;
  };
  const scaleUV = (geo, su, sv) => { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); uv.needsUpdate = true; return geo; };
  // قوس: جانبين مستقيمين لارتفاع ys ثم نصف قطع ناقص بنصف عرض hw وارتفاع ry
  const arch = (hw, ys, ry) => { const s = new T.Shape(); s.moveTo(-hw, 0); s.lineTo(hw, 0); s.lineTo(hw, ys); s.absellipse(0, ys, hw, ry, 0, Math.PI, false); s.lineTo(-hw, 0); return s; };
  // إطار قوس على شكل U (خارجي ثم داخلي بالعكس) — بدون حافة سفلية
  const archFrame = (ho, hi, ys, ryo, ryi) => {
    const s = new T.Shape(); s.moveTo(-ho, 0); s.lineTo(-ho, ys); s.absellipse(0, ys, ho, ryo, Math.PI, 0, true);
    s.lineTo(ho, 0); s.lineTo(hi, 0); s.lineTo(hi, ys); s.absellipse(0, ys, hi, ryi, 0, Math.PI, false); s.lineTo(-hi, 0); s.lineTo(-ho, 0); return s;
  };
  const heart = (g, x, y, s) => { g.beginPath(); g.moveTo(x, y + s * .3); g.bezierCurveTo(x, y, x - s * .5, y, x - s * .5, y + s * .3); g.bezierCurveTo(x - s * .5, y + s * .6, x, y + s * .78, x, y + s); g.bezierCurveTo(x, y + s * .78, x + s * .5, y + s * .6, x + s * .5, y + s * .3); g.bezierCurveTo(x + s * .5, y, x, y, x, y + s * .3); g.fill(); };
  const radial = (inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,.35)') => tex(128, 128, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, inner); gr.addColorStop(.35, mid); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
  const glowText = (g, text, x, y, font, fill, glow, blur, maxW) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.shadowColor = glow; g.shadowBlur = blur; g.fillStyle = fill; g.fillText(text, x, y, maxW);
    g.shadowBlur = blur * .4; g.fillText(text, x, y, maxW); g.shadowBlur = 0; g.fillText(text, x, y, maxW);
  };
  // ملصق على جدار: side walls (x=±HX) أو الجدار الأمامي/الخلفي
  const onWall = (wall, along, y, off) => {
    if (wall === 'W') return { x: -HX + off, y, z: along, ry: Math.PI / 2 };
    if (wall === 'E') return { x: HX - off, y, z: along, ry: -Math.PI / 2 };
    if (wall === 'S') return { x: along, y, z: HZ - off, ry: Math.PI };
    return { x: along, y, z: -HZ + off, ry: 0 };
  };

  // ---------- الإضاءة + انعكاسات البيئة ----------
  {
    // بيئة انعكاس صغيرة (PMREM من مشهد بسيط) — تعطي الذهب والأرضية اللامعة لمعة بدون ملف HDR
    const envScene = new T.Scene();
    const sky = new T.Mesh(new T.SphereGeometry(50, 24, 12), basic({ side: T.BackSide, map: tex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff7fb'); gr.addColorStop(.45, '#f8c9dc'); gr.addColorStop(1, '#a8798c'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }) }));
    envScene.add(sky);
    const bright = basic({ color: new T.Color(4, 3.6, 3.8) });
    for (let i = 0; i < 6; i++) { const b = new T.Mesh(new T.PlaneGeometry(10, 18), bright); const a = i / 6 * Math.PI * 2; b.position.set(Math.cos(a) * 40, 12, Math.sin(a) * 40); b.lookAt(0, 0, 0); envScene.add(b); }
    const pm = new T.PMREMGenerator(r);
    scene.environment = pm.fromScene(envScene, 0.04).texture;
    pm.dispose(); envScene.traverse(o => { o.geometry?.dispose(); o.material?.map?.dispose(); o.material?.dispose(); });
  }
  const hemi = new T.HemisphereLight('#ffe3ee', '#b97a9c', 0.24); scene.add(hemi);
  const sun = new T.DirectionalLight('#ffe9f1', .6);
  sun.position.set(14, 46, 20); sun.target.position.set(0, 0, -4); scene.add(sun.target);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  Object.assign(sun.shadow.camera, { left: -42, right: 42, top: 58, bottom: -58, near: 1, far: 120 });
  scene.add(sun);
  const stageFill = new T.DirectionalLight('#ffc2dc', 0.7); stageFill.position.set(0, 12, 0); stageFill.target.position.set(0, 4, -HZ); scene.add(stageFill, stageFill.target);

  // ---------- الأرضية والسجادة ----------
  const floorTex = tex(1024, 1024, (g, w, h) => {
    const n = 4, s = w / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { g.fillStyle = (i + j) % 2 ? '#efd3df' : '#f7e6ed'; g.fillRect(i * s, j * s, s, s); }
    const sh = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w * .75); sh.addColorStop(0, 'rgba(255,255,255,.18)'); sh.addColorStop(1, 'rgba(190,120,155,.10)'); g.fillStyle = sh; g.fillRect(0, 0, w, h);
    g.lineWidth = 1.6;
    for (let k = 0; k < 80; k++) {
      g.strokeStyle = `rgba(${196 + rand() * 30 | 0},150,178,${.06 + rand() * .12})`; g.beginPath();
      let x = rand() * w, y = rand() * h; g.moveTo(x, y);
      for (let q = 0; q < 4; q++) { const nx = x + (rand() - .5) * 170, ny = y + (rand() - .5) * 170; g.quadraticCurveTo(x + (rand() - .5) * 70, y + (rand() - .5) * 70, nx, ny); x = nx; y = ny; }
      g.stroke();
    }
    g.strokeStyle = 'rgba(214,176,130,.75)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, h); g.moveTo(0, i * s); g.lineTo(w, i * s); g.stroke(); }
    g.fillStyle = 'rgba(222,186,140,.85)';
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) { g.beginPath(); g.moveTo(i * s, j * s - 16); g.lineTo(i * s + 16, j * s); g.lineTo(i * s, j * s + 16); g.lineTo(i * s - 16, j * s); g.fill(); }
  }, [HALL.w / 8, HALL.l / 8]);
  const floor = mesh(new T.PlaneGeometry(HALL.w, HALL.l), std('#ffffff', { map: floorTex, roughness: 0.22, metalness: 0.05, envMapIntensity: .55 }), 0, 0, 0);
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true;

  const carpetLen = HZ - (STAGE.front + 3);
  const carpetTex = tex(256, 512, (g, w, h) => {
    const cg = g.createLinearGradient(0, 0, w, 0); cg.addColorStop(0, '#c9668a'); cg.addColorStop(.5, '#dc7f9f'); cg.addColorStop(1, '#c9668a'); g.fillStyle = cg; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c595'; g.fillRect(10, 0, 12, h); g.fillRect(w - 22, 0, 12, h);
    g.fillStyle = '#f6b3cb'; g.fillRect(30, 0, 3, h); g.fillRect(w - 33, 0, 3, h);
    g.fillStyle = 'rgba(255,214,231,.45)'; for (let y = 32; y < h; y += 128) heart(g, w / 2, y, 64);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let y = 96; y < h; y += 128) { g.beginPath(); g.arc(w / 2, y, 6, 0, 7); g.fill(); }
  }, [1, carpetLen / 12]);
  const carpet = mesh(new T.PlaneGeometry(6, carpetLen), std('#ffffff', { map: carpetTex, roughness: 0.9 }), 0, 0.025, (HZ + STAGE.front + 3) / 2);
  carpet.rotation.x = -Math.PI / 2; carpet.receiveShadow = true;

  // ---------- الجدران ----------
  const wallTex = tex(512, 512, (g, w, h) => {
    g.fillStyle = '#f3d0de'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 8; i += 2) { g.fillStyle = 'rgba(226,170,196,.22)'; g.fillRect(i * 64, 0, 64, h); }
    g.fillStyle = 'rgba(222,160,190,.38)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) heart(g, i * 64 + 32, j * 128 + (i % 2 ? 64 : 0) + 40, 22);
    g.fillStyle = 'rgba(226,192,148,.6)';
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) { g.beginPath(); g.arc(i * 64 + 32, j * 128 + (i % 2 ? 0 : 64) + 20, 3, 0, 7); g.fill(); }
  });
  wallTex.wrapS = wallTex.wrapT = T.RepeatWrapping;
  const panelTex = tex(512, 384, (g, w, h) => {
    g.fillStyle = '#fbeaf1'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#e8c6d5'; g.lineWidth = 10; g.strokeRect(34, 44, w / 2 - 52, h - 88); g.strokeRect(w / 2 + 18, 44, w / 2 - 52, h - 88);
    g.strokeStyle = '#e3c08f'; g.lineWidth = 3; g.strokeRect(46, 56, w / 2 - 76, h - 112); g.strokeRect(w / 2 + 30, 56, w / 2 - 76, h - 112);
  });
  panelTex.wrapS = panelTex.wrapT = T.RepeatWrapping;
  const wallMat = std('#ffffff', { map: wallTex, roughness: 0.85, vertexColors: true });
  const panelMat = std('#ffffff', { map: panelTex, roughness: 0.6 });
  // تدرّج ناعم على الجدار: أغمق تحت (وردي ترابي) وأفتح فوق (بلاش)
  const wallShade = geo => { const pa = geo.attributes.position, c = new Float32Array(pa.count * 3), lo = new T.Color('#d8a8c0'), hi = new T.Color('#fff4f8'), k = new T.Color();
    for (let i = 0; i < pa.count; i++) { const v = (pa.getY(i) + HALL.h / 2) / HALL.h; k.lerpColors(lo, hi, Math.pow(v, .8)); c.set([k.r, k.g, k.b], i * 3); }
    geo.setAttribute('color', new T.BufferAttribute(c, 3)); return geo; };
  const WALLS = [
    { k: 'N', len: HALL.w, gaps: [] },
    { k: 'S', len: HALL.w, gaps: [[0, 9]] },
    { k: 'W', len: HALL.l, gaps: SECTIONS.filter(s => s.side < 0).map(s => [s.z, 7.2]) },
    { k: 'E', len: HALL.l, gaps: SECTIONS.filter(s => s.side > 0).map(s => [s.z, 7.2]) },
  ];
  const goldTrim = [], whiteTrim = [];
  for (const wd of WALLS) {
    const p = onWall(wd.k, 0, HALL.h / 2, 0);
    const wall = mesh(wallShade(scaleUV(new T.PlaneGeometry(wd.len, HALL.h, 1, 8), wd.len / 4, HALL.h / 4)), wallMat, p.x, p.y, p.z); wall.rotation.y = p.ry; wall.receiveShadow = true;
    const q = onWall(wd.k, 0, 1.5, 0.03);
    const pan = mesh(scaleUV(new T.PlaneGeometry(wd.len, 3), wd.len / 4, 1), panelMat, q.x, q.y, q.z); pan.rotation.y = q.ry; pan.receiveShadow = true;
    // الحليات تنقطع عند الأبواب
    const segs = []; let s0 = -wd.len / 2;
    for (const [c, gw] of wd.gaps.slice().sort((a, b) => a[0] - b[0])) { if (c - gw / 2 > s0) segs.push([s0, c - gw / 2]); s0 = c + gw / 2; }
    if (wd.len / 2 > s0) segs.push([s0, wd.len / 2]);
    const sideW = wd.k === 'W' || wd.k === 'E';
    for (const [a, b] of segs) {
      const len = b - a, mid = (a + b) / 2;
      const put = (arr, y, hgt, dep) => { const o = onWall(wd.k, sideW ? mid : (wd.k === 'S' ? -mid : mid), y, dep / 2); arr.push({ x: o.x, y: o.y, z: o.z, ry: o.ry, s: [len, hgt, dep] }); };
      put(goldTrim, 3.05, 0.16, 0.22); put(whiteTrim, 0.16, 0.32, 0.12);
    }
    const full = (arr, y, hgt, dep) => { const o = onWall(wd.k, 0, y, dep / 2); arr.push({ x: o.x, y: o.y, z: o.z, ry: o.ry, s: [wd.len, hgt, dep] }); };
    full(whiteTrim, HALL.h - .3, .6, .5); full(goldTrim, HALL.h - .7, .14, .58);
  }
  const unitBox = new T.BoxGeometry(1, 1, 1);
  const roseGold = std('#ecbfa6', { metalness: 0.75, roughness: 0.28 });
  const gold = std('#f0cf8f', { metalness: 0.8, roughness: 0.25 });
  instanced(unitBox, roseGold, goldTrim);
  instanced(unitBox, std('#fffafc', { roughness: 0.5 }), whiteTrim, { receive: true });

  // ---------- السقف + الأعمدة ----------
  const ceilTex = tex(512, 512, (g, w) => {
    g.fillStyle = '#f1d8e3'; g.fillRect(0, 0, w, w);
    const gr = g.createRadialGradient(w / 2, w / 2, 20, w / 2, w / 2, w * .45); gr.addColorStop(0, '#fff8fb'); gr.addColorStop(1, '#f6dce7');
    g.fillStyle = gr; g.fillRect(40, 40, w - 80, w - 80);
    g.strokeStyle = 'rgba(220,186,140,.8)'; g.lineWidth = 4; g.strokeRect(40, 40, w - 80, w - 80);
    g.strokeStyle = '#efd3df'; g.lineWidth = 14; g.strokeRect(14, 14, w - 28, w - 28);
  }, [HALL.w / 8, HALL.l / 8]);
  const ceilMat = basic({ map: ceilTex, color: '#dcbccc' });
  const ceil = mesh(new T.PlaneGeometry(HALL.w, HALL.l), ceilMat, 0, HALL.h, 0); ceil.rotation.x = Math.PI / 2;

  const PILLAR_Z = [-42, -30, -18, -6, 6, 18, 30, 42];
  const pil = PILLAR_Z.flatMap(z => [-1, 1].map(sd => ({ x: sd * (HX - .75), z })));
  instanced(new T.CylinderGeometry(.5, .56, 14, 28), std('#fbeef3', { roughness: 0.35 }), pil.map(p => ({ ...p, y: 7.8 })), { shadow: true });
  instanced(new T.BoxGeometry(1.5, .8, 1.5), roseGold, pil.map(p => ({ ...p, y: .4 })));
  instanced(new T.BoxGeometry(1.5, .6, 1.5), roseGold, pil.map(p => ({ ...p, y: 15.0 })));
  instanced(new T.TorusGeometry(.6, .08, 8, 20), gold, pil.flatMap(p => [{ ...p, y: 1.0, rx: Math.PI / 2 }, { ...p, y: 14.5, rx: Math.PI / 2 }]));

  // ---------- النوافذ (سماء الغروب الوردية) ----------
  const WIN_Z = [-36, -24, 0, 24, 36];
  const winTex = tex(256, 512, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#b7a5f3'); gr.addColorStop(.5, '#f8b4d0'); gr.addColorStop(1, '#ffdcb6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(rand() * w, rand() * h * .45, rand() * 1.8 + .4, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(255,250,240,.9)'; g.beginPath(); g.arc(w * .7, h * .22, 16, 0, 7); g.fill();
    g.strokeStyle = '#fff8fb'; g.lineWidth = 7;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); for (let y = h * .28; y < h; y += h * .18) { g.moveTo(0, y); g.lineTo(w, y); } g.stroke();
  });
  const winMat = basic({ map: winTex, color: '#ffeaf2' });
  const winList = WIN_Z.flatMap(z => ['W', 'E'].map(k => onWall(k, z, 4.4, .06)));
  instanced(normUV(new T.ShapeGeometry(arch(2.2, 5.8, 2.2), 24)), winMat, winList);
  instanced(new T.ExtrudeGeometry(archFrame(2.6, 2.2, 5.8, 2.6, 2.2), { depth: .2, bevelEnabled: false, curveSegments: 24 }), gold, WIN_Z.flatMap(z => ['W', 'E'].map(k => onWall(k, z, 4.4, .05))));
  instanced(new T.BoxGeometry(5.6, .25, .5), std('#fffafc'), WIN_Z.flatMap(z => ['W', 'E'].map(k => onWall(k, z, 4.3, .25))));
  // بقع ضوء النوافذ على الأرض
  const poolMat = basic({ map: radial('rgba(255,255,255,.9)', 'rgba(255,255,255,.4)'), color: '#ffc9df', transparent: true, opacity: .4, blending: T.AdditiveBlending, depthWrite: false });
  instanced(new T.PlaneGeometry(12, 5), poolMat, WIN_Z.flatMap(z => [-1, 1].map(sd => ({ x: sd * (HX - 6.5), y: .04, z, rx: -Math.PI / 2 }))));

  // ---------- الثريات ----------
  const CH_Z = [-16, 6, 28];
  const chY = 11.4;
  instanced(new T.CylinderGeometry(.06, .06, 4.2, 6), gold, CH_Z.map(z => ({ x: 0, y: HALL.h - 2.1, z })));
  instanced(new T.RingGeometry(1.6, 2.4, 32), basic({ color: '#e7c995', side: T.DoubleSide }), CH_Z.map(z => ({ x: 0, y: HALL.h - .02, z, rx: Math.PI / 2 })));
  const rings = [], crystals = [];
  for (const z of CH_Z) {
    [[2.6, chY + .6], [1.8, chY], [1.0, chY - .6]].forEach(([rr, y]) => {
      rings.push({ x: 0, y, z, rx: Math.PI / 2, s: rr });
      const n = Math.round(rr * 9), len = rr > 2 ? 3 : 2;
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; for (let j = 0; j < len; j++) crystals.push({ x: Math.cos(a) * rr, y: y - .32 - j * .34, z: z + Math.sin(a) * rr, ry: a, s: [1, 1.8, 1] }); }
    });
    crystals.push({ x: 0, y: chY - 1.9, z, s: [3, 5, 3] });
  }
  instanced(new T.TorusGeometry(1, .05, 8, 48), gold, rings);
  const crystalMat = std('#ffffff', { roughness: .05, metalness: .1, emissive: '#ffd6e8', emissiveIntensity: .55, flatShading: true, envMapIntensity: 2.2 });
  instanced(new T.OctahedronGeometry(.12), crystalMat, crystals);
  instanced(new T.SphereGeometry(.55, 16, 12), basic({ color: '#fff3f8', toneMapped: false }), CH_Z.map(z => ({ x: 0, y: chY - .2, z })));
  const haloMat = new T.SpriteMaterial({ map: radial('rgba(255,255,255,.9)', 'rgba(255,220,235,.35)'), color: '#ffd2e5', transparent: true, opacity: .75, blending: T.AdditiveBlending, depthWrite: false });
  const chLights = CH_Z.map(z => {
    const s = new T.Sprite(haloMat); s.position.set(0, chY - .2, z); s.scale.setScalar(9); scene.add(s);
    const l = new T.PointLight('#ffd3e4', 200, 46, 2); l.position.set(0, chY - .6, z); scene.add(l); return l;
  });

  // ---------- سلاسل الإضاءة المعلّقة + البوم بوم ----------
  {
    const bulbs = [], wire = [];
    const strands = [[-27, 13.6, 2.6], [-6, 13.2, 2.4], [16, 13.6, 2.6], [38, 13.0, 2.2]];
    for (const [z, top, sag] of strands) {
      let prev = null;
      for (let i = 0; i <= 48; i++) {
        const x = -HX + 1 + i / 48 * (HALL.w - 2), k = x / (HX - 1), y = top - sag * (1 - k * k), p = [x, y, z + Math.sin(i * .7) * .15];
        if (prev) wire.push(...prev, ...p); prev = p;
        if (i % 1 === 0) bulbs.push({ x: p[0], y: p[1] - .12, z: p[2], c: i % 3 ? '#fff0c4' : '#ffc4dd' });
      }
    }
    const lg = new T.BufferGeometry(); lg.setAttribute('position', new T.Float32BufferAttribute(wire, 3));
    scene.add(new T.LineSegments(lg, new T.LineBasicMaterial({ color: '#d9b48a' })));
    instanced(new T.SphereGeometry(.1, 8, 6), basic({ color: '#ffffff', toneMapped: false }), bulbs);

    const poms = [], strings = [];
    for (let i = 0; i < 34; i++) {
      const sd = i % 2 ? 1 : -1, x = sd * (7 + rand() * 16), z = -28 + rand() * 60, s = .45 + rand() * .45, y = 9.6 + rand() * 4;
      poms.push({ x, y, z, s, ry: rand() * 6, c: pick(PASTEL) }); strings.push(x, y + s, z, x, HALL.h, z);
    }
    instanced(new T.IcosahedronGeometry(1, 4), std('#ffffff', { roughness: .85 }), poms);
    const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.Float32BufferAttribute(strings, 3));
    scene.add(new T.LineSegments(sg, new T.LineBasicMaterial({ color: '#f3cfdc' })));
  }

  // ---------- المسرح ----------
  const SZ = STAGE.front - STAGE.d / 2;
  mesh(new T.BoxGeometry(STAGE.w, STAGE.h, STAGE.d), std('#fffafc', { roughness: .25 }), 0, STAGE.h / 2, SZ, true);
  mesh(new T.BoxGeometry(STAGE.w + .1, .16, .12), roseGold, 0, STAGE.h - .1, STAGE.front + .02);
  mesh(new T.BoxGeometry(STAGE.w, .06, .06), basic({ color: '#ff8fc0' }), 0, .12, STAGE.front + .04);
  mesh(new T.BoxGeometry(12, .8, 1), std('#fffafc', { roughness: .3 }), 0, .4, STAGE.front + .5, true);
  mesh(new T.BoxGeometry(12, .4, 1), std('#fffafc', { roughness: .3 }), 0, .2, STAGE.front + 1.5, true);
  mesh(new T.BoxGeometry(12, .41, .06), std('#f7a8c6'), 0, .2, STAGE.front + 2.0);

  // خلفية المسرح: قوس ترتر وردي بإطار ذهبي
  const sequin = tex(512, 512, (g, w) => {
    g.fillStyle = '#d8789f'; g.fillRect(0, 0, w, w);
    for (let y = 0; y < w; y += 14) for (let x = (y / 14 % 2) * 7; x < w; x += 14) { const l = 62 + rand() * 24; g.fillStyle = `hsl(${325 + rand() * 20},${48 + rand() * 18}%,${l}%)`; g.beginPath(); g.arc(x, y, 6.4, 0, 7); g.fill(); }
  });
  sequin.wrapS = sequin.wrapT = T.RepeatWrapping;
  const bd = mesh(normUV(new T.ShapeGeometry(arch(13, 8, 6), 40), 3, 3), std('#ffffff', { map: sequin, metalness: .45, roughness: .35 }), 0, STAGE.h, -HZ + .15);
  bd.receiveShadow = true;
  mesh(new T.ExtrudeGeometry(archFrame(13.7, 13, 8, 6.6, 6), { depth: .3, bevelEnabled: false, curveSegments: 40 }), gold, 0, STAGE.h, -HZ + .1);

  // ستائر جانبية معقودة
  const curtGeo = new T.PlaneGeometry(6, HALL.h - STAGE.h - .3, 36, 30), cp = curtGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) { const x = cp.getX(i), y = cp.getY(i), pinch = 1 - .45 * Math.exp(-((y + 2) ** 2) / 6); cp.setX(i, x * pinch); cp.setZ(i, Math.sin(x * 3.4) * .3 * (0.6 + pinch * .4)); }
  curtGeo.computeVertexNormals();
  const curtMat = std('#f6b4cb', { roughness: .45, side: T.DoubleSide, metalness: .05 });
  for (const sd of [-1, 1]) {
    const c = mesh(curtGeo, curtMat, sd * 17.6, STAGE.h + (HALL.h - STAGE.h - .3) / 2, -HZ + .7, true);
    mesh(new T.TorusGeometry(.8, .12, 8, 20), gold, sd * 17.6, STAGE.h + (HALL.h - STAGE.h - .3) / 2 - 2, -HZ + 1);
    c.castShadow = false;
  }

  // لافتة "عيد ميلاد سعيد" + اسم صاحبة الحفلة
  const signTex = tex(2048, 560, (g, w, h) => {
    const gr = g.createLinearGradient(0, h * .15, 0, h * .85); gr.addColorStop(0, '#fff8e6'); gr.addColorStop(.5, '#f2c57c'); gr.addColorStop(1, '#fff1d2');
    g.lineJoin = 'round'; g.font = '700 300px "Aref Ruqaa", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
    g.shadowColor = '#b8245f'; g.shadowBlur = 50; g.strokeStyle = '#8f1d4c'; g.lineWidth = 22; g.strokeText('عيد ميلاد سعيد', w / 2, h * .52, w - 120); g.shadowBlur = 0;
    g.strokeStyle = '#fff6e4'; g.lineWidth = 8; g.strokeText('عيد ميلاد سعيد', w / 2, h * .52, w - 120);
    g.fillStyle = gr; g.fillText('عيد ميلاد سعيد', w / 2, h * .52, w - 120);
    g.fillStyle = '#fff3c4'; for (let i = 0; i < 26; i++) { const x = rand() * w, y = rand() * h, s = 4 + rand() * 9; g.beginPath(); g.moveTo(x, y - s * 2); g.lineTo(x + s * .5, y); g.lineTo(x, y + s * 2); g.lineTo(x - s * .5, y); g.fill(); g.beginPath(); g.moveTo(x - s * 2, y); g.lineTo(x, y + s * .5); g.lineTo(x + s * 2, y); g.lineTo(x, y - s * .5); g.fill(); }
  });
  const sign = mesh(new T.PlaneGeometry(22, 6), basic({ map: signTex, transparent: true, toneMapped: false, depthWrite: false, fog: false }), 0, STAGE.h + 10.4, -HZ + .5);
  sign.renderOrder = 2;
  const nameCanvas = document.createElement('canvas'); nameCanvas.width = 2048; nameCanvas.height = 384;
  const nameTex = new T.CanvasTexture(nameCanvas); nameTex.colorSpace = T.SRGBColorSpace;
  const namePlane = mesh(new T.PlaneGeometry(16, 3), basic({ map: nameTex, transparent: true, toneMapped: false, depthWrite: false, fog: false }), 0, STAGE.h + 7.3, -HZ + .5);
  namePlane.renderOrder = 2;
  function setName(name) {
    const g = nameCanvas.getContext('2d'), w = nameCanvas.width, h = nameCanvas.height;
    g.clearRect(0, 0, w, h); name = String(name || '').trim().slice(0, 30);
    namePlane.visible = !!name;
    if (name) {
      g.font = '900 230px Zain, ' + FONT_AR; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.lineJoin = 'round';
      g.shadowColor = '#b8245f'; g.shadowBlur = 40; g.strokeStyle = '#a3306a'; g.lineWidth = 18; g.strokeText(name, w / 2, h / 2 + 10, w - 140); g.shadowBlur = 0;
      g.fillStyle = '#ffffff'; g.fillText(name, w / 2, h / 2 + 10, w - 140);
    }
    nameTex.needsUpdate = true;
  }
  setName(opts.name);

  // ---------- البالونات ----------
  const matte = [], chrome = [];
  const balloon = (x, y, z, s) => (rand() < .3 ? chrome : matte).push({ x, y, z, s: [s, s * 1.15, s], c: null });
  const cluster = (x, y, z, n, spread, along) => {
    for (let i = 0; i < n; i++) { const s = .38 + rand() * .45; const o = [(rand() - .5) * spread, (rand() - .5) * spread, rand() * spread * .7]; balloon(x + (along === 'x' ? o[2] : o[0]), y + o[1], z + (along === 'x' ? o[0] : o[2]), s); }
  };
  // قوس البالونات حول خلفية المسرح
  for (let y = 0; y <= 8; y += .75) for (const sd of [-1, 1]) cluster(sd * 13.9, STAGE.h + y + .3, -HZ + .7, 5, 1.4);
  for (let i = 0; i <= 36; i++) { const a = Math.PI - i / 36 * Math.PI; cluster(Math.cos(a) * 13.9, STAGE.h + 8 + Math.sin(a) * 6.5, -HZ + .7, 5, 1.4); }
  // أعمدة بالونات عند أبواب الأقسام والمدخل
  for (const s of SECTIONS) for (let y = 0; y <= 8; y += .8) for (const d of [-1, 1]) { const p = onWall(s.side < 0 ? 'W' : 'E', s.z + d * 3.6, y + .4, .7); cluster(p.x, p.y, p.z, 3, 1, 'x'); }
  for (let y = 0; y <= 9; y += .8) for (const d of [-1, 1]) cluster(d * 4.8, y + .4, HZ - 1.4, 3, 1.1);
  const balloonGeo = new T.SphereGeometry(1, 28, 20);
  matte.forEach(b => { b.c = pick(PASTEL); }); chrome.forEach(b => { b.c = pick(CHROME); });
  instanced(balloonGeo, std('#ffffff', { roughness: .32, metalness: .05 }), matte, { shadow: true });
  instanced(balloonGeo, std('#ffffff', { roughness: .12, metalness: .9, envMapIntensity: 1.4 }), chrome, { cast: true });

  // قلوب فويل كبيرة تطفو
  const hs = new T.Shape(); hs.moveTo(0, -1.1); hs.bezierCurveTo(-.3, -.7, -1.3, -.2, -1.3, .45); hs.bezierCurveTo(-1.3, 1.05, -.55, 1.3, 0, .7); hs.bezierCurveTo(.55, 1.3, 1.3, 1.05, 1.3, .45); hs.bezierCurveTo(1.3, -.2, .3, -.7, 0, -1.1);
  const heartGeo = new T.ExtrudeGeometry(hs, { depth: .25, bevelEnabled: true, bevelThickness: .25, bevelSize: .18, bevelSegments: 5, curveSegments: 20 }); heartGeo.center();
  const heartsData = [[-9, 7.8, -44.5, 1.3], [9, 7.8, -44.5, 1.3], [-24, 8.5, -20, 1], [24, 8.5, 4, 1], [-24, 9, 26, 1], [24, 9.2, -30, .9]].map(([x, y, z, s], i) => ({ x, y, z, s, ph: i * 1.7, c: i % 2 ? '#f9a8c9' : '#f4c0a8' }));
  const hearts = instanced(heartGeo, std('#ffffff', { metalness: .85, roughness: .18, envMapIntensity: 1.5 }), heartsData, { cast: true });
  hearts.frustumCulled = false;

  // ---------- الكيكة ----------
  const cake = new T.Group(); cake.position.set(0, STAGE.h, STAGE.front - 6.5); scene.add(cake);
  mesh(new T.CylinderGeometry(1.1, 1.4, .2, 32), gold, 0, .1, 0, true, cake);
  mesh(new T.CylinderGeometry(.22, .3, .6, 16), gold, 0, .5, 0, true, cake);
  mesh(new T.CylinderGeometry(2.25, 2.25, .1, 40), gold, 0, .85, 0, true, cake);
  const tiers = [[1.95, 1.0, '#fffafc'], [1.5, .9, '#f8bfd3'], [1.08, .8, '#fffafc'], [.72, .62, '#f5a7c4']];
  const pearls = [], roses = [];
  let ty = .9;
  tiers.forEach(([rr, hh, col], i) => {
    mesh(new T.CylinderGeometry(rr, rr, hh, 40), std(col, { roughness: .55 }), 0, ty + hh / 2, 0, true, cake);
    mesh(new T.TorusGeometry(rr - .02, .085, 8, 48), std(i % 2 ? '#fffafc' : '#f7a6c4', { roughness: .4 }), 0, ty + hh - .02, 0, false, cake).rotation.x = Math.PI / 2;
    const n = Math.round(rr * 16); for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; pearls.push({ x: Math.cos(a) * (rr + .03), y: ty + .08, z: Math.sin(a) * (rr + .03) }); }
    for (let k = 0; k < 4; k++) { const a = -.6 + i * .5 + k * .32; roses.push({ x: Math.cos(a) * rr, y: ty + hh * (.25 + (k % 2) * .4), z: Math.sin(a) * rr, s: .14 + rand() * .07, c: k % 2 ? '#ec5f95' : '#fbc4d8' }); }
    ty += hh;
  });
  const pearlIM = instanced(new T.SphereGeometry(.07, 8, 6), std('#fffaf2', { roughness: .15, metalness: .2 }), pearls); cake.add(pearlIM);
  const roseIM = instanced(new T.IcosahedronGeometry(1, 1), std('#ffffff', { roughness: .6 }), roses); cake.add(roseIM);
  // تاج صغير + شموع
  mesh(new T.CylinderGeometry(.34, .3, .26, 20, 1, true), std('#f2cf8e', { metalness: .9, roughness: .2, side: T.DoubleSide }), 0, ty + .13, 0, false, cake);
  const cones = []; for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2; cones.push({ x: Math.cos(a) * .32, y: ty + .36, z: Math.sin(a) * .32 }); }
  cake.add(instanced(new T.ConeGeometry(.07, .22, 6), gold, cones));
  const candleTex = tex(64, 128, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#f472b6'; g.lineWidth = 10; for (let y = -w; y < h + w; y += 28) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + w); g.stroke(); } });
  const candles = [], flamePos = [];
  for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2 + .2; const x = Math.cos(a) * .52, z = Math.sin(a) * .52; candles.push({ x, y: ty + .22, z }); flamePos.push(x, ty + .56, z); }
  cake.add(instanced(new T.CylinderGeometry(.04, .04, .44, 8), std('#ffffff', { map: candleTex, roughness: .5 }), candles));
  const flameGeo = new T.BufferGeometry(); flameGeo.setAttribute('position', new T.Float32BufferAttribute(flamePos, 3));
  const flameMat = new T.PointsMaterial({ map: radial('rgba(255,255,230,1)', 'rgba(255,190,90,.7)'), color: '#ffd27a', size: .42, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  cake.add(new T.Points(flameGeo, flameMat));
  const cakeGlow = new T.PointLight('#ffb36b', 14, 9, 2); cakeGlow.position.set(0, ty + 1, 0); cake.add(cakeGlow);

  // ---------- الهدايا ----------
  {
    const gifts = [], ribA = [], ribB = [], bows = [];
    const GIFT_C = ['#f9a8d4', '#e9d5ff', '#ffffff', '#fbcfe8', '#c7f0e0', '#ffd6b8', '#f472b6'];
    for (const sd of [-1, 1]) {
      const placed = [];
      for (let i = 0; i < 13; i++) {
        const w = .6 + rand() * .7, h = .5 + rand() * .7, d = .6 + rand() * .6, ry = rand() * 1.4;
        let x = sd * (8.6 + rand() * 5.2), z = STAGE.front + .8 + rand() * 4.2, y = h / 2;
        if (i > 8) { const b = placed[i - 9]; x = b.x + (rand() - .5) * .2; z = b.z + (rand() - .5) * .2; y = b.top + h / 2; }
        const rib = rand() < .5 ? '#f3d08e' : '#ffffff';
        gifts.push({ x, y, z, ry, s: [w, h, d], c: pick(GIFT_C) });
        ribA.push({ x, y, z, ry, s: [w + .02, h + .02, .12], c: rib }); ribB.push({ x, y, z, ry, s: [.12, h + .02, d + .02], c: rib });
        bows.push({ x, y: y + h / 2 + .06, z, ry, s: [.2, .1, .2], c: rib });
        placed.push({ x, z, top: y + h / 2 });
      }
    }
    instanced(unitBox, std('#ffffff', { roughness: .5 }), gifts, { shadow: true });
    const ribMat = std('#ffffff', { roughness: .3, metalness: .3 });
    instanced(unitBox, ribMat, ribA); instanced(unitBox, ribMat, ribB);
    instanced(new T.TorusKnotGeometry(.6, .25, 32, 6, 2, 3), ribMat, bows);
  }

  // ---------- الطاولات والكراسي ----------
  const TABLES = [];
  for (const z of [-22, -13, -4, 5, 14, 23]) for (const x of [-19, -10.5, 10.5, 19]) TABLES.push({ x, z });
  const plates = [], seat = [], back = [], sash = [], vases = [], flowers = [];
  for (const t of TABLES) {
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2 + Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a), ry = Math.atan2(ca, sa) + Math.PI;
      seat.push({ x: t.x + ca * 2.45, y: .26, z: t.z + sa * 2.45, ry, s: [.56, .52, .56] });
      back.push({ x: t.x + ca * 2.72, y: .95, z: t.z + sa * 2.72, ry, s: [.56, .9, .1] });
      sash.push({ x: t.x + ca * 2.76, y: .82, z: t.z + sa * 2.76, ry, s: [.6, .2, .12] });
      plates.push({ x: t.x + ca * 1.3, y: .83, z: t.z + sa * 1.3 });
    }
    vases.push({ x: t.x, y: 1.06, z: t.z });
    flowers.push({ x: t.x, y: 1.55, z: t.z, s: .5, c: pick(['#f4a3c0', '#f8c4d6', '#e98bb0', '#e8c8f0']) });
  }
  instanced(new T.CylinderGeometry(1.75, 1.98, .8, 32), std('#e3a1b9', { roughness: .85 }), TABLES.map(t => ({ ...t, y: .4 })), { shadow: true });
  instanced(new T.CylinderGeometry(1.8, 1.8, .05, 32), std('#fffafc', { roughness: .7 }), TABLES.map(t => ({ ...t, y: .81 })), { receive: true });
  instanced(new T.CylinderGeometry(.24, .24, .02, 20), std('#ffffff', { roughness: .2, metalness: .1 }), plates);
  instanced(new T.CylinderGeometry(.12, .2, .5, 12), gold, vases);
  instanced(new T.IcosahedronGeometry(1, 4), std('#ffffff', { roughness: .75 }), flowers, { cast: true });
  instanced(unitBox, std('#fbf1ee', { roughness: .75 }), seat, { shadow: true });
  instanced(unitBox, std('#fbf1ee', { roughness: .75 }), back, { shadow: true });
  instanced(unitBox, std('#c97597', { roughness: .45, metalness: .1 }), sash);

  // بالونات الطاولات (تتمايل) + خيوطها
  const tb = [];
  for (const t of TABLES) for (let k = 0; k < 3; k++) { const a = k / 3 * Math.PI * 2 + rand(); tb.push({ bx: t.x, bz: t.z, x: t.x + Math.cos(a) * .55, y: 3.5 + k * .5 + rand() * .4, z: t.z + Math.sin(a) * .55, s: [.42, .5, .42], ph: rand() * 6, c: pick(k === 2 ? CHROME : PASTEL) }); }
  const tableBalloons = instanced(balloonGeo, std('#ffffff', { roughness: .28, metalness: .15 }), tb, { cast: true });
  tableBalloons.frustumCulled = false;
  const tbStr = new Float32Array(tb.length * 6);
  const tbGeo = new T.BufferGeometry(); tbGeo.setAttribute('position', new T.BufferAttribute(tbStr, 3));
  const tbLines = new T.LineSegments(tbGeo, new T.LineBasicMaterial({ color: '#f0d3df' })); tbLines.frustumCulled = false; scene.add(tbLines);

  // ---------- جدار الورد عند المدخل ----------
  const roseWall = tex(1024, 768, (g, w, h) => {
    g.fillStyle = '#f2bccd'; g.fillRect(0, 0, w, h);
    const cols = ['#fff5f8', '#fbd0dd', '#f7a8c2', '#ef7fa5', '#ffe3ec', '#f9c4d4'];
    for (let i = 0; i < 360; i++) {
      const x = rand() * w, y = rand() * h, rr = 22 + rand() * 20, c = pick(cols);
      if (rand() < .25) { g.fillStyle = 'rgba(126,170,120,.8)'; g.beginPath(); g.ellipse(x + rr * .8, y + rr * .4, rr * .55, rr * .22, .6, 0, 7); g.fill(); }
      g.fillStyle = c; g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill();
      g.strokeStyle = 'rgba(180,70,110,.28)'; g.lineWidth = 2.4; g.beginPath();
      for (let a = 0; a < 14; a += .3) { const q = rr * (1 - a / 15); g.lineTo(x + Math.cos(a) * q * .9, y + Math.sin(a) * q * .9); } g.stroke();
    }
  });
  const neon = (text, font) => tex(1536, 320, (g, w, h) => {
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.lineJoin = 'round';
    g.shadowColor = '#d6337a'; g.shadowBlur = 36; g.strokeStyle = '#a3306a'; g.lineWidth = 16; g.strokeText(text, w / 2, h / 2 + 6, w - 80); g.shadowBlur = 0;
    glowText(g, text, w / 2, h / 2 + 6, font, '#ffffff', '#ff8fc4', 18, w - 80);
  });
  [['كل عام وأنتِ بخير', -17], ['اليوم يومكِ', 17]].forEach(([txt, x]) => {
    const p = onWall('S', -x, 3.9, .24);
    mesh(new T.PlaneGeometry(10, 7.4), std('#ffffff', { map: roseWall, roughness: .85 }), p.x, p.y, p.z).rotation.y = p.ry;
    const f = onWall('S', -x, 3.9, .1); const fr = mesh(new T.BoxGeometry(10.5, 7.9, .2), gold, f.x, f.y, f.z); fr.rotation.y = f.ry;
    const q = onWall('S', -x, 4.8, .4); const n = mesh(new T.PlaneGeometry(9.6, 2.0), basic({ map: neon(txt, '700 170px "Aref Ruqaa", serif'), transparent: true, toneMapped: false, depthWrite: false, fog: false }), q.x, q.y, q.z); n.rotation.y = q.ry;
  });

  // ---------- المدخل ----------
  {
    const doorTex = tex(256, 640, (g, w, h) => {
      g.fillStyle = '#fff8fb'; g.fillRect(0, 0, w, h); g.strokeStyle = '#e3c08f'; g.lineWidth = 6;
      g.strokeRect(28, 28, w - 56, h * .42); g.strokeRect(28, h * .5, w - 56, h * .45);
      g.fillStyle = '#f9cfdd'; heart(g, w / 2, h * .16, 70);
    });
    const dm = std('#ffffff', { map: doorTex, roughness: .45 });
    for (const d of [-1, 1]) { const p = onWall('S', d * 1.3, 3.3, .12); const m = mesh(new T.BoxGeometry(2.6, 6.6, .2), dm, p.x, p.y, p.z); m.rotation.y = p.ry; mesh(new T.SphereGeometry(.13, 12, 10), gold, d * .35, 3.2, HZ - .3); }
    const f = onWall('S', 0, 0, .05); const fr = mesh(new T.ExtrudeGeometry(archFrame(3.4, 2.7, 6.6, 1.6, 1.2), { depth: .3, bevelEnabled: false, curveSegments: 24 }), gold, f.x, f.y, f.z); fr.rotation.y = f.ry;
    const top = onWall('S', 0, 7.0, .1); const tp = mesh(normUV(new T.ShapeGeometry((() => { const s = new T.Shape(); s.moveTo(-2.7, 0); s.lineTo(2.7, 0); s.absellipse(0, 0, 2.7, 1.2, 0, Math.PI, false); return s; })(), 24)), basic({ map: winTex, color: '#ffeaf2' }), top.x, top.y - .4, top.z); tp.rotation.y = top.ry;
    const sg = onWall('S', 0, 9.9, .15);
    const st = mesh(new T.PlaneGeometry(11, 2.3), basic({ map: neon('أهلاً بكم في الحفلة', '700 150px "Aref Ruqaa", serif'), transparent: true, toneMapped: false, depthWrite: false, fog: false }), sg.x, sg.y, sg.z); st.rotation.y = sg.ry;
  }

  // ---------- أبواب الأقسام ----------
  const portals = [];
  for (const s of SECTIONS) {
    const k = s.side < 0 ? 'W' : 'E';
    const portalTex = tex(256, 512, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, s.c2); gr.addColorStop(.55, '#ffffff'); gr.addColorStop(1, s.c1);
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${.4 + rand() * .5})`; g.beginPath(); g.arc(rand() * w, rand() * h, 1 + rand() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 6; i++) heart(g, rand() * w, rand() * h, 18 + rand() * 18);
    });
    portalTex.wrapS = portalTex.wrapT = T.RepeatWrapping;
    const pp = onWall(k, s.z, 0, .1);
    const pm = mesh(normUV(new T.ShapeGeometry(arch(2.6, 5.4, 2.6), 24)), basic({ map: portalTex, toneMapped: false, fog: false }), pp.x, pp.y, pp.z); pm.rotation.y = pp.ry;
    const fp = onWall(k, s.z, 0, .05);
    const fm = mesh(new T.ExtrudeGeometry(archFrame(3.15, 2.6, 5.4, 3.15, 2.6), { depth: .35, bevelEnabled: false, curveSegments: 24 }), gold, fp.x, fp.y, fp.z); fm.rotation.y = fp.ry;
    const lt = tex(1024, 280, (g, w, h) => {
      g.fillStyle = 'rgba(255,250,252,.95)'; g.strokeStyle = '#e3bf86'; g.lineWidth = 10; g.beginPath(); g.roundRect(20, 20, w - 40, h - 40, 120); g.fill(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
      g.fillStyle = '#a3306a'; g.font = '900 118px Zain, ' + FONT_AR; g.fillText(s.title, w / 2, h * .42, w - 120);
      g.fillStyle = '#d08cab'; g.font = '700 50px ' + FONT_AR; g.fillText('قريباً', w / 2, h * .76);
    });
    const lp = onWall(k, s.z, 10.0, .2);
    const lm = mesh(new T.PlaneGeometry(6.4, 1.75), basic({ map: lt, transparent: true, fog: false }), lp.x, lp.y, lp.z); lm.rotation.y = lp.ry;
    const ring = mesh(new T.RingGeometry(2.1, 2.7, 40), basic({ color: s.c2, transparent: true, opacity: .35, blending: T.AdditiveBlending, depthWrite: false }), s.side * (HX - 3.4), .05, s.z);
    ring.rotation.x = -Math.PI / 2;
    portals.push({ s, tex: portalTex, ring, x: s.side * (HX - 1.5) });
  }

  // ---------- قصاصات الورق (كونفيتي) ----------
  const CONF = 900, cPos = new Float32Array(CONF * 3), cCol = new Float32Array(CONF * 3), cVel = new Float32Array(CONF);
  {
    const col = new T.Color(), CC = ['#f472b6', '#f9a8d4', '#f3d08e', '#ffffff', '#e9d5ff', '#ffc4dd'];
    for (let i = 0; i < CONF; i++) { cPos[i * 3] = (rand() - .5) * (HALL.w - 2); cPos[i * 3 + 1] = rand() * HALL.h; cPos[i * 3 + 2] = (rand() - .5) * (HALL.l - 2); cVel[i] = .25 + rand() * .45; col.set(pick(CC)); cCol.set([col.r, col.g, col.b], i * 3); }
  }
  const confGeo = new T.BufferGeometry();
  confGeo.setAttribute('position', new T.BufferAttribute(cPos, 3)); confGeo.setAttribute('color', new T.BufferAttribute(cCol, 3));
  const confMat = new T.PointsMaterial({ size: .16, vertexColors: true, map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,.9)'), transparent: true, depthWrite: false, alphaTest: .05 });
  const confetti = new T.Points(confGeo, confMat); confetti.frustumCulled = false; scene.add(confetti);

  // ---------- إضاءات المزاج ووقت الحفل ----------
  // party = 0 (استقبال: إضاءة دافئة خافتة) → 1 (وقت الحفل: القاعة تغمق،
  // ليزر، كرة ديسكو، بقع ألوان تتحرك على الأرض). الانتقال تدريجي بالـ tick.
  const ADD = { transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, fog: false };
  // إضاءة جدارية من تحت لفوق (Uplights) — ألوان ثابتة ناعمة بالاستقبال، وتتلوّن بالحفل
  const upTex = tex(128, 512, (g, w, h) => {
    g.save(); g.translate(w / 2, h); g.scale(1, 2 * h / w);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, w / 2); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.4, 'rgba(255,255,255,.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(-w / 2, -w / 2, w, w / 2); g.restore();
  });
  const upList = [
    ...WIN_Z.flatMap(z => ['W', 'E'].map(k => onWall(k, z, 6, .14))),
    ...[-27, -22, 22, 27].map(x => onWall('N', x, 6, .2)),
    ...[-26, -9, 9, 26].map(x => onWall('S', x, 6, .2)),
  ].map((p, i) => ({ ...p, c: i % 2 ? '#c9a0ff' : '#ff8fc0' }));
  const upMat = basic({ map: upTex, ...ADD, opacity: .45 });
  const uplights = instanced(new T.PlaneGeometry(6, 12), upMat, upList);
  const upBase = upList.map(p => new T.Color(p.c));

  // بقع ألوان تتحرك على الأرض (بالحفل)
  const SPOTS = 9;
  const spotMat = basic({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,.55)'), ...ADD, opacity: 0 });
  const spots = instanced(new T.PlaneGeometry(1, 1), spotMat, Array.from({ length: SPOTS }, () => ({ x: 0, y: .06, z: 0, rx: -Math.PI / 2, s: 6, c: '#ff6fb5' })));
  spots.frustumCulled = false;

  // الليزر: باعثات على المسرح وفوق الخلفية وفي زوايا المدخل، كل باعث مروحة أشعة
  const EMIT = [
    { o: [-15.5, 1.6, STAGE.front + .2], yaw: .35, pitch: .16, n: 4 },
    { o: [15.5, 1.6, STAGE.front + .2], yaw: -.35, pitch: .16, n: 4 },
    { o: [-8, 14.6, -HZ + 1.2], yaw: .1, pitch: -.3, n: 3 },
    { o: [0, 15.2, -HZ + 1.2], yaw: 0, pitch: -.24, n: 4 },
    { o: [8, 14.6, -HZ + 1.2], yaw: -.1, pitch: -.3, n: 3 },
    { o: [-29, 14, HZ - 2], yaw: Math.PI - .5, pitch: -.22, n: 3 },
    { o: [29, 14, HZ - 2], yaw: Math.PI + .5, pitch: -.22, n: 3 },
  ];
  const BEAMS = [];
  EMIT.forEach((e, ei) => { for (let i = 0; i < e.n; i++) BEAMS.push({ e, i, ph: ei * 1.3 + i * .4, o: new T.Vector3(...e.o) }); });
  const beamGeo = new T.CylinderGeometry(1, 1, 1, 6, 1, true); beamGeo.translate(0, .5, 0);
  const coreMat = basic({ ...ADD, opacity: 0 }), glowMat = basic({ ...ADD, opacity: 0 });
  const beamInit = BEAMS.map(() => ({ x: 0, y: -50, z: 0, c: '#ff4fae' }));
  const beamCore = instanced(beamGeo, coreMat, beamInit), beamGlow = instanced(beamGeo, glowMat, beamInit);
  beamCore.frustumCulled = beamGlow.frustumCulled = false;
  const dotPos = new Float32Array(BEAMS.length * 3), dotCol = new Float32Array(BEAMS.length * 3);
  const dotGeo = new T.BufferGeometry(); dotGeo.setAttribute('position', new T.BufferAttribute(dotPos, 3)); dotGeo.setAttribute('color', new T.BufferAttribute(dotCol, 3));
  const dotMat = new T.PointsMaterial({ map: radial(), size: .9, vertexColors: true, ...ADD, opacity: 0 });
  const dots = new T.Points(dotGeo, dotMat); dots.frustumCulled = false; scene.add(dots);
  for (const e of EMIT) { const b = mesh(new T.BoxGeometry(.5, .35, .6), std('#2b1830', { metalness: .6, roughness: .3 }), e.o[0], e.o[1], e.o[2]); b.rotation.y = e.yaw; }
  const LASER_SETS = [['#ff3fa4', '#ff8ad0', '#ff3fa4'], ['#c45cff', '#ff4fae', '#9d7bff'], ['#ff5fc8', '#ffd1ec', '#ff5fc8'], ['#7fe3ff', '#ff6fc0', '#c99bff']];
  // أقرب نقطة يصطدم فيها الشعاع بجدار/أرض/سقف القاعة
  const hitT = (o, d) => {
    let t = 200;
    if (d.x) t = Math.min(t, ((d.x > 0 ? HX : -HX) - o.x) / d.x);
    if (d.y) t = Math.min(t, ((d.y > 0 ? HALL.h : 0) - o.y) / d.y);
    if (d.z) t = Math.min(t, ((d.z > 0 ? HZ : -HZ) - o.z) / d.z);
    return Math.max(.1, t);
  };

  // كرة ديسكو تنزل من السقف بالحفل + انعكاساتها على الجدران
  const DISCO_Z = -5;
  const disco = mesh(new T.IcosahedronGeometry(1.15, 3), std('#ffffff', { metalness: 1, roughness: .12, flatShading: true, envMapIntensity: 2.5 }), 0, HALL.h + 2, DISCO_Z);
  const discoRod = mesh(new T.CylinderGeometry(.04, .04, 1, 6), gold, 0, HALL.h, DISCO_Z);
  const discoHalo = new T.Sprite(new T.SpriteMaterial({ map: radial(), color: '#ffd6ef', ...ADD, opacity: 0 })); discoHalo.scale.setScalar(5); scene.add(discoHalo);
  const REFL = 240, reflDir = [], reflPos = new Float32Array(REFL * 3);
  for (let i = 0; i < REFL; i++) { const y = -1 + rand() * 1.25, a = rand() * Math.PI * 2, q = Math.sqrt(1 - y * y); reflDir.push([Math.cos(a) * q, y, Math.sin(a) * q]); }
  const reflGeo = new T.BufferGeometry(); reflGeo.setAttribute('position', new T.BufferAttribute(reflPos, 3));
  const reflMat = new T.PointsMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,.6)'), color: '#ffe4f3', size: .45, ...ADD, opacity: 0 });
  const refl = new T.Points(reflGeo, reflMat); refl.frustumCulled = false; scene.add(refl);

  let party = 0, partyTarget = 0, envMats = null;
  const CEIL_A = new T.Color('#dcbccc'), CEIL_B = new T.Color('#3b2342');
  const FOG_A = new T.Color('#e7c0d2'), FOG_B = new T.Color('#24102a'), WIN_A = new T.Color('#ffeaf2'), WIN_B = new T.Color('#5d4373');
  const lerp = (a, b, k) => a + (b - a) * k, col = new T.Color(), v3 = new T.Vector3(), UP = new T.Vector3(0, 1, 0);
  function updateParty(dt, t) {
    party += (partyTarget - party) * (1 - Math.exp(-dt * 1.8));
    const k = party, on = k > .01;
    // انعكاسات البيئة هي أكبر مصدر إنارة بالقاعة — نخفّضها بالحفل عشان تغمق فعلاً
    if (!envMats) { envMats = []; scene.traverse(o => [].concat(o.material || []).forEach(m => { if (m.isMeshStandardMaterial && !envMats.some(e => e.m === m)) envMats.push({ m, b: m.envMapIntensity }); })); }
    const envK = lerp(1, .09, k); for (const e of envMats) e.m.envMapIntensity = e.b * envK;
    ceilMat.color.lerpColors(CEIL_A, CEIL_B, k);
    hemi.intensity = lerp(.24, .035, k); sun.intensity = lerp(.6, .05, k); stageFill.intensity = lerp(.7, .35, k);
    r.toneMappingExposure = lerp(.95, 1.0, k);
    scene.fog.color.lerpColors(FOG_A, FOG_B, k); scene.background.copy(scene.fog.color);
    scene.fog.near = lerp(90, 30, k); scene.fog.far = lerp(230, 150, k);
    winMat.color.lerpColors(WIN_A, WIN_B, k); haloMat.opacity = lerp(.75, .3, k); poolMat.opacity = lerp(.4, .04, k);
    upMat.opacity = lerp(.45, .95, k);
    // ألوان الإضاءة الجدارية: ثابتة بالاستقبال، موجة وردي↔بنفسجي بالحفل
    upBase.forEach((c0, i) => { col.setHSL(.86 + Math.sin(t * .9 + i * .7) * .09, .95, .62); col.lerpColors(c0, col, k); uplights.setColorAt(i, col); });
    uplights.instanceColor.needsUpdate = true;
    spots.visible = beamCore.visible = beamGlow.visible = dots.visible = refl.visible = discoHalo.visible = on;
    disco.position.y = lerp(HALL.h + 2, 12.4, Math.min(1, k * 1.3)); disco.rotation.y = t * .5;
    discoRod.scale.y = HALL.h - disco.position.y + .6; discoRod.position.y = (HALL.h + disco.position.y) / 2;
    if (!on) return;
    spotMat.opacity = .5 * k;
    for (let i = 0; i < SPOTS; i++) {
      setInst(spots, i, { x: Math.sin(t * .37 + i * 2.1) * 18, y: .06 + i * .002, z: -6 + Math.sin(t * .29 + i * 1.3) * 24, rx: -Math.PI / 2, s: 5 + Math.sin(t + i) });
      col.setHSL(.8 + ((i * .07 + t * .03) % .22), .9, .6); spots.setColorAt(i, col);
    }
    spots.instanceMatrix.needsUpdate = true; spots.instanceColor.needsUpdate = true;
    // الليزر يغيّر مجموعة ألوانه كل 6 ثواني ويتأرجح بأنماط مختلفة
    const set = LASER_SETS[Math.floor(t / 6) % LASER_SETS.length], blink = (Math.floor(t * 2) % 8) === 7 ? .35 : 1;
    coreMat.opacity = .9 * k * blink; glowMat.opacity = .16 * k * blink; dotMat.opacity = .9 * k * blink;
    BEAMS.forEach((b, i) => {
      const e = b.e, spread = e.n > 1 ? (b.i - (e.n - 1) / 2) * .22 : 0;
      const yaw = e.yaw + spread + Math.sin(t * .8 + b.ph) * .45, pitch = e.pitch + Math.sin(t * .55 + b.ph * 2) * .14;
      v3.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
      const len = hitT(b.o, v3);
      dummy.position.copy(b.o); dummy.quaternion.setFromUnitVectors(UP, v3);
      dummy.scale.set(.028, len, .028); dummy.updateMatrix(); beamCore.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(.09, len, .09); dummy.updateMatrix(); beamGlow.setMatrixAt(i, dummy.matrix);
      col.set(set[i % set.length]); beamCore.setColorAt(i, col); beamGlow.setColorAt(i, col); dotCol.set([col.r, col.g, col.b], i * 3);
      dotPos.set([b.o.x + v3.x * (len - .05), b.o.y + v3.y * (len - .05), b.o.z + v3.z * (len - .05)], i * 3);
    });
    for (const m of [beamCore, beamGlow]) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
    dotGeo.attributes.position.needsUpdate = true; dotGeo.attributes.color.needsUpdate = true;
    // انعكاسات كرة الديسكو: نقاط تدور على الجدران والأرض
    const c0 = disco.position, ca = Math.cos(t * .5), sa = Math.sin(t * .5);
    reflMat.opacity = .85 * k; discoHalo.material.opacity = .6 * k; discoHalo.position.copy(c0);
    for (let i = 0; i < REFL; i++) {
      const d = reflDir[i]; v3.set(d[0] * ca - d[2] * sa, d[1], d[0] * sa + d[2] * ca);
      const L = hitT(c0, v3) - .06; reflPos.set([c0.x + v3.x * L, c0.y + v3.y * L, c0.z + v3.z * L], i * 3);
    }
    reflGeo.attributes.position.needsUpdate = true;
  }
  function setParty(onOff) { partyTarget = onOff ? 1 : 0; opts.onPartyChange && opts.onPartyChange(!!onOff); }

  // ---------- الكاميرا: جولة سينمائية أو تجوّل ----------
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pos = new T.Vector3(0, 0, HZ - 6);
  let yaw = 0, pitch = -.02, mode = 'tour', tourA = 0, eyeY = EYE, near = null;
  // وضع 'follow' (اللعب الجماعي): pos = مكان شخصية اللاعب، والكاميرا خلفها وتلف بالسحب
  let localRy = Math.PI, moving = false, sprinting = false, camElev = .42;
  const followLook = new T.Vector3();
  const tourPos = new T.Vector3(), tourLook = new T.Vector3(), curLook = new T.Vector3(0, 4, -20);
  const OBST = [
    ...TABLES.map(t => [t.x, t.z, 3.0]),
    [0, STAGE.front - 6.5, 2.6], [-11.2, STAGE.front + 3, 3.2], [11.2, STAGE.front + 3, 3.2],
    ...pil.map(p => [p.x, p.z, 1.3]),
  ];
  const floorAt = (x, z) => {
    if (Math.abs(x) <= STAGE.w / 2 && z <= STAGE.front) return STAGE.h;
    if (Math.abs(x) <= 6 && z > STAGE.front && z <= STAGE.front + 1) return .8;
    if (Math.abs(x) <= 6 && z > STAGE.front + 1 && z <= STAGE.front + 2) return .4;
    return 0;
  };
  const free = (x, z, from) => floorAt(x, z) - from <= .45;
  const resolve = () => {
    for (const [ox, oz, rr] of OBST) { const dx = pos.x - ox, dz = pos.z - oz, d = Math.hypot(dx, dz); if (d < rr && d > 1e-4) { pos.x = ox + dx / d * rr; pos.z = oz + dz / d * rr; } }
    pos.x = Math.max(-HX + 1, Math.min(HX - 1, pos.x)); pos.z = Math.max(-HZ + 2, Math.min(HZ - 1.2, pos.z));
  };
  // بدء وضع الشخصية: يحط اللاعب بمكانه من السيرفر والكاميرا خلفه
  function setFollow(start) {
    if (!start) { setMode('tour'); return; }
    pos.set(start.x, 0, start.z); resolve();
    localRy = start.ry == null ? Math.PI : start.ry; yaw = localRy - Math.PI;
    if (mode !== 'follow') { mode = 'follow'; cam.fov = 58; cam.updateProjectionMatrix(); onModeChange && onModeChange('follow'); }
  }
  const getLocal = () => ({ x: pos.x, z: pos.z, ry: localRy, moving, running: sprinting, y: floorAt(pos.x, pos.z) });
  function setMode(m) {
    if (m === mode) return;
    if (m === 'walk') {
      // نبدأ التجوّل من مكان الكاميرا الحالي باتجاه نظرها
      const dir = new T.Vector3(); cam.getWorldDirection(dir);
      yaw = Math.atan2(-dir.x, -dir.z); pitch = Math.max(-.6, Math.min(.6, Math.asin(dir.y)));
      pos.set(cam.position.x, 0, cam.position.z); resolve(); eyeY = cam.position.y;
      cam.fov = 62;
    } else { cam.fov = 52; tourA = Math.atan2(cam.position.x / 20, (cam.position.z + 2) / 30); }
    cam.updateProjectionMatrix();
    mode = m; onModeChange && onModeChange(m);
  }
  const q0 = new T.Quaternion(), m4 = new T.Matrix4();
  function updateCamera(dt) {
    const inp = controls ? controls.read() : null;
    if (inp && inp.active && mode === 'tour' && !opts.noFreeWalk) setMode('walk');
    if (mode === 'follow') {
      moving = false; sprinting = false;
      if (inp) {
        yaw -= inp.dx * .005; camElev = Math.max(.08, Math.min(1.1, camElev + inp.dy * .003));
        const sp = (inp.run ? 9 : 5.5) * dt, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const mx = (fx * inp.mz + rx * inp.mx) * sp, mz = (fz * inp.mz + rz * inp.mx) * sp, f0 = floorAt(pos.x, pos.z);
        if (Math.abs(mx) + Math.abs(mz) > 1e-5) {
          moving = true; sprinting = !!inp.run;
          if (free(pos.x + mx, pos.z, f0)) pos.x += mx;
          if (free(pos.x, pos.z + mz, f0)) pos.z += mz;
          // الشخصية تلف بنعومة لاتجاه المشي
          const want = Math.atan2(mx, mz); let d = want - localRy; d = Math.atan2(Math.sin(d), Math.cos(d));
          localRy += d * (1 - Math.exp(-dt * 12));
        }
        resolve();
      }
      const fy = floorAt(pos.x, pos.z), D = 6.5;
      tourPos.set(pos.x + Math.sin(yaw) * Math.cos(camElev) * D, fy + 1.4 + Math.sin(camElev) * D, pos.z + Math.cos(yaw) * Math.cos(camElev) * D);
      tourPos.x = Math.max(-HX + .4, Math.min(HX - .4, tourPos.x)); tourPos.z = Math.max(-HZ + .4, Math.min(HZ - .4, tourPos.z)); tourPos.y = Math.min(HALL.h - .5, tourPos.y);
      cam.position.lerp(tourPos, 1 - Math.exp(-dt * 8));
      followLook.set(pos.x, fy + 1.3, pos.z); cam.lookAt(followLook);
    } else if (mode === 'tour') {
      tourA += dt * (reduced ? .04 : .075);
      tourPos.set(Math.sin(tourA) * 20, 6.5 + Math.sin(tourA * 2) * 2.2, -2 + Math.cos(tourA) * 32);
      tourLook.set(Math.sin(tourA + 1.2) * 6, 4.2, -18 + Math.cos(tourA) * 6);
      const k = 1 - Math.exp(-dt * 1.6);
      cam.position.lerp(tourPos, k); curLook.lerp(tourLook, k);
      m4.lookAt(cam.position, curLook, cam.up); q0.setFromRotationMatrix(m4); cam.quaternion.slerp(q0, k);
    } else {
      if (inp) {
        yaw -= inp.dx * .0042; pitch = Math.max(-1.15, Math.min(1.15, pitch - inp.dy * .0042));
        const sp = (inp.run ? 11 : 5.5) * dt, fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const mx = (fx * inp.mz + rx * inp.mx) * sp, mz = (fz * inp.mz + rz * inp.mx) * sp, f0 = floorAt(pos.x, pos.z);
        if (free(pos.x + mx, pos.z, f0)) pos.x += mx;
        if (free(pos.x, pos.z + mz, f0)) pos.z += mz;
        resolve();
      }
      eyeY += (floorAt(pos.x, pos.z) + EYE - eyeY) * (1 - Math.exp(-dt * 8));
      cam.position.set(pos.x, eyeY, pos.z); cam.rotation.set(pitch, yaw, 0);
    }
    // قرب اللاعب من باب قسم
    let nowNear = null;
    for (const p of portals) { const dx = cam.position.x - p.x, dz = cam.position.z - p.s.z; if (dx * dx + dz * dz < 26) nowNear = p.s; }
    if (nowNear !== near) { near = nowNear; onSectionNear && onSectionNear(near); }
  }

  // ---------- الحلقة ----------
  const clock = new T.Clock();
  const tickers = new Set(); // دوال تشتغل كل إطار (مثل الشخصيات) قبل الرسم
  let raf = 0, running = true, readyFired = false;
  const pf = { n: 0, s: 0, w: 0, lite: false };
  function perf(raw) {
    // لو الجهاز ما لحق (أقل من 40 إطار/ث) نخفف الدقة ونطفي الظلال مرة وحدة
    if (pf.lite || raw > .5) return; pf.w += raw; if (pf.w < 3) return; pf.n++; pf.s += raw;
    if (pf.s >= 2) { const fps = pf.n / pf.s; pf.n = 0; pf.s = 0; if (fps < 40) { pf.lite = true; dpr = 1; r.setPixelRatio(1); r.setSize(W(), H(), false); sun.castShadow = false; r.shadowMap.enabled = false; scene.traverse(o => [].concat(o.material || []).forEach(m => { m.needsUpdate = true; })); } }
  }
  function tick() {
    const raw = clock.getDelta(), dt = Math.min(raw, .05), t = clock.elapsedTime;
    perf(raw);
    updateCamera(dt);
    // كونفيتي
    for (let i = 0; i < CONF; i++) {
      const j = i * 3; cPos[j + 1] -= cVel[i] * dt; cPos[j] += Math.sin(t * 1.3 + i) * dt * .25;
      if (cPos[j + 1] < .05) cPos[j + 1] = HALL.h - .2;
    }
    confGeo.attributes.position.needsUpdate = true;
    // بالونات الطاولات
    tb.forEach((b, i) => {
      const y = b.y + Math.sin(t * .9 + b.ph) * .13, x = b.x + Math.sin(t * .6 + b.ph) * .06;
      setInst(tableBalloons, i, { x, y, z: b.z, s: b.s, rz: Math.sin(t * .6 + b.ph) * .05 });
      tbStr.set([b.bx, 1.75, b.bz, x, y - .48, b.z], i * 6);
    });
    tableBalloons.instanceMatrix.needsUpdate = true; tbGeo.attributes.position.needsUpdate = true;
    heartsData.forEach((h, i) => setInst(hearts, i, { x: h.x, y: h.y + Math.sin(t * .8 + h.ph) * .25, z: h.z, s: h.s, ry: Math.sin(t * .5 + h.ph) * .5 }));
    hearts.instanceMatrix.needsUpdate = true;
    updateParty(dt, t);
    crystalMat.emissiveIntensity = (.5 + Math.sin(t * 2.2) * .12) * (1 - party * .7);
    chLights.forEach((l, i) => { l.intensity = (200 + Math.sin(t * 1.7 + i) * 12) * (1 - party * .85); });
    flameMat.size = .42 + Math.sin(t * 17) * .04 + Math.sin(t * 29) * .03;
    cakeGlow.intensity = 14 + Math.sin(t * 13) * 2;
    for (const p of portals) { p.tex.offset.y = -t * .04; p.ring.material.opacity = (near === p.s ? .75 : .3) + Math.sin(t * 2.4) * .1; }
    tickers.forEach(fn => fn(dt, t, cam));
    r.render(scene, cam);
    if (!readyFired) { readyFired = true; onReady && onReady(); }
  }
  const loop = () => { if (!running) return; raf = requestAnimationFrame(loop); tick(); };
  loop();

  const ro = new ResizeObserver(() => { r.setSize(W(), H(), false); cam.aspect = W() / H(); cam.updateProjectionMatrix(); });
  ro.observe(el);
  const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); loop(); } };
  document.addEventListener('visibilitychange', onVis);

  function stop() {
    running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
    scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); });
    scene.environment?.dispose();
    r.dispose(); r.domElement.remove();
  }

  return {
    stop, setName, setMode, setParty, setFollow, getLocal, floorAt, scene, camera: cam,
    addTicker: fn => { tickers.add(fn); return () => tickers.delete(fn); },
    get mode() { return mode; }, get party() { return partyTarget === 1; },
  };
}
