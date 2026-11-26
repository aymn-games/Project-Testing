// Stream Starting Soon — 1920x1080 3D scene (Three.js 0.160.0, no build step).
// Everything is a pure function of time t (seconds), so the same file plays live in OBS
// and renders frame-exact to video:  ?capture  → exposes window.__renderAt(t) and no loop.
// URL options: ?once (play one time, hold black)  ?t=12 (start at second 12).
import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const W = 1920, H = 1080, DUR = 26;
const params = new URLSearchParams(location.search);
const CAPTURE = params.has('capture');
const ONCE = params.has('once');
const T0 = parseFloat(params.get('t') || '0') || 0;

const CYAN = new THREE.Color('#35e7ff');
const MAG = new THREE.Color('#ff3ea5');
const VIOLET = new THREE.Color('#6b4dff');

// ---------- time helpers ----------
const clamp01 = x => Math.min(1, Math.max(0, x));
const prog = (t, a, d) => clamp01((t - a) / d);
const outExpo = x => (x >= 1 ? 1 : 1 - Math.pow(2, -10 * x));
const outQuart = x => 1 - Math.pow(1 - x, 4);
const inCubic = x => x * x * x;
const inOutCubic = x => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const outBack = (x, s = 1.6) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
const lerp = (a, b, k) => a + (b - a) * k;
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let r = Math.imul(seed ^ (seed >>> 15), 1 | seed); r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r; return ((r ^ (r >>> 14)) >>> 0) / 4294967296; }; }

// ---------- stage scaling ----------
const stage = document.getElementById('stage');
function fit() { const s = Math.min(innerWidth / W, innerHeight / H); stage.style.transform = `scale(${s}) translate(-50%,-50%)`; }
addEventListener('resize', fit); fit();

// ---------- 2D overlay (HTML) ----------
const $ = id => document.getElementById(id);
const ov = { pill: $('pill'), brand: $('brand'), tag: $('tag'), dot: document.querySelector('#pill i'),
  lineL: document.querySelector('#tag .l'), lineR: document.querySelector('#tag .r'), corners: [...document.querySelectorAll('.cn')] };
function overlay(t) {
  const show = (a, outAt) => Math.min(outExpo(prog(t, a, 0.9)), 1 - inCubic(prog(t, outAt, 0.6)));
  const p = show(7.6, 18.3), b = show(7.8, 18.4), g = show(8.3, 18.2), c = show(1.0, 23.6);
  ov.pill.style.opacity = p; ov.pill.style.transform = `translateX(${(1 - p) * -40}px)`;
  ov.dot.style.opacity = 0.45 + 0.55 * (0.5 + 0.5 * Math.cos(t * Math.PI * 1.6));
  ov.brand.style.opacity = b; ov.brand.style.transform = `translateX(${(1 - b) * 40}px)`;
  ov.tag.style.opacity = g; ov.tag.style.letterSpacing = `${0.5 + (1 - g) * 0.35}em`;
  const ln = outQuart(prog(t, 8.6, 1.2)) * (1 - inCubic(prog(t, 18.0, 0.5)));
  ov.lineL.style.transform = ov.lineR.style.transform = `scaleX(${ln})`;
  ov.corners.forEach((el, i) => { const k = outQuart(prog(t, 1.0 + i * 0.12, 1)) * (1 - inCubic(prog(t, 23.6, 0.8)));
    el.style.opacity = k * 0.9; const sx = el.classList.contains('tl') || el.classList.contains('bl') ? -1 : 1;
    const sy = el.classList.contains('tl') || el.classList.contains('tr') ? -1 : 1;
    el.style.transform = `translate(${sx * (1 - k) * 30}px,${sy * (1 - k) * 30}px)`; });
}

