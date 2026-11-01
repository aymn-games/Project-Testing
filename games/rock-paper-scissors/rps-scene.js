/**
 * «حجرة ورقة مقص» — مشهد البث ثلاثي الأبعاد (Three.js 0.160).
 *
 * ساحة بطولة بالليل: أرضية LED دائرية، مدرجات بإضاءة نيون، أبراج كشافات،
 * ومجسمات حجرة وورقة ومقص عملاقة تطفو فوق الساحة. اللاعبين شخصيات حفلة
 * الميلاد نفسها (games/birthday-party/rig3d.js — نستوردها بدون تعديل)،
 * وشكل كل لاعب ثابت من رقم مشتق من id حسابه.
 *
 * المشهد عرض بس: الشاشة (game.html) تمسك القواعد والوقت وترسل الحالة:
 *   setState({ phase, players: [{ id, name, avatarUrl, place, pose, pick, bubble, badge }] })
 *   place = { kind: 'grid'|'duel'|'bye'|'ring'|'podium', i, n, side }
 *     grid: فترة الدخول · duel: المواجهة رقم i من n، side 0/1 · bye: تأهل مباشر
 *     ring: خرج وصار متفرج حول الساحة · podium: البطل
 *   pose = 'idle'|'wave'|'ready'|'shake'|'reveal'|'win'|'lose'|'clap'|'dance'
 *   pick = 1/2/3 (يظهر المجسم بيده وقت reveal) · bubble = {text, color} · badge = {text, color}
 * createArena(container) ← { ready: Promise, setState, stop }
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { makeRig, loadClips } from '../birthday-party/rig3d.js';
import { resolveLook } from '../birthday-party/crowd-common.js';

const T = THREE, TAU = Math.PI * 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const backOut = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const FONT = '"Zain", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
export const PICK_COLOR = { 1: '#ff9a3c', 2: '#36d6ff', 3: '#ff4fd8' };
const REDUCED = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// رقم ثابت لكل لاعب من id حسابه (نفس الشخص = نفس الشكل كل مباراة)
function idNum(id) { let h = 2166136261; const s = String(id); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0) % 1000003; }

function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4;
    return t;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ================================================================ المجسمات الثلاث
// كل مجسم Group حجمه ~1 وحدة؛ بيد الشخصية يتصغّر، وفوق الساحة يتكبّر.
const propMats = {};
function pm(key, make) { return propMats[key] || (propMats[key] = make()); }
function buildRock() {
    const g = new T.Group();
    const geo = new T.IcosahedronGeometry(.5, 1); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + Math.sin(p.getX(i) * 9.1 + p.getY(i) * 5.3) * .08 + Math.cos(p.getZ(i) * 7.7) * .07; p.setXYZ(i, p.getX(i) * k * 1.08, p.getY(i) * k * .86, p.getZ(i) * k); }
    geo.computeVertexNormals();
    g.add(new T.Mesh(geo, pm('rock', () => new T.MeshStandardMaterial({ color: '#8d8478', roughness: .82, flatShading: true }))));
    const vein = new T.Mesh(new T.TorusGeometry(.47, .025, 6, 40), pm('rockGlow', () => new T.MeshBasicMaterial({ color: PICK_COLOR[1] })));
    vein.rotation.set(1.2, .3, 0); vein.scale.set(1.05, .85, 1); g.add(vein);
    return g;
}
function buildPaper() {
    const g = new T.Group();
    const tex = pm('paperTex', () => canvasTex(256, 320, (ctx, W, H) => {
        ctx.fillStyle = '#fbfdff'; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = '#9cc9ff'; ctx.lineWidth = 3; for (let y = 52; y < H; y += 30) { ctx.beginPath(); ctx.moveTo(14, y); ctx.lineTo(W - 14, y); ctx.stroke(); }
        ctx.strokeStyle = '#ff8aa0'; ctx.beginPath(); ctx.moveTo(48, 0); ctx.lineTo(48, H); ctx.stroke();
    }));
    const geo = new T.PlaneGeometry(.78, .98, 8, 8); const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 3.2) * .05 + Math.sin(p.getY(i) * 2.4) * .03);
    geo.computeVertexNormals();
    g.add(new T.Mesh(geo, pm('paper', () => new T.MeshStandardMaterial({ map: tex, roughness: .7, side: T.DoubleSide }))));
    const frame = new T.LineSegments(new T.EdgesGeometry(new T.PlaneGeometry(.8, 1)), pm('paperGlow', () => new T.LineBasicMaterial({ color: PICK_COLOR[2] })));
    g.add(frame);
    return g;
}
function buildScissors() {
    const g = new T.Group();
    const steel = pm('steel', () => new T.MeshStandardMaterial({ color: '#e6ebf2', metalness: .9, roughness: .22 }));
    const handle = pm('handle', () => new T.MeshStandardMaterial({ color: PICK_COLOR[3], emissive: PICK_COLOR[3], emissiveIntensity: .55, roughness: .4 }));
    for (const s of [1, -1]) {
        const arm = new T.Group(); arm.rotation.z = s * .32;
        const bladeGeo = new T.CylinderGeometry(.012, .06, .62, 4, 1); bladeGeo.translate(0, .31, 0); bladeGeo.scale(1, 1, .35);
        arm.add(new T.Mesh(bladeGeo, steel));
        const ring = new T.Mesh(new T.TorusGeometry(.1, .03, 8, 24), handle); ring.position.y = -.17; arm.add(ring);
        const neck = new T.Mesh(new T.CylinderGeometry(.025, .03, .08, 6), handle); neck.position.y = -.05; arm.add(neck);
        g.add(arm);
    }
    const pin = new T.Mesh(new T.SphereGeometry(.035, 10, 8), steel); pin.position.z = .02; g.add(pin);
    g.position.y = -.05;
    const wrap = new T.Group(); wrap.add(g); return wrap;
}
const BUILDERS = { 1: buildRock, 2: buildPaper, 3: buildScissors };

// ================================================================ اللافتات (اسم + صورة)
function makeSprite(w, h, scaleY) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 10; sp.userData = { c, tex, key: '' };
    sp.scale.set(scaleY * w / h, scaleY, 1);
    return sp;
}
const avatarCache = new Map();
function loadAvatar(url) {
    if (!url) return null;
    if (avatarCache.has(url)) return avatarCache.get(url);
    const rec = { img: null, done: false, cbs: [] };
    const img = new Image(); img.crossOrigin = 'anonymous'; img.decoding = 'async';
    img.onload = () => { rec.img = img; rec.done = true; rec.cbs.splice(0).forEach(f => f()); };
    img.onerror = () => { rec.done = true; rec.cbs.splice(0).forEach(f => f()); };
    img.src = url; avatarCache.set(url, rec); return rec;
}
function initial(name) { return (Array.from(String(name || '').replace(/[\s_.@\d]/g, ''))[0] || '؟').toUpperCase(); }
function drawTag(sp, o) {
    const av = loadAvatar(o.avatarUrl);
    const key = o.name + '|' + o.ring + '|' + o.dim + '|' + (av && av.img ? 1 : 0);
    if (sp.userData.key === key) return; sp.userData.key = key;
    if (av && !av.done) av.cbs.push(() => { sp.userData.key = ''; drawTag(sp, o); });
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '800 46px ' + FONT; ctx.direction = 'rtl';
    const name = o.name.length > 16 ? o.name.slice(0, 15) + '…' : o.name;
    const tw = Math.min(360, ctx.measureText(name).width), bw = tw + 112, x = (W - bw) / 2, y = 14, h = 76;
    ctx.globalAlpha = o.dim ? .55 : 1;
    roundRect(ctx, x, y, bw, h, 38); ctx.fillStyle = 'rgba(12,10,28,.84)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = o.ring || 'rgba(255,255,255,.22)'; ctx.stroke();
    // الصورة يسار الاسم (نفس لافتات البث)
    const cx = x + 40, cy = y + h / 2, r = 28;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.closePath(); ctx.clip();
    if (av && av.img) { try { ctx.drawImage(av.img, cx - r, cy - r, r * 2, r * 2); } catch (e) { /* صورة بدون CORS */ } }
    else { ctx.fillStyle = '#5b54d6'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.fillStyle = '#fff'; ctx.font = '900 30px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initial(o.name), cx, cy + 2); }
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke();
    ctx.font = '800 46px ' + FONT; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
    ctx.fillText(name, x + bw - 22, y + h / 2 + 3, tw);
    ctx.globalAlpha = 1; tex.needsUpdate = true;
}
function drawPill(sp, o) {
    const key = o ? o.text + '|' + o.color : '';
    if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    if (o) {
        ctx.font = '900 64px ' + FONT; ctx.direction = 'rtl';
        const tw = Math.min(W - 60, ctx.measureText(o.text).width), bw = tw + 64, x = (W - bw) / 2;
        roundRect(ctx, x, 12, bw, H - 24, (H - 24) / 2);
        const g = ctx.createLinearGradient(0, 12, 0, H - 12); g.addColorStop(0, o.color); g.addColorStop(1, shade(o.color, -.35));
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 6; ctx.fillText(o.text, W / 2, H / 2 + 4, tw); ctx.shadowBlur = 0;
    }
    sp.visible = !!o; tex.needsUpdate = true;
}
function shade(hex, k) { const c = new T.Color(hex); const hsl = {}; c.getHSL(hsl); c.setHSL(hsl.h, hsl.s, clamp01(hsl.l + k * hsl.l)); return '#' + c.getHexString(); }

// ================================================================ المشهد
export function createArena(container, opts = {}) {
    const clipsBase = opts.clipsBase || '../birthday-party/anims/';
    loadClips(clipsBase).catch(() => null); // الحركات المسجّلة (وقوف/مشي/سامبا)؛ لو فشلت تبقى المكتوبة بالكود

    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    renderer.outputColorSpace = T.SRGBColorSpace;
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);

    const scene = new T.Scene();
    scene.background = canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#05030f'); gr.addColorStop(.55, '#140a33'); gr.addColorStop(1, '#2a0f45'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    scene.fog = new T.Fog('#12082a', 34, 90);
    const camera = new T.PerspectiveCamera(40, 16 / 9, .1, 260);
    camera.position.set(0, 14, 26);

    // ---------- إضاءة: سماء + شمس ناعمة + إضاءة ملوّنة من الأطراف
    scene.add(new T.HemisphereLight('#c9bcff', '#2a1446', 1.4));
    const key = new T.DirectionalLight('#fff3e6', 1.6); key.position.set(6, 20, 14); scene.add(key);
    const rimA = new T.DirectionalLight('#ff4fd8', .9); rimA.position.set(-16, 8, -12); scene.add(rimA);
    const rimB = new T.DirectionalLight('#36d6ff', .9); rimB.position.set(16, 8, -12); scene.add(rimB);

    // ---------- الأرضية: LED دائرية بحلقات وشبكة سداسية
    const R = 17;
    const floorTex = canvasTex(1024, 1024, (ctx, W, H) => {
        const cx = W / 2, cy = H / 2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W / 2); g.addColorStop(0, '#2a1b55'); g.addColorStop(.7, '#160d33'); g.addColorStop(1, '#0b0620');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.strokeStyle = 'rgba(160,140,255,.10)'; ctx.lineWidth = 2;
        const s = 26; for (let y = 0; y < H + s; y += s * 1.5) for (let x = 0; x < W + s; x += s * Math.sqrt(3)) {
            const ox = ((y / (s * 1.5)) % 2) * s * Math.sqrt(3) / 2; ctx.beginPath();
            for (let k = 0; k < 6; k++) { const a = k / 6 * TAU + Math.PI / 6; ctx.lineTo(x + ox + Math.cos(a) * s * .9, y + Math.sin(a) * s * .9); }
            ctx.closePath(); ctx.stroke();
        }
    });
    const glowTex = canvasTex(1024, 1024, (ctx, W, H) => {
        const cx = W / 2, cy = H / 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const ring = (r, w, c, dash) => { ctx.setLineDash(dash || []); ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); };
        ring(500, 10, '#a855f7'); ring(470, 3, '#36d6ff', [18, 14]); ring(150, 6, '#ff4fd8'); ring(120, 2, '#ffffff', [6, 10]);
        for (let k = 0; k < 3; k++) { const a = k / 3 * TAU - Math.PI / 2; ctx.fillStyle = Object.values(PICK_COLOR)[k]; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 470, cy + Math.sin(a) * 470, 14, 0, TAU); ctx.fill(); }
        ctx.setLineDash([]);
    });
    const floorMat = new T.MeshStandardMaterial({ map: floorTex, emissiveMap: glowTex, emissive: '#ffffff', emissiveIntensity: 1.1, roughness: .32, metalness: .45 });
    const floor = new T.Mesh(new T.CylinderGeometry(R, R + .4, .5, 96), [new T.MeshStandardMaterial({ color: '#1a0f35', emissive: '#7c3aed', emissiveIntensity: .35, roughness: .4, metalness: .6 }), floorMat, floorMat]);
    floor.position.y = -.25; scene.add(floor);
    const edgeRing = new T.Mesh(new T.TorusGeometry(R + .25, .09, 8, 160), new T.MeshBasicMaterial({ color: '#c084fc' }));
    edgeRing.rotation.x = Math.PI / 2; edgeRing.position.y = .01; scene.add(edgeRing);
    const ground = new T.Mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ color: '#0a0618', roughness: .9 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.5; scene.add(ground);

    // ---------- المدرجات: درجات دائرية خلف الساحة بخطوط نيون، وجمهور بسيط (InstancedMesh)
    const stands = new T.Group(); scene.add(stands);
    const tierM = new T.MeshStandardMaterial({ color: '#1b1238', roughness: .75, metalness: .2, side: T.DoubleSide });
    const ledCols = ['#a855f7', '#36d6ff', '#ff4fd8', '#ff9a3c'];
    for (let i = 0; i < 6; i++) {
        const r = R + 4 + i * 1.6, y = .4 + i * 1.05;
        const tier = new T.Mesh(new T.CylinderGeometry(r + 1.6, r + 1.6, 1.05, 96, 1, true, Math.PI * .08, Math.PI * 1.84), tierM);
        tier.position.y = y; tier.rotation.y = Math.PI; stands.add(tier);
        const top = new T.Mesh(new T.RingGeometry(r, r + 1.6, 96, 1, Math.PI * .08 + Math.PI, Math.PI * 1.84), tierM);
        top.rotation.x = -Math.PI / 2; top.rotation.z = 0; top.position.y = y + .53; stands.add(top);
        if (i % 2 === 0) {
            const led = new T.Mesh(new T.TorusGeometry(r + .02, .05, 6, 160, Math.PI * 1.84), new T.MeshBasicMaterial({ color: ledCols[(i / 2) % ledCols.length] }));
            led.rotation.x = Math.PI / 2; led.rotation.z = Math.PI * .08 + Math.PI; led.position.y = y + .55; stands.add(led);
        }
    }
    // جمهور خلفي: كبسولات ملوّنة تنط مع الإيقاع (أمر رسم واحد)
    const fanGeo = new T.CapsuleGeometry(.22, .5, 3, 8); fanGeo.translate(0, .5, 0);
    const FANS = 420, fans = new T.InstancedMesh(fanGeo, new T.MeshStandardMaterial({ roughness: .7 }), FANS);
    const fanData = []; const m4 = new T.Matrix4(), q4 = new T.Quaternion(), s4 = new T.Vector3(1, 1, 1), p4 = new T.Vector3(), col = new T.Color();
    for (let i = 0; i < FANS; i++) {
        const tier = i % 6, r = R + 4.8 + tier * 1.6, a = Math.PI * .08 + Math.PI + Math.random() * Math.PI * 1.84, y = .93 + tier * 1.05;
        fanData.push({ x: -Math.cos(a) * r, z: Math.sin(a) * r, y, ph: Math.random() * TAU, sp: 1.5 + Math.random() * 2 });
        col.setHSL(Math.random(), .55, .45 + Math.random() * .15); fans.setColorAt(i, col);
    }
    stands.add(fans);

    // ---------- أبراج الكشافات وأشعة ضوء متحركة (وهمية: مخروط شفاف، بدون إضاءة حقيقية)
    const beamTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const beamGeo = new T.CylinderGeometry(.2, 2.2, 21, 24, 1, true); beamGeo.translate(0, -10.5, 0);
    const beams = [];
    const towerM = new T.MeshStandardMaterial({ color: '#241a44', metalness: .7, roughness: .35 });
    for (let i = 0; i < 6; i++) {
        const a = Math.PI * (.15 + i * .14) + Math.PI, r = R + 12;
        const x = -Math.cos(a) * r, z = Math.sin(a) * r;
        const tower = new T.Mesh(new T.CylinderGeometry(.3, .5, 16, 8), towerM); tower.position.set(x, 8, z); scene.add(tower);
        const head = new T.Mesh(new T.BoxGeometry(1.6, .9, .9), new T.MeshStandardMaterial({ color: '#ffffff', emissive: ledCols[i % 4], emissiveIntensity: 2.2 }));
        head.position.set(x, 16.3, z); head.lookAt(0, 0, 0); scene.add(head);
        const beam = new T.Mesh(beamGeo, new T.MeshBasicMaterial({ color: ledCols[i % 4], map: beamTex, transparent: true, opacity: .2, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        beam.position.set(x, 16.3, z); scene.add(beam);
        beams.push({ beam, x, z, ph: i * 1.3 });
    }

    // ---------- مجسمات عملاقة تطفو فوق الساحة (هوية اللعبة)
    const giants = [];
    for (let k = 1; k <= 3; k++) {
        const g = BUILDERS[k](); g.scale.setScalar(3.4);
        g.position.set((k - 2) * 9, 11 + (k === 2 ? 1.4 : 0), -R - 6); scene.add(g);
        const halo = new T.Mesh(new T.RingGeometry(2.3, 2.5, 64), new T.MeshBasicMaterial({ color: PICK_COLOR[k], transparent: true, opacity: .85, side: T.DoubleSide }));
        halo.position.copy(g.position); scene.add(halo);
        giants.push({ g, halo, ph: k * 2.1 });
    }

    // ---------- منصة تحت كل مواجهة: حلقة مضيئة و«VS» على الأرض (pool)
    const vsTex = canvasTex(256, 128, (ctx, W, H) => { ctx.font = '900 96px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ffffff'; ctx.shadowColor = '#a855f7'; ctx.shadowBlur = 18; ctx.fillText('VS', W / 2, H / 2 + 6); });
    const padRingGeo = new T.RingGeometry(1.32, 1.46, 64); padRingGeo.rotateX(-Math.PI / 2);
    const padDiscGeo = new T.CircleGeometry(1.32, 48); padDiscGeo.rotateX(-Math.PI / 2);
    const vsGeo = new T.PlaneGeometry(.9, .45); vsGeo.rotateX(-Math.PI / 2);
    const pads = Array.from({ length: 32 }, () => {
        const g = new T.Group(); g.visible = false; scene.add(g);
        const ring = new T.Mesh(padRingGeo, new T.MeshBasicMaterial({ color: '#a855f7', transparent: true, opacity: .9, blending: T.AdditiveBlending, depthWrite: false }));
        const disc = new T.Mesh(padDiscGeo, new T.MeshBasicMaterial({ color: '#2b1660', transparent: true, opacity: .55, depthWrite: false }));
        const vs = new T.Mesh(vsGeo, new T.MeshBasicMaterial({ map: vsTex, transparent: true, depthWrite: false }));
        ring.position.y = .025; disc.position.y = .02; vs.position.set(0, .03, .55);
        g.add(disc, ring, vs); return { g, ring, w: 0 };
    });
    let padList = []; // [{x, z, live}]

    // ---------- منصة البطل (تطلع من الأرض)
    const podium = new T.Group(); podium.position.y = -1.4; scene.add(podium);
    const podGold = new T.MeshStandardMaterial({ color: '#f5c542', metalness: .85, roughness: .25, emissive: '#7a4b00', emissiveIntensity: .35 });
    const pod1 = new T.Mesh(new T.CylinderGeometry(1.25, 1.45, .9, 48), podGold); pod1.position.y = .45; podium.add(pod1);
    const podRing = new T.Mesh(new T.TorusGeometry(1.3, .06, 8, 64), new T.MeshBasicMaterial({ color: '#ffe08a' })); podRing.rotation.x = Math.PI / 2; podRing.position.y = .91; podium.add(podRing);
    const PODIUM_TOP = .9;

    // ---------- ظل ناعم تحت كل شخصية (InstancedMesh واحد)
    const CAP = 80;
    const blobTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
    const blobGeo = new T.PlaneGeometry(1, 1); blobGeo.rotateX(-Math.PI / 2);
    const blobs = new T.InstancedMesh(blobGeo, new T.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false }), CAP);
    blobs.frustumCulled = false; blobs.instanceMatrix.setUsage(T.DynamicDrawUsage); scene.add(blobs);
    const ZERO = new T.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < CAP; i++) blobs.setMatrixAt(i, ZERO);
    const freeSlots = Array.from({ length: CAP }, (_, i) => CAP - 1 - i);

    // ---------- حلقات ضوء تحت أقدام الفائزين (pool) + كونفيتي البطل
    const flashGeo = new T.RingGeometry(.3, .55, 40); flashGeo.rotateX(-Math.PI / 2);
    const flashes = Array.from({ length: 40 }, () => { const m = new T.Mesh(flashGeo, new T.MeshBasicMaterial({ color: '#ffe08a', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 9 }; });
    function flashAt(x, y, z, color) { const f = flashes.find(f => f.t >= 1) || flashes[0]; f.t = 0; f.m.position.set(x, y + .03, z); f.m.material.color.set(color); f.m.visible = true; }
    const CONF = 360, confGeo = new T.PlaneGeometry(.12, .2);
    const confetti = new T.InstancedMesh(confGeo, new T.MeshBasicMaterial({ side: T.DoubleSide }), CONF);
    confetti.frustumCulled = false; confetti.visible = false; scene.add(confetti);
    const confData = Array.from({ length: CONF }, (_, i) => { col.setHSL(Math.random(), .9, .6); confetti.setColorAt(i, col); return { p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3() }; });
    let confT = -1;
    function startConfetti(cx, cz) {
        confT = 0; confetti.visible = true;
        for (const d of confData) { d.p.set(cx + (Math.random() - .5) * 10, 9 + Math.random() * 6, cz + (Math.random() - .5) * 8); d.v.set((Math.random() - .5) * .8, -1.2 - Math.random() * 1.2, (Math.random() - .5) * .8); d.r.set(Math.random() * TAU, Math.random() * TAU, 0); d.w.set(Math.random() * 6, Math.random() * 6, Math.random() * 3); }
    }

    // ---------- المعالجة اللاحقة: توهّج (Bloom). لو فشلت نرسم عادي.
    let composer = null, bloom = null;
    try {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloom = new UnrealBloomPass(new T.Vector2(512, 512), .55, .5, .9); composer.addPass(bloom);
        composer.addPass(new OutputPass());
    } catch (e) { composer = null; }

    // ================================================================ الشخصيات
    const chars = new Map(); // id → {rig, slot, pos, target, ry, tRy, tag, bubble, badge, prop, pick, pose, place, ...}
    let phase = 'join', phaseAt = 0, now = 0;

    function placeOf(p, all) {
        const pl = p.place || { kind: 'grid' };
        if (pl.kind === 'podium') return { x: 0, z: 0, y: PODIUM_TOP, ry: 0 };
        if (pl.kind === 'ring') {
            // متفرجين بنص دائرة أمام المدرجات، وجوههم للوسط
            const n = Math.max(1, pl.n), a = Math.PI * (.1 + .8 * (pl.i + .5) / n) + Math.PI, r = R - 1.3 - (pl.i % 2) * 1.1;
            const x = -Math.cos(a) * r, z = Math.sin(a) * r * .85 - 1.5;
            return { x, z, y: 0, ry: Math.atan2(-x, -z) };
        }
        if (pl.kind === 'bye') return { x: 0, z: duelBottom() + 2.6, y: 0, ry: 0 };
        if (pl.kind === 'duel') {
            const n = Math.max(1, pl.n), cols = n <= 1 ? 1 : n <= 4 ? 2 : n <= 9 ? 3 : n <= 16 ? 4 : 5, rows = Math.ceil(n / cols);
            const row = Math.floor(pl.i / cols), inRow = Math.min(cols, n - row * cols), c = pl.i - row * cols;
            const CW = n <= 1 ? 4 : 4.6, RH = 3.3;
            const cx = (c - (inRow - 1) / 2) * CW, cz = (row - (rows - 1) / 2) * RH - .4;
            const sx = pl.side ? 1 : -1, gap = n <= 1 ? .95 : .82;
            // الاثنين متقابلين ومايلين شوي للكاميرا عشان تنشاف الوجوه والإيدين
            return { x: cx + sx * gap, z: cz, y: 0, ry: -sx * (Math.PI / 2 - .42) };
        }
        // grid: فترة الدخول، صفوف قدام الكاميرا
        const n = Math.max(1, pl.n || all), cols = Math.min(10, Math.ceil(Math.sqrt(n * 2.2))), rows = Math.ceil(n / cols);
        const row = Math.floor(pl.i / cols), inRow = Math.min(cols, n - row * cols), c = pl.i - row * cols;
        return { x: (c - (inRow - 1) / 2) * 1.35 + (row % 2) * .3, z: (row - (rows - 1) / 2) * 1.7, y: 0, ry: 0 };
    }
    let duelRows = 0;
    function duelBottom() { return (duelRows - 1) / 2 * 3.3; }

    function makeChar(p) {
        const n = idNum(p.id);
        // بنت أو ولد حسب الرقم، والباقي من الشكل الافتراضي المشتق من نفس الرقم (crowd-common.js)
        const look = resolveLook(n, 'guest', [-1, -1, -1, -1, -1, -1, -1, -1, n % 2]);
        const rig = makeRig({ look, role: 'guest', n });
        rig.root.visible = false; scene.add(rig.root);
        const tag = makeSprite(512, 104, .36); scene.add(tag);
        const bubble = makeSprite(420, 120, .5); bubble.visible = false; scene.add(bubble);
        const badge = makeSprite(420, 120, .42); badge.visible = false; scene.add(badge);
        const c = { id: p.id, rig, slot: freeSlots.pop(), pos: new T.Vector3(), target: new T.Vector3(), ry: 0, tRy: 0, y: 0,
            tag, bubble, badge, prop: null, propKind: 0, pick: 0, pose: 'idle', anim: -1, born: now, walking: false, poseAt: now, acc: 0, n };
        chars.set(p.id, c);
        return c;
    }
    function dropChar(c) {
        c.rig.dispose();
        [c.tag, c.bubble, c.badge].forEach(s => { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); });
        if (c.prop) c.prop.removeFromParent();
        if (c.slot != null) { blobs.setMatrixAt(c.slot, ZERO); freeSlots.push(c.slot); }
        chars.delete(c.id);
    }

    function setState(s) {
        if (!s) return;
        if (s.phase !== phase) { phase = s.phase; phaseAt = now; if (phase === 'champion') { startConfetti(0, 0); } }
        const list = s.players || [];
        duelRows = 0;
        const nd = list.reduce((m, p) => p.place && p.place.kind === 'duel' ? Math.max(m, p.place.n) : m, 0);
        if (nd) { const cols = nd <= 1 ? 1 : nd <= 4 ? 2 : nd <= 9 ? 3 : nd <= 16 ? 4 : 5; duelRows = Math.ceil(nd / cols); }
        const seen = new Set();
        list.forEach((p) => {
            seen.add(p.id);
            let c = chars.get(p.id);
            if (!c) { if (!freeSlots.length) return; c = makeChar(p); const t = placeOf(p, list.length); c.pos.set(t.x, t.y, t.z + 3); c.ry = t.ry; }
            const t = placeOf(p, list.length);
            c.target.set(t.x, t.y, t.z); c.tRy = t.ry; c.kind = (p.place && p.place.kind) || 'grid';
            if (p.pose !== c.pose) { c.pose = p.pose; c.poseAt = now; if (p.pose === 'win') flashAt(t.x, t.y, t.z, '#ffe08a'); }
            c.pick = p.pick || 0;
            drawTag(c.tag, { name: p.name, avatarUrl: p.avatarUrl, ring: p.ring || null, dim: c.kind === 'ring' });
            drawPill(c.bubble, p.bubble || null);
            drawPill(c.badge, p.badge || null);
            c.tag.visible = c.kind !== 'ring' || list.length <= 24;
        });
        for (const c of [...chars.values()]) if (!seen.has(c.id)) dropChar(c);
        // مراكز المواجهات من أماكن اللاعبين
        const by = new Map();
        list.forEach(p => { if (p.place && p.place.kind === 'duel') { const t = placeOf(p, list.length); const e = by.get(p.place.i) || { x: 0, z: 0, k: 0, live: false }; e.x += t.x; e.z += t.z; e.k++; if (p.pose === 'ready' || p.pose === 'shake' || p.pose === 'reveal') e.live = true; by.set(p.place.i, e); } });
        padList = [...by.values()].filter(e => e.k === 2).map(e => ({ x: e.x / 2, z: e.z / 2, live: e.live }));
    }

    // ---------- أوضاع اليد (فوق حركة الهيكل): نوجّه عظام الذراع اليمين باتجاهات بإحداثيات الجسم
    const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _qr = new T.Quaternion(), _v1 = new T.Vector3(), _v2 = new T.Vector3(), _e = new T.Euler();
    const REST_R = new T.Vector3(-1, 0, 0), REST_L = new T.Vector3(1, 0, 0);
    function aimBone(c, name, dx, dy, dz) {
        const b = c.rig.bones[name]; if (!b || !b.parent) return;
        _qr.setFromEuler(_e.set(0, c.ry, 0));
        b.parent.getWorldQuaternion(_qa);
        _v1.copy(name.startsWith('Left') ? REST_L : REST_R).applyQuaternion(_qr);
        _v2.set(dx, dy, dz).normalize().applyQuaternion(_qr);
        _qb.setFromUnitVectors(_v1, _v2).multiply(_qr);
        b.quaternion.copy(_qa.invert()).multiply(_qb);
    }
    function addRot(c, name, x, y, z) { const b = c.rig.bones[name]; if (b) b.quaternion.multiply(_qa.setFromEuler(_e.set(x, y, z))); }
    const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
    const FIST_U = [-.42, -.35, .85], FIST_F = [-.15, .75, .65];   // قبضة مرفوعة قدام الصدر
    const DOWN_F = [-.1, -.15, 1];                                 // الساعد نازل قدام (ضربة العد)
    const OUT_U = [-.2, .05, 1], OUT_F = [-.05, .1, 1];            // اليد ممدودة قدام بالمجسم
    const SHAKE_SEC = 1.8;

    function wantAnim(c) {
        if (c.walking) return 1;
        switch (c.pose) {
            case 'wave': return 3;
            case 'win': return now - c.poseAt < 1.1 ? 6 : 4;
            case 'clap': return 4;
            case 'dance': return 2;
            default: return 0;
        }
    }
    function propFor(c, kind) {
        if (c.propKind === kind) return c.prop;
        if (c.prop) c.prop.removeFromParent();
        c.prop = kind ? BUILDERS[kind]() : null; c.propKind = kind;
        if (c.prop) { c.prop.scale.setScalar(0); scene.add(c.prop); c.propAt = now; }
        return c.prop;
    }

    function poseChar(c, dt) {
        const u = now - c.poseAt;
        let showProp = 0;
        if (!c.walking) {
            if (c.pose === 'ready') {
                const k = ease(u / .35); const f = lerp3([-.12, -1, .2], FIST_F, k), up = lerp3([-.22, -1, .05], FIST_U, k);
                aimBone(c, 'RightArm', ...up); aimBone(c, 'RightForeArm', ...f);
            } else if (c.pose === 'shake') {
                // ثلاث ضربات: «حجرة.. ورقة.. مقص!» — اليد تطلع وتنزل مع العد
                const t = Math.min(u, SHAKE_SEC) / SHAKE_SEC * 3, ph = t % 1, beat = Math.sin(ph * Math.PI);
                const f = lerp3(FIST_F, DOWN_F, u >= SHAKE_SEC ? 1 : beat < 0 ? 0 : (ph < .5 ? ease(ph * 2) : 1 - ease((ph - .5) * 2)));
                aimBone(c, 'RightArm', ...FIST_U); aimBone(c, 'RightForeArm', ...f);
                addRot(c, 'Spine', .06 * beat, 0, 0);
            } else if (c.pose === 'reveal' || ((c.pose === 'win' || c.pose === 'lose') && c.pick && u < 1.2 && c.kind === 'duel')) {
                aimBone(c, 'RightArm', ...OUT_U); aimBone(c, 'RightForeArm', ...OUT_F); showProp = c.pick;
                if (c.pose === 'lose') { addRot(c, 'Spine', .35 * ease(u / .5), 0, 0); addRot(c, 'Head', .35 * ease(u / .5), 0, 0); }
            } else if (c.pose === 'lose') {
                const k = ease(u / .5); addRot(c, 'Spine', .38 * k, 0, 0); addRot(c, 'Spine1', .12 * k, 0, 0); addRot(c, 'Head', .4 * k, 0, .1 * k);
                aimBone(c, 'RightArm', .25, -1, .12); aimBone(c, 'LeftArm', -.25, -1, .12);
            }
        }
        // المجسم بيد اللاعب: يكبر بنطّة ويلتف شوي
        const prop = propFor(c, showProp);
        if (prop) {
            const hand = c.rig.bones.RightHand; hand.getWorldPosition(_v1);
            const fx = Math.sin(c.ry), fz = Math.cos(c.ry);
            prop.position.set(_v1.x + fx * .16, _v1.y + .05, _v1.z + fz * .16);
            const s = backOut((now - c.propAt) / .45) * .55;
            prop.scale.setScalar(Math.max(0, s));
            prop.rotation.set(c.propKind === 2 ? -.2 : .2, c.ry + (c.propKind === 2 ? Math.PI / 2 : 0) + Math.sin(now * 2 + c.n) * .15, c.propKind === 3 ? Math.PI / 2 : 0);
        }
    }

    // ================================================================ الكاميرا
    // كاميرا ثابتة: لقطة وحدة تغطي الساحة كلها طول المباراة (تتعدل بس مع مقاس الشاشة)
    const camLook = new T.Vector3(0, .4, .6);
    function fixCamera() {
        const half = 11.5, pitch = .6;
        const fovH = 2 * Math.atan(Math.tan(T.MathUtils.degToRad(camera.fov / 2)) * camera.aspect);
        const dist = Math.max(half / Math.tan(fovH / 2), 9 / Math.tan(T.MathUtils.degToRad(camera.fov / 2))) * .92;
        camera.position.set(0, camLook.y + dist * Math.sin(pitch), camLook.z + dist * Math.cos(pitch));
        camera.lookAt(camLook);
    }
    // ================================================================ الحلقة
    const clock = new T.Clock(); let raf = 0, frame = 0, stopped = false;
    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), .05); now += dt; frame++;
        // الجمهور الخلفي
        for (let i = 0; i < FANS; i++) { const d = fanData[i], hop = phase === 'champion' ? Math.max(0, Math.sin(now * d.sp + d.ph)) * .3 : 0; p4.set(d.x, d.y + hop, d.z); m4.compose(p4, q4, s4); fans.setMatrixAt(i, m4); }
        fans.instanceMatrix.needsUpdate = true;
        for (const b of beams) { const a = 0; b.beam.lookAt(Math.sin(a + b.ph) * 8, -2, Math.cos(a) * 5); b.beam.rotateX(-Math.PI / 2); b.beam.material.opacity = phase === 'champion' ? .22 : .11; }
        for (const g of giants) { g.g.rotation.y = now * .25 + g.ph; g.halo.rotation.z = now * .3; g.halo.lookAt(camera.position); }
        // منصة البطل
        const podUp = phase === 'champion' ? ease((now - phaseAt) / 1.2) : 0;
        podium.position.y = -1.4 + podUp * 1.4; podium.visible = podUp > 0;
        // الشخصيات
        let i = 0;
        for (const c of chars.values()) {
            const d = _v1.subVectors(c.target, c.pos); d.y = 0; const dist = d.length();
            const far = c.kind === 'ring' && chars.size > 20;
            c.walking = dist > .08;
            if (c.walking) {
                const sp = Math.max(2.2, Math.min(5, dist / 1.2)); if (Math.abs(sp - (c.sp || 0)) > .3) { c.sp = sp; c.rig.setSpeed(sp); } const step = Math.min(dist, dt * sp); c.pos.addScaledVector(d.normalize(), step);
                const want = Math.atan2(d.x, d.z); c.ry += Math.atan2(Math.sin(want - c.ry), Math.cos(want - c.ry)) * (1 - Math.exp(-dt * 10));
            } else { c.pos.x = c.target.x; c.pos.z = c.target.z; c.ry += Math.atan2(Math.sin(c.tRy - c.ry), Math.cos(c.tRy - c.ry)) * (1 - Math.exp(-dt * 6)); }
            const groundY = c.kind === 'podium' ? podium.position.y + PODIUM_TOP : 0;
            c.pos.y += (groundY - c.pos.y) * (1 - Math.exp(-dt * 12));
            const a = wantAnim(c); if (a !== c.anim) { c.rig.play(a); c.anim = a; }
            if (c.pose === 'win' || c.pose === 'dance') { if (!c.expT || now > c.expT) { c.rig.express('laugh', 1.4); c.expT = now + 1.3; } }
            c.rig.root.position.copy(c.pos); c.rig.root.rotation.y = c.ry; c.rig.root.visible = true;
            // البعيدين (المتفرجين) يتحدثون كل إطارين بدون فيزياء
            c.acc += dt;
            if (!far || (frame + i) % 2 === 0) { c.rig.update(c.acc, !far); c.acc = 0; }
            poseChar(c, dt);
            // اللافتات فوق الراس
            const head = c.pos.y + 1.92;
            c.tag.position.set(c.pos.x, head, c.pos.z);
            c.bubble.position.set(c.pos.x, head + .5, c.pos.z);
            c.badge.position.set(c.pos.x, head + (c.bubble.visible ? 1 : .5), c.pos.z);
            if (c.badge.visible) c.badge.scale.set(.42 * 420 / 120 * (1 + Math.sin(now * 5) * .03), .42, 1);
            if (c.slot != null) { p4.set(c.pos.x, c.pos.y + .02, c.pos.z); s4.set(.95, 1, .95); m4.compose(p4, q4, s4); blobs.setMatrixAt(c.slot, m4); s4.set(1, 1, 1); }
            i++;
        }
        blobs.instanceMatrix.needsUpdate = true;
        pads.forEach((pd, k) => {
            const e = padList[k]; pd.g.visible = !!e; if (!e) return;
            pd.g.position.set(e.x, 0, e.z);
            const pulse = e.live ? .9 : .35;
            pd.ring.material.opacity = pulse; pd.ring.material.color.set(phase === 'shake' && e.live ? '#ff4fd8' : '#a855f7');
        });
        for (const f of flashes) if (f.t < 1) { f.t += dt / .9; const s = .6 + f.t * 2.4; f.m.scale.set(s, 1, s); f.m.material.opacity = (1 - f.t) * .9; f.m.visible = f.t < 1; }
        if (confT >= 0) {
            confT += dt;
            confData.forEach((d, k) => { d.p.addScaledVector(d.v, dt); d.p.x += Math.sin(now * 2 + k) * dt * .3; if (d.p.y < 0) d.p.y += 14; d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; q4.setFromEuler(d.r); m4.compose(d.p, q4, s4); confetti.setMatrixAt(k, m4); });
            q4.identity(); confetti.instanceMatrix.needsUpdate = true;
            if (phase !== 'champion') { confT = -1; confetti.visible = false; }
        }
        if (composer) composer.render(); else renderer.render(scene, camera);
    }

    function resize() {
        const w = container.clientWidth || 1, h = container.clientHeight || 1;
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); fixCamera();
        if (composer) { composer.setSize(w, h); bloom.resolution.set(w / 2, h / 2); }
    }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();
    function onVis() { if (stopped) return; if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (!raf) { clock.getDelta(); tick(); } }
    document.addEventListener('visibilitychange', onVis);

    const ready = (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(() => { for (const c of chars.values()) c.tag.userData.key = ''; });
    tick();

    function stop() {
        stopped = true; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
        for (const c of [...chars.values()]) dropChar(c);
        scene.traverse(o => { if (o.geometry) o.geometry.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }); });
        Object.values(propMats).forEach(m => { if (m.isTexture) m.dispose(); else if (m.dispose) { if (m.map) m.map.dispose(); m.dispose(); } });
        for (const k in propMats) delete propMats[k];
        if (composer) composer.dispose && composer.dispose();
        renderer.dispose(); renderer.domElement.remove();
    }
    return { ready, setState, stop };
}