// ---------- 3D ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('fallback').style.display = 'grid';
  console.warn('[starting-soon] WebGL unavailable', e);
  throw e;
}
renderer.setPixelRatio(1);
renderer.setSize(W, H, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
stage.prepend(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#05040f');
scene.fog = new THREE.FogExp2(0x07051a, 0.012);
const camera = new THREE.PerspectiveCamera(35, W / H, 0.1, 400);

const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(renderer), 0.04).texture;

scene.add(new THREE.HemisphereLight(0x6a5cff, 0x080510, 0.8));
const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(6, 10, 12); scene.add(key);
const rimL = new THREE.PointLight(CYAN, 260, 60, 2); rimL.position.set(-11, 4, -5); scene.add(rimL);
const rimR = new THREE.PointLight(MAG, 260, 60, 2); rimR.position.set(11, -1, -5); scene.add(rimR);
const sweep = new THREE.PointLight(0xffffff, 0, 30, 2); scene.add(sweep);

// Sky dome: deep indigo with a faint magenta horizon
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uTime: { value: 0 } },
  vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP; uniform float uTime;
    void main(){ float h = vP.y;
      vec3 top = vec3(.012,.008,.05), mid = vec3(.05,.015,.10), bot = vec3(.004,.004,.015);
      vec3 c = mix(mid, top, smoothstep(0.,.6,h)); c = mix(c, bot, smoothstep(0.,-.35,h));
      c += vec3(.35,.06,.28) * exp(-abs(h+.02)*16.) * .22;
      c += vec3(.05,.25,.35) * pow(max(0.,1.-length(vP.xy-vec2(0.,.12))),6.) * .25;
      gl_FragColor = vec4(c,1.); }`
}));
scene.add(sky);

// Floor: glowing grid that drifts toward camera, with a shockwave ring
const floorMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
  uniforms: { uTime: { value: 0 }, uShock: { value: 0 }, uShockA: { value: 0 }, uFade: { value: 0 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
  fragmentShader: `varying vec3 vW; uniform float uTime, uShock, uShockA, uFade;
    void main(){
      vec2 co = vW.xz*.42 + vec2(0., uTime*.55);
      vec2 g = abs(fract(co-.5)-.5)/fwidth(co);
      float line = 1. - min(min(g.x,g.y), 1.);
      float d = length(vW.xz - vec2(0.,-2.));
      float fall = exp(-d*.075);
      vec3 col = mix(vec3(.21,.9,1.), vec3(1.,.24,.65), smoothstep(-8.,8.,vW.x));
      vec3 c = col*line*fall*.5 + vec3(.25,.12,.6)*exp(-d*.16)*.35;
      float ring = exp(-pow((d-uShock)*.9,2.)) * uShockA;
      c += mix(vec3(.21,.9,1.), vec3(1.), .4) * ring * 1.6;
      gl_FragColor = vec4(c*uFade, 1.); }`
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(220, 220), floorMat);
floor.rotation.x = -Math.PI / 2; floor.position.y = -5.2; scene.add(floor);

// Rising dust (GPU-driven by uTime)
const DUST = 2600;
const dustGeo = new THREE.BufferGeometry();
{ const r = rng(7), pos = new Float32Array(DUST * 3), seed = new Float32Array(DUST * 3);
  for (let i = 0; i < DUST; i++) { pos.set([(r() - .5) * 70, r() * 24 - 6, -40 + r() * 54], i * 3); seed.set([.15 + r() * .6, r() * 6.283, .6 + Math.pow(r(), 3) * 3.2], i * 3); }
  dustGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dustGeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); }
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: { value: 0 }, uFade: { value: 0 } },
  vertexShader: `attribute vec3 aSeed; uniform float uTime; varying float vA; varying float vH;
    void main(){ vec3 p = position; p.y = mod(p.y + 6. + uTime*aSeed.x, 24.) - 6.;
      p.x += sin(uTime*.25 + aSeed.y)*.6; p.z += cos(uTime*.2 + aSeed.y)*.4;
      vec4 mv = modelViewMatrix*vec4(p,1.); gl_Position = projectionMatrix*mv;
      gl_PointSize = aSeed.z * 34. / -mv.z;
      vA = (.35 + .65*(.5+.5*sin(uTime*1.7 + aSeed.y*7.))) * smoothstep(-6.,-3.,p.y) * smoothstep(18.,14.,p.y);
      vH = fract(aSeed.y*3.1); }`,
  fragmentShader: `varying float vA; varying float vH; uniform float uFade;
    void main(){ float d = length(gl_PointCoord-.5); float a = smoothstep(.5,0.,d);
      vec3 c = vH < .45 ? vec3(.3,.9,1.) : (vH < .8 ? vec3(1.,.35,.7) : vec3(1.));
      gl_FragColor = vec4(c, a*a*vA*.75*uFade); }`
});
scene.add(new THREE.Points(dustGeo, dustMat));

// Floating crystals (one instanced draw call)
const CRY = 64;
const cryMat = new THREE.MeshStandardMaterial({ color: 0x1c1840, metalness: .85, roughness: .22, flatShading: true, emissive: 0x120a30 });
const crystals = new THREE.InstancedMesh(new THREE.OctahedronGeometry(1, 0), cryMat, CRY);
const cryData = []; { const r = rng(21);
  for (let i = 0; i < CRY; i++) { const ang = r() * Math.PI * 2, rad = 11 + r() * 22;
    let y = -3 + r() * 13; if (rad < 16 && Math.abs(Math.sin(ang)) > .3) y += 6;
    cryData.push({ ang, rad, y, s: .18 + Math.pow(r(), 2) * .9, sp: (r() < .5 ? -1 : 1) * (.02 + r() * .04), rx: r() * 2, ry: r() * 2, ph: r() * 6.28, d: r() * 1.6 }); } }
scene.add(crystals);
const dummy = new THREE.Object3D();

// Halo rings + HUD arcs behind the title
const halo = new THREE.Group(); halo.position.set(0, .3, -2.2); scene.add(halo);
const glowMat = (c, o = 1) => new THREE.MeshBasicMaterial({ color: c.clone().multiplyScalar(1.5), transparent: true, opacity: o, toneMapped: false, depthWrite: false });
const rings = [
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(7.3, .045, 12, 220), glowMat(new THREE.Color('#bfe9ff'))), at: 1.3 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(8.4, .03, 10, 220), glowMat(CYAN)), at: 1.7 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(9.3, .03, 10, 220), glowMat(MAG)), at: 2.1 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(7.9, .09, 10, 160, Math.PI * .55), glowMat(CYAN, .9)), at: 2.6 },
  { mesh: new THREE.Mesh(new THREE.TorusGeometry(7.9, .09, 10, 160, Math.PI * .3), glowMat(MAG, .9)), at: 2.8 },
];
rings.forEach(r => halo.add(r.mesh));
// tick marks around the inner halo (instanced)
const TICKS = 120;
const ticks = new THREE.InstancedMesh(new THREE.BoxGeometry(.03, .28, .03), glowMat(new THREE.Color('#9fb4ff'), .7), TICKS);
for (let i = 0; i < TICKS; i++) { const a = i / TICKS * Math.PI * 2, L = i % 10 === 0 ? 1.8 : 1; dummy.position.set(Math.cos(a) * 6.75, Math.sin(a) * 6.75, 0); dummy.rotation.set(0, 0, a - Math.PI / 2); dummy.scale.set(1, L, 1); dummy.updateMatrix(); ticks.setMatrixAt(i, dummy.matrix); }
halo.add(ticks);
// shockwave disc in the halo plane
const shock = new THREE.Mesh(new THREE.RingGeometry(.96, 1, 128), glowMat(new THREE.Color('#ffffff'), 0)); halo.add(shock);

// ---------- 3D title ----------
const letters = [];
async function buildTitle() {
  const font = await new Promise((res, rej) => new FontLoader().load('unbounded-800.typeface.json', res, undefined, rej));
  const lines = [
    { text: 'STREAM STARTING', size: 1.02, y: 2.55, depth: .34, start: 4.2, stag: .05, dur: 1.25, out: 18.55, ostag: .03 },
    { text: 'SOON', size: 3.1, y: -1.75, depth: .9, start: 5.55, stag: .14, dur: 1.35, out: 18.85, ostag: .08 },
  ];
  const r = rng(99);
  lines.forEach((L, li) => {
    let x = 0; const items = [];
    for (const ch of L.text) {
      const g = font.data.glyphs[ch]; const adv = g.ha * L.size / font.data.resolution;
      if (ch !== ' ') items.push({ ch, x }); x += adv * (li === 0 ? 1.06 : 1.02);
    }
    const total = x, n = items.length;
    items.forEach((it, i) => {
      const geo = new TextGeometry(it.ch, { font, size: L.size, height: L.depth, curveSegments: 8, bevelEnabled: true,
        bevelThickness: L.size * .05, bevelSize: L.size * .028, bevelSegments: 4 });
      geo.computeBoundingBox(); const bb = geo.boundingBox; const cx = (bb.min.x + bb.max.x) / 2, cy = (bb.min.y + bb.max.y) / 2, cz = (bb.min.z + bb.max.z) / 2;
      geo.translate(-cx, -cy, -cz);
      const k = n > 1 ? i / (n - 1) : 0;
      const sideCol = li === 0 ? CYAN.clone().lerp(VIOLET, k * .6) : CYAN.clone().lerp(MAG, .25 + k * .75);
      const face = new THREE.MeshStandardMaterial({ color: 0xc6cdf5, metalness: 1, roughness: li === 0 ? .26 : .2, envMapIntensity: .95, transparent: true });
      const side = new THREE.MeshStandardMaterial({ color: sideCol.clone().multiplyScalar(.35), metalness: .7, roughness: .3, emissive: sideCol, emissiveIntensity: li === 0 ? .9 : 1.25, transparent: true });
      const m = new THREE.Mesh(geo, [face, side]);
      const base = new THREE.Vector3(it.x - total / 2 + cx, L.y + cy - L.size * .36, 0);
      m.position.copy(base); scene.add(m);
      letters.push({ m, mats: [face, side], base, inAt: L.start + i * L.stag, inDur: L.dur, outAt: L.out + (n - 1 - Math.abs(i - (n - 1) / 2) * 2) * 0 + i * L.ostag, idx: letters.length,
        rs: { y: (r() - .5) * 6, x: (r() - .5) * 9, rx: (r() - .5) * 2.4, ry: (r() < .5 ? -1 : 1) * (2.2 + r() * 1.5), rz: (r() - .5) * 1.4, ox: (r() - .5) * 10, oy: 3 + r() * 6, orx: (r() - .5) * 5, ory: (r() - .5) * 5 } });
    });
  });
}

function updateTitle(t) {
  for (const L of letters) {
    const p = prog(t, L.inAt, L.inDur), e = outExpo(p), q = outQuart(p);
    const o = prog(t, L.outAt, 1.05), oe = inCubic(o);
    const m = L.m;
    m.visible = p > 0 && o < 1;
    if (!m.visible) continue;
    const float = Math.sin(t * 1.1 + L.idx * .45) * .05 * q;
    m.position.set(
      L.base.x + (1 - e) * L.rs.x + oe * L.rs.ox,
      L.base.y + (1 - e) * L.rs.y + float + oe * L.rs.oy,
      (1 - q) * -26 + oe * 14);
    m.rotation.set((1 - e) * L.rs.rx + oe * L.rs.orx, (1 - e) * L.rs.ry + oe * L.rs.ory + Math.sin(t * .6 + L.idx) * .03 * q, (1 - e) * L.rs.rz);
    const s = lerp(.55, 1, outBack(clamp01(p * 1.15), 1.2)) * (1 - oe * .3);
    m.scale.setScalar(Math.max(.001, s));
    const a = clamp01(p * 2.2) * (1 - clamp01(o * 1.4));
    L.mats.forEach(mt => { mt.opacity = a; mt.depthWrite = a > .98; });
  }
}

// ---------- camera path ----------
const camPos = new THREE.Vector3(), look = new THREE.Vector3();
function cameraAt(t) {
  if (t < 6.6) {
    const e = inOutCubic(t / 6.6);
    camPos.set(Math.sin(e * Math.PI) * -3.2, lerp(7.5, .6, e), lerp(48, 19, e));
    look.set(0, lerp(2.5, .3, e), 0);
  } else if (t < 20.6) {
    const u = (t - 6.6) / 14, ramp = inOutCubic(clamp01(u / .2));
    const ang = Math.sin(u * Math.PI * 2) * .17 * ramp, R = 19 - u * 1.4;
    camPos.set(Math.sin(ang) * R, .6 + Math.sin(u * Math.PI) * .7, Math.cos(ang) * R);
    look.set(0, .3, 0);
  } else {
    const e = inCubic(clamp01((t - 20.6) / 3.6)), R = 17.6;
    camPos.set(0, lerp(.6, .1, e), lerp(R, -14, e));
    look.set(0, lerp(.3, .1, e), lerp(0, -60, e));
  }
  camera.position.copy(camPos); camera.lookAt(look);
  camera.fov = 35 + inCubic(clamp01((t - 21.5) / 2.6)) * 22; camera.updateProjectionMatrix();
}

// ---------- post ----------
const composer = new EffectComposer(renderer);
composer.setPixelRatio(1); composer.setSize(W, H);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), .55, .32, .92); composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFade: { value: 0 }, uFlash: { value: 0 }, uCA: { value: .0015 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uFade, uFlash, uCA; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
    void main(){ vec2 d = vUv-.5; vec2 off = d*uCA*length(d)*8.;
      vec3 c = vec3(texture2D(tDiffuse, vUv+off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv-off).b);
      float v = smoothstep(.95,.25,length(d*vec2(1.,.82))); c *= mix(.5,1.,v);
      c += (h(vUv*vec2(1920.,1080.)+fract(uTime*7.)*91.)-.5)*.03;
      c = mix(c, vec3(1.,.97,1.), uFlash); c *= uFade;
      gl_FragColor = vec4(c,1.); }`
});
composer.addPass(grade);

// ---------- master render ----------
function renderAt(t) {
  t = Math.max(0, Math.min(DUR, t));
  const fade = outQuart(prog(t, 0, 1.4)) * (1 - inOutCubic(prog(t, 24.3, 1.5)));
  cameraAt(t);

  // halo rings
  rings.forEach((R, i) => {
    const p = prog(t, R.at, 1.3), s = Math.max(.001, outBack(p, 1.4)) * (1 + inCubic(prog(t, 21.2, 2.4)) * .4);
    R.mesh.scale.setScalar(s); R.mesh.material.opacity = (i > 2 ? .9 : 1) * clamp01(p * 2);
  });
  rings[0].mesh.rotation.set(0, 0, t * .05);
  rings[1].mesh.rotation.set(1.42 + Math.sin(t * .35) * .04, 0, .14 + Math.sin(t * .27) * .05);
  rings[2].mesh.rotation.set(1.34 + Math.cos(t * .3) * .04, 0, -.2 + Math.cos(t * .23) * .05);
  rings[3].mesh.rotation.set(0, 0, t * .55);
  rings[4].mesh.rotation.set(0, 0, -t * .42 + 2);
  const tp = outQuart(prog(t, 2.2, 1.6)); ticks.scale.setScalar(Math.max(.001, tp)); ticks.material.opacity = .7 * tp; ticks.rotation.z = -t * .06;
  halo.rotation.set(Math.sin(t * .2) * .05, Math.sin(t * .17) * .08, 0); halo.scale.setScalar(.9);

  // shockwave when "SOON" lands
  const sw = prog(t, 7.05, 2.2);
  floorMat.uniforms.uShock.value = outExpo(sw) * 40; floorMat.uniforms.uShockA.value = sw > 0 ? (1 - sw) : 0;
  shock.scale.setScalar(.1 + outExpo(sw) * 18); shock.material.opacity = sw > 0 ? Math.pow(1 - sw, 2) * .9 : 0;

  // crystals
  crystals.visible = t > 1.5;
  cryData.forEach((c, i) => {
    const s = outBack(prog(t, 2.2 + c.d, 1.4), 1.3) * c.s, a = c.ang + t * c.sp;
    dummy.position.set(Math.cos(a) * c.rad, c.y + Math.sin(t * .5 + c.ph) * .5, Math.sin(a) * c.rad - 6);
    dummy.rotation.set(c.rx + t * .25, c.ry + t * .35 * Math.sign(c.sp), 0);
    dummy.scale.set(s * .7, Math.max(.001, s * 1.3), s * .7); dummy.updateMatrix(); crystals.setMatrixAt(i, dummy.matrix);
  });
  crystals.instanceMatrix.needsUpdate = true;

  // lights: specular sweep across the title every 4.5s while it holds
  const sp = (t - 7.4) % 4.5 / 4.5, on = t > 7.4 && t < 18.6 ? Math.sin(sp * Math.PI) : 0;
  sweep.position.set(lerp(-16, 16, sp), 1.2, 4); sweep.intensity = 420 * on;
  rimL.intensity = 260 + Math.sin(t * .9) * 60; rimR.intensity = 260 + Math.cos(t * .8) * 60;

  updateTitle(t);

  sky.material.uniforms.uTime.value = t;
  floorMat.uniforms.uTime.value = t; floorMat.uniforms.uFade.value = outQuart(prog(t, .4, 2));
  dustMat.uniforms.uTime.value = t; dustMat.uniforms.uFade.value = outQuart(prog(t, .2, 2.5));

  // bloom breathes with key beats; flash on the fly-through
  const fly = prog(t, 22.4, 1.6);
  bloom.strength = .55 + (sw > 0 ? (1 - sw) * .35 : 0) + inCubic(fly) * 1.1;
  grade.uniforms.uTime.value = t; grade.uniforms.uFade.value = fade;
  grade.uniforms.uFlash.value = Math.sin(clamp01((t - 23.4) / 1.0) * Math.PI) * .55;
  grade.uniforms.uCA.value = .0015 + inCubic(fly) * .01;

  overlay(t);
  composer.render();
}

// ---------- boot ----------
const ready = (async () => {
  try { await document.fonts.ready; await buildTitle(); }
  catch (e) { console.error('[starting-soon] title failed', e); }
})();

if (CAPTURE) {
  window.__ready = ready.then(() => { renderAt(0); return true; });
  window.__renderAt = t => renderAt(t);
  window.__duration = DUR;
} else {
  ready.then(() => {
    const start = performance.now() - T0 * 1000;
    const loop = () => {
      let t = (performance.now() - start) / 1000;
      if (ONCE && t >= DUR) { renderAt(DUR); return; }
      renderAt(t % DUR);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
}
