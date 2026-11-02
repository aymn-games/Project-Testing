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
 *   place = { kind: 'duel'|'queue'|'podium', i, n, side }
 *     duel: واحد من الاثنين بالمواجهة الحالية (side 0 يسار، 1 يمين) — مكان واحد والكاميرا ثابتة عليه قريب
 *     queue: ينتظر دوره بنص دائرة خلف المواجهة (i من n) · podium: البطل
 *   pose = 'idle'|'wave'|'ready'|'shake'|'reveal'|'win'|'oops'|'ko'|'clap'|'dance' (oops = خسر محاولة بس)
 *     ko = إقصاء مضحك (ko: 1 نابض يطيّره · 2 مجسم عملاق من اختيار الفائز koPick يفرشه) ~2.9ث
 *   pick = 1/2/3 (يظهر المجسم بيده وقت reveal) · bubble = {text, color} · badge = {text, color}
 * createArena(container) ← { ready: Promise, setState, stop }
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { makeRig, loadClips } from '../birthday-party/rig3d.js';
import { resolveLook } from '../birthday-party/crowd-common.js';

const T = THREE, TAU = Math.PI * 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const ease = x => { x = clamp01(x); return x * x * (3 - 2 * x); };
const backOut = x => { x = clamp01(x); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const FONT = '"Zain", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif';
export const PICK_COLOR = { 1: '#b8926a', 2: '#7fa7c4', 3: '#c4706a' };
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

// ================================================================ المجسمات الثلاث (واقعية)
// كل مجسم Group حجمه ~1 وحدة؛ بيد الشخصية يتصغّر. المعدن يعكس بيئة الإضاءة (ENV) عشان يبان حقيقي.
const propMats = {};
let ENV = null;
function pm(key, make) { if (!propMats[key]) { propMats[key] = make(); if (ENV && propMats[key].isMaterial && 'envMap' in propMats[key]) propMats[key].envMap = ENV; } return propMats[key]; }
// ضجيج ناعم ثلاثي الأبعاد (للحجر): قيمة عشوائية ثابتة لكل نقطة شبكة + تنعيم
function hash3(x, y, z) { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
    const s = t => t * t * (3 - 2 * t), u = s(xf), v = s(yf), w = s(zf), L = (a, b, t) => a + (b - a) * t;
    const c = (dx, dy, dz) => hash3(xi + dx, yi + dy, zi + dz);
    return L(L(L(c(0, 0, 0), c(1, 0, 0), u), L(c(0, 1, 0), c(1, 1, 0), u), v), L(L(c(0, 0, 1), c(1, 0, 1), u), L(c(0, 1, 1), c(1, 1, 1), u), v), w);
}
function fbm(x, y, z) { let a = 0, f = 1, amp = .5; for (let o = 0; o < 4; o++) { a += amp * noise3(x * f, y * f, z * f); f *= 2.1; amp *= .5; } return a; }
let rockGeoCache = null;
function rockGeometry() {
    if (rockGeoCache) return rockGeoCache;
    let geo = new T.IcosahedronGeometry(.5, 4); geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
    geo = mergeVertices(geo);
    const p = geo.attributes.position, col = new Float32Array(p.count * 3), base = new T.Color('#7a736b'), dark = new T.Color('#4f4a44'), light = new T.Color('#a1988c'), c = new T.Color();
    for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const big = fbm(x * 1.6 + 3, y * 1.6, z * 1.6), fine = noise3(x * 14, y * 14, z * 14);
        // شكل حصاة: مفلطحة شوي، ونتوءات كبيرة وتفاصيل صغيرة
        const k = .82 + big * .42 + fine * .035;
        p.setXYZ(i, x * k * 1.12, y * k * .82, z * k);
        const sp = noise3(x * 40, y * 40, z * 40);
        c.copy(base).lerp(big > .55 ? light : dark, Math.abs(big - .5) * 1.2);
        if (sp > .82) c.lerp(light, .5); else if (sp < .16) c.lerp(dark, .6);
        col.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new T.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    return (rockGeoCache = geo);
}
function buildRock() {
    const g = new T.Group();
    g.add(new T.Mesh(rockGeometry(), pm('rock', () => new T.MeshStandardMaterial({ vertexColors: true, roughness: .95, metalness: 0, envMapIntensity: .25 }))));
    g.userData.shared = true;
    return g;
}
let paperGeoCache = null;
function buildPaper() {
    const g = new T.Group();
    const tex = pm('paperTex', () => canvasTex(512, 724, (ctx, W, H) => {
        // ورقة A4: أبيض مطفي بألياف خفيفة وظل ناعم عند الطيّة
        ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, W, H);
        for (let i = 0; i < 9000; i++) { const v = 225 + Math.random() * 30 | 0; ctx.fillStyle = `rgba(${v},${v - 3},${v - 10},.18)`; ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1); }
        const fold = ctx.createLinearGradient(0, H * .44, 0, H * .56); fold.addColorStop(0, 'rgba(0,0,0,0)'); fold.addColorStop(.5, 'rgba(120,110,95,.12)'); fold.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = fold; ctx.fillRect(0, H * .44, W, H * .12);
        ctx.strokeStyle = 'rgba(140,130,115,.25)'; ctx.lineWidth = 2; ctx.strokeRect(1, 1, W - 2, H - 2);
    }));
    if (!paperGeoCache) {
        const geo = new T.PlaneGeometry(.7, .99, 24, 32), p = geo.attributes.position;
        for (let i = 0; i < p.count; i++) {
            const x = p.getX(i), y = p.getY(i);
            // انحناء خفيف بالعرض + طيّة بالنص + زاوية مرفوعة شوي
            const curl = .07 * Math.pow(x / .35, 2), crease = -.025 * Math.exp(-Math.pow(y / .03, 2)) + .02 * Math.abs(y) / .5;
            const corner = Math.max(0, (x - .15) / .2) * Math.max(0, (y - .3) / .2) * .06;
            p.setZ(i, curl + crease + corner);
        }
        geo.computeVertexNormals(); paperGeoCache = geo;
    }
    g.add(new T.Mesh(paperGeoCache, pm('paper', () => new T.MeshStandardMaterial({ map: tex, color: '#e4dfd3', roughness: .9, metalness: 0, side: T.DoubleSide, envMapIntensity: .2 }))));
    g.userData.shared = true;
    return g;
}
let sciGeoCache = null;
function scissorsGeometry() {
    if (sciGeoCache) return sciGeoCache;
    // نصل حقيقي: عريض عند المحور ويدق لين الرأس، مع حافة مشطوفة
    const s = new T.Shape();
    s.moveTo(-.04, -.02); s.bezierCurveTo(-.06, .12, -.045, .36, -.014, .58); s.lineTo(0, .64);
    s.lineTo(.01, .57); s.bezierCurveTo(.018, .4, .024, .16, .026, -.02); s.lineTo(-.04, -.02);
    const blade = new T.ExtrudeGeometry(s, { depth: .008, bevelEnabled: true, bevelThickness: .003, bevelSize: .004, bevelSegments: 2, curveSegments: 16 });
    blade.translate(0, 0, -.004);
    const neck = new T.CylinderGeometry(.016, .02, .1, 12); neck.translate(0, -.07, 0);
    const loop = new T.TorusGeometry(.075, .022, 14, 40); loop.scale(1.25, .9, 1); loop.translate(0, -.2, 0);
    return (sciGeoCache = { blade, neck, loop, screw: new T.CylinderGeometry(.024, .024, .04, 20).rotateX(Math.PI / 2) });
}
function buildScissors() {
    const G = scissorsGeometry(), g = new T.Group();
    const steel = pm('steel', () => new T.MeshStandardMaterial({ color: '#cfd4da', metalness: 1, roughness: .22, envMapIntensity: 1.1 }));
    const grip = pm('grip', () => new T.MeshStandardMaterial({ color: '#2b2f36', roughness: .45, metalness: .05, envMapIntensity: .5 }));
    for (const sd of [1, -1]) {
        const half = new T.Group(); half.rotation.z = sd * .3; half.position.z = sd * .007;
        half.add(new T.Mesh(G.blade, steel));
        const neck = new T.Mesh(G.neck, grip), loop = new T.Mesh(G.loop, grip);
        neck.rotation.z = loop.rotation.z = 0; half.add(neck, loop);
        if (sd < 0) half.scale.x = -1; // النصل الثاني مرآة
        g.add(half);
    }
    g.add(new T.Mesh(G.screw, steel));
    g.position.y = -.08;
    const wrap = new T.Group(); wrap.add(g); wrap.userData.shared = true; return wrap;
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
    roundRect(ctx, x, y, bw, h, 38); ctx.fillStyle = 'rgba(14,16,21,.86)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = o.ring || 'rgba(255,255,255,.14)'; ctx.stroke();
    // الصورة يسار الاسم (نفس لافتات البث)
    const cx = x + 40, cy = y + h / 2, r = 28;
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.closePath(); ctx.clip();
    if (av && av.img) { try { ctx.drawImage(av.img, cx - r, cy - r, r * 2, r * 2); } catch (e) { /* صورة بدون CORS */ } }
    else { ctx.fillStyle = '#4a5263'; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.fillStyle = '#fff'; ctx.font = '900 30px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(initial(o.name), cx, cy + 2); }
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
        const g = ctx.createLinearGradient(0, 12, 0, H - 12); g.addColorStop(0, o.color); g.addColorStop(1, shade(o.color, -.22));
        ctx.fillStyle = g; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.stroke();
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
    renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%';
    container.appendChild(renderer.domElement);

    // بيئة إضاءة (انعكاسات) للمعدن والمجسمات بس — الشخصيات والساحة على الإضاءة العادية
    const pmrem = new T.PMREMGenerator(renderer);
    const envRT = pmrem.fromScene(new RoomEnvironment(renderer), .04); pmrem.dispose();
    ENV = envRT.texture;

    // ألوان هادية: فحمي مزرّق، وإضاءة دافية، ولمسات ذهبية مطفية
    const scene = new T.Scene();
    scene.background = canvasTex(4, 512, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0a0c10'); gr.addColorStop(.55, '#141820'); gr.addColorStop(1, '#1c212b'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    scene.fog = new T.Fog('#12151b', 30, 80);
    const camera = new T.PerspectiveCamera(36, 16 / 9, .1, 260);
    camera.position.set(0, 14, 26);

    // ---------- إضاءة استوديو: مفتاح دافي من فوق قدام، تعبئة باردة خفيفة، وحافة ناعمة من ورا
    scene.add(new T.HemisphereLight('#dfe5ee', '#2a2622', .95));
    const key = new T.DirectionalLight('#fff0dc', 2.1); key.position.set(4, 12, 14); scene.add(key);
    const rimA = new T.DirectionalLight('#9fb3d1', .55); rimA.position.set(-12, 7, -10); scene.add(rimA);
    const rimB = new T.DirectionalLight('#e6c9a0', .5); rimB.position.set(12, 7, -10); scene.add(rimB);
    // بقعة ضوء ناعمة على مكان المواجهة (وهمية: دائرة شفافة على الأرض)
    const poolTex = canvasTex(256, 256, (g, w) => { const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2); gr.addColorStop(0, 'rgba(255,236,205,.30)'); gr.addColorStop(.6, 'rgba(255,236,205,.10)'); gr.addColorStop(1, 'rgba(255,236,205,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); });
    const pool = new T.Mesh(new T.PlaneGeometry(7, 7).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false }));
    pool.position.set(0, .012, 4); scene.add(pool);

    // ---------- الأرضية: حجر مصقول غامق بعروق خفيفة وحلقات ذهبية رفيعة
    const R = 17;
    const floorTex = canvasTex(1024, 1024, (ctx, W, H) => {
        const cx = W / 2, cy = H / 2;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, W / 2); g.addColorStop(0, '#2a2e36'); g.addColorStop(.7, '#1b1e24'); g.addColorStop(1, '#121418');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
        ctx.globalAlpha = .07; ctx.strokeStyle = '#d8d2c4';
        for (let i = 0; i < 40; i++) { ctx.lineWidth = .6 + Math.random() * 1.6; ctx.beginPath(); let x = Math.random() * W, y = Math.random() * H; ctx.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (Math.random() - .5) * 180; y += (Math.random() - .3) * 120; ctx.lineTo(x, y); } ctx.stroke(); }
        ctx.globalAlpha = 1;
    });
    const glowTex = canvasTex(1024, 1024, (ctx, W, H) => {
        const cx = W / 2, cy = H / 2; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H);
        const ring = (r, w, c) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); };
        ring(502, 4, '#8d7a54'); ring(488, 1.5, '#5a4f3a'); ring(140, 2, '#5a4f3a');
    });
    const floorMat = new T.MeshStandardMaterial({ map: floorTex, emissiveMap: glowTex, emissive: '#ffffff', emissiveIntensity: .6, roughness: .38, metalness: .15 });
    const floor = new T.Mesh(new T.CylinderGeometry(R, R + .4, .5, 96), [new T.MeshStandardMaterial({ color: '#15181d', roughness: .5, metalness: .3 }), floorMat, floorMat]);
    floor.position.y = -.25; scene.add(floor);
    const edgeRing = new T.Mesh(new T.TorusGeometry(R + .25, .06, 8, 160), new T.MeshStandardMaterial({ color: '#a88d5a', metalness: .8, roughness: .35, envMap: ENV }));
    edgeRing.rotation.x = Math.PI / 2; edgeRing.position.y = .01; scene.add(edgeRing);
    const ground = new T.Mesh(new T.PlaneGeometry(260, 260), new T.MeshStandardMaterial({ color: '#0c0e12', roughness: .95 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -.5; scene.add(ground);

    // ---------- المدرجات: درجات غامقة بخط إضاءة دافي خافت، وجمهور بألوان مطفية (InstancedMesh)
    const stands = new T.Group(); scene.add(stands);
    const tierM = new T.MeshStandardMaterial({ color: '#191c22', roughness: .8, metalness: .1, side: T.DoubleSide });
    const ledM = new T.MeshBasicMaterial({ color: '#6e6250' });
    for (let i = 0; i < 6; i++) {
        const r = R + 4 + i * 1.6, y = .4 + i * 1.05;
        const tier = new T.Mesh(new T.CylinderGeometry(r + 1.6, r + 1.6, 1.05, 96, 1, true, Math.PI * .08, Math.PI * 1.84), tierM);
        tier.position.y = y; tier.rotation.y = Math.PI; stands.add(tier);
        const top = new T.Mesh(new T.RingGeometry(r, r + 1.6, 96, 1, Math.PI * .08 + Math.PI, Math.PI * 1.84), tierM);
        top.rotation.x = -Math.PI / 2; top.position.y = y + .53; stands.add(top);
        if (i % 2 === 0) {
            const led = new T.Mesh(new T.TorusGeometry(r + .02, .03, 6, 160, Math.PI * 1.84), ledM);
            led.rotation.x = Math.PI / 2; led.rotation.z = Math.PI * .08 + Math.PI; led.position.y = y + .55; stands.add(led);
        }
    }
    const fanGeo = new T.CapsuleGeometry(.22, .5, 3, 8); fanGeo.translate(0, .5, 0);
    const FANS = 420, fans = new T.InstancedMesh(fanGeo, new T.MeshStandardMaterial({ roughness: .85 }), FANS);
    const fanData = []; const m4 = new T.Matrix4(), q4 = new T.Quaternion(), s4 = new T.Vector3(1, 1, 1), p4 = new T.Vector3(), col = new T.Color();
    for (let i = 0; i < FANS; i++) {
        const tier = i % 6, r = R + 4.8 + tier * 1.6, a = Math.PI * .08 + Math.PI + Math.random() * Math.PI * 1.84, y = .93 + tier * 1.05;
        fanData.push({ x: -Math.cos(a) * r, z: Math.sin(a) * r, y, ph: Math.random() * TAU, sp: 1.5 + Math.random() * 2 });
        col.setHSL(Math.random(), .16, .26 + Math.random() * .14); fans.setColorAt(i, col);
    }
    stands.add(fans);

    // ---------- أبراج إضاءة وأشعة دافية خفيفة جداً (وهمية)
    const beamTex = canvasTex(64, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const beamGeo = new T.CylinderGeometry(.2, 2.2, 21, 24, 1, true); beamGeo.translate(0, -10.5, 0);
    const beams = [];
    const towerM = new T.MeshStandardMaterial({ color: '#1c1f25', metalness: .6, roughness: .45 });
    const headM = new T.MeshStandardMaterial({ color: '#2a2a2a', emissive: '#ffe6c2', emissiveIntensity: .9 });
    const beamM = new T.MeshBasicMaterial({ color: '#fff0d8', map: beamTex, transparent: true, opacity: .06, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    for (let i = 0; i < 6; i++) {
        const a = Math.PI * (.15 + i * .14) + Math.PI, r = R + 12;
        const x = -Math.cos(a) * r, z = Math.sin(a) * r;
        const tower = new T.Mesh(new T.CylinderGeometry(.3, .5, 16, 8), towerM); tower.position.set(x, 8, z); scene.add(tower);
        const head = new T.Mesh(new T.BoxGeometry(1.6, .9, .9), headM); head.position.set(x, 16.3, z); head.lookAt(0, 0, 0); scene.add(head);
        const beam = new T.Mesh(beamGeo, beamM); beam.position.set(x, 16.3, z); scene.add(beam);
        beams.push({ beam, x, z, ph: i * 1.3 });
    }

    // ---------- منصة المواجهة: حلقة ذهبية رفيعة و«VS» على الأرض (pool)
    const vsTex = canvasTex(256, 128, (ctx, W, H) => { ctx.font = '900 92px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(236,226,204,.85)'; ctx.fillText('VS', W / 2, H / 2 + 6); });
    const padRingGeo = new T.RingGeometry(1.36, 1.42, 72); padRingGeo.rotateX(-Math.PI / 2);
    const padDiscGeo = new T.CircleGeometry(1.36, 48); padDiscGeo.rotateX(-Math.PI / 2);
    const vsGeo = new T.PlaneGeometry(.8, .4); vsGeo.rotateX(-Math.PI / 2);
    const pads = Array.from({ length: 32 }, () => {
        const g = new T.Group(); g.visible = false; scene.add(g);
        const ring = new T.Mesh(padRingGeo, new T.MeshBasicMaterial({ color: '#b39a68', transparent: true, opacity: .8, depthWrite: false }));
        const disc = new T.Mesh(padDiscGeo, new T.MeshBasicMaterial({ color: '#0d0f13', transparent: true, opacity: .35, depthWrite: false }));
        const vs = new T.Mesh(vsGeo, new T.MeshBasicMaterial({ map: vsTex, transparent: true, depthWrite: false }));
        ring.position.y = .025; disc.position.y = .02; vs.position.set(0, .03, .62);
        g.add(disc, ring, vs); return { g, ring, w: 0 };
    });
    let padList = []; // [{x, z, live}]

    // ---------- منصة البطل (تطلع من الأرض): ذهب مطفي يعكس البيئة
    const podium = new T.Group(); podium.position.set(0, -1.4, 4); scene.add(podium);
    const podGold = new T.MeshStandardMaterial({ color: '#c6a35a', metalness: .9, roughness: .32, envMap: ENV });
    const pod1 = new T.Mesh(new T.CylinderGeometry(1.1, 1.3, .5, 48), podGold); pod1.position.y = .25; podium.add(pod1);
    const podRing = new T.Mesh(new T.TorusGeometry(1.3, .045, 8, 64), new T.MeshStandardMaterial({ color: '#e2cd96', metalness: .9, roughness: .25, envMap: ENV })); podRing.rotation.x = Math.PI / 2; podRing.position.y = .51; podium.add(podRing);
    const PODIUM_TOP = .5;

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
    const flashes = Array.from({ length: 40 }, () => { const m = new T.Mesh(flashGeo, new T.MeshBasicMaterial({ color: '#efdcb2', transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false })); m.visible = false; scene.add(m); return { m, t: 9 }; });
    function flashAt(x, y, z, color) { const f = flashes.find(f => f.t >= 1) || flashes[0]; f.t = 0; f.m.position.set(x, y + .03, z); f.m.material.color.set(color); f.m.visible = true; }
    const CONF = 360, confGeo = new T.PlaneGeometry(.12, .2);
    const confetti = new T.InstancedMesh(confGeo, new T.MeshBasicMaterial({ side: T.DoubleSide }), CONF);
    confetti.frustumCulled = false; confetti.visible = false; scene.add(confetti);
    const confData = Array.from({ length: CONF }, (_, i) => { const cc = [['#d9bf85'], ['#efe6d2'], ['#b9c3cf'], ['#c9a46a'], ['#e7d9b8']][i % 5][0]; col.set(cc); confetti.setColorAt(i, col); return { p: new T.Vector3(), v: new T.Vector3(), r: new T.Euler(), w: new T.Vector3() }; });
    let confT = -1;
    function startConfetti(cx, cz) {
        confT = 0; confetti.visible = true;
        for (const d of confData) { d.p.set(cx + (Math.random() - .5) * 7, 4 + Math.random() * 4, cz + (Math.random() - .5) * 5); d.v.set((Math.random() - .5) * .8, -1.2 - Math.random() * 1.2, (Math.random() - .5) * .8); d.r.set(Math.random() * TAU, Math.random() * TAU, 0); d.w.set(Math.random() * 6, Math.random() * 6, Math.random() * 3); }
    }

    // ---------- المعالجة اللاحقة: توهّج (Bloom). لو فشلت نرسم عادي.
    let composer = null, bloom = null;
    try {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloom = new UnrealBloomPass(new T.Vector2(512, 512), .15, .4, .98); composer.addPass(bloom);
        composer.addPass(new OutputPass());
    } catch (e) { composer = null; }

    // ================================================================ الشخصيات
    const chars = new Map(); // id → {rig, slot, pos, target, ry, tRy, tag, bubble, badge, prop, pick, pose, place, ...}
    let phase = 'join', phaseAt = 0, now = 0;

    // مكان المواجهة الوحيد (الكاميرا ثابتة عليه) والطابور خلفه
    const DZ = 4, QC = 3;
    function placeOf(p) {
        const pl = p.place || { kind: 'queue', i: 0, n: 1 };
        if (pl.kind === 'podium') return { x: 0, z: DZ, y: PODIUM_TOP, ry: 0 };
        if (pl.kind === 'duel') {
            // الاثنين متقابلين ومايلين شوي للكاميرا عشان تنشاف الوجوه والإيدين
            const sx = pl.side ? 1 : -1;
            return { x: sx * .82, z: DZ, y: 0, ry: -sx * (Math.PI / 2 - .85) };
        }
        // queue: نص دائرة خلف المواجهة، صفوف 12، وجوههم للمواجهة
        const n = Math.max(1, pl.n), row = Math.floor(pl.i / 12), inRow = Math.min(12, n - row * 12), k = pl.i - row * 12;
        const rad = 4.6 + row * 1.35, a = Math.PI / 2 + (k - (inRow - 1) / 2) * (.82 / rad) * (row % 2 ? 1.04 : 1);
        const x = Math.cos(a) * rad, z = QC - Math.sin(a) * rad;
        return { x, z, y: 0, ry: Math.atan2(-x, DZ - z) };
    }

    function makeChar(p) {
        const n = idNum(p.id);
        // بنت أو ولد حسب الرقم، والباقي من الشكل الافتراضي المشتق من نفس الرقم (crowd-common.js)
        const look = resolveLook(n, 'guest', [-1, -1, -1, -1, -1, -1, -1, -1, n % 2]);
        const rig = makeRig({ look, role: 'guest', n });
        rig.root.visible = false; scene.add(rig.root);
        const tag = makeSprite(512, 104, .36); scene.add(tag);
        const bubble = makeSprite(420, 120, .27); bubble.visible = false; scene.add(bubble);
        const badge = makeSprite(420, 120, .27); badge.visible = false; scene.add(badge);
        const c = { id: p.id, rig, slot: freeSlots.pop(), pos: new T.Vector3(), target: new T.Vector3(), ry: 0, tRy: 0, y: 0,
            tag, bubble, badge, prop: null, propKind: 0, pick: 0, pose: 'idle', anim: -1, born: now, walking: false, poseAt: now, acc: 0, n };
        chars.set(p.id, c);
        return c;
    }
    function dropChar(c) {
        c.rig.dispose();
        [c.tag, c.bubble, c.badge].forEach(s => { s.removeFromParent(); s.material.map.dispose(); s.material.dispose(); });
        if (c.prop) dropObj(c.prop);
        if (c.ko) dropObj(c.ko.obj);
        if (c.slot != null) { blobs.setMatrixAt(c.slot, ZERO); freeSlots.push(c.slot); }
        chars.delete(c.id);
    }

    function setState(s) {
        if (!s) return;
        if (s.phase !== phase) { phase = s.phase; phaseAt = now; if (phase === 'champion') { startConfetti(0, DZ); } }
        const list = s.players || [];
        const seen = new Set();
        list.forEach((p) => {
            seen.add(p.id);
            let c = chars.get(p.id);
            if (!c) { if (!freeSlots.length) return; c = makeChar(p); const t = placeOf(p); c.pos.set(t.x, t.y, t.z - 2.5); c.ry = t.ry; }
            const t = placeOf(p);
            c.target.set(t.x, t.y, t.z); c.tRy = t.ry; c.kind = (p.place && p.place.kind) || 'queue';
            if (p.pose !== c.pose) {
                c.pose = p.pose; c.poseAt = now;
                if (p.pose === 'win') flashAt(t.x, t.y, t.z, '#efdcb2');
                if (p.pose === 'ko') { c.ko = { kind: p.ko || 1, at: now, pick: p.koPick || 1, obj: null, done: false }; }
            }
            c.pick = p.pick || 0;
            c.hand = c.kind === 'duel' && !(p.place && p.place.side) ? 'Left' : 'Right';
            drawTag(c.tag, { name: p.name, avatarUrl: p.avatarUrl, ring: p.ring || null, dim: c.kind === 'queue' });
            drawPill(c.bubble, p.bubble || null);
            drawPill(c.badge, p.badge || null);
            c.tagOk = c.kind === 'queue' && p.place && p.place.n <= 16; // اللي بالمواجهة اسمه بشريط VS فوق
        });
        for (const c of [...chars.values()]) if (!seen.has(c.id)) dropChar(c);
        // مراكز المواجهات من أماكن اللاعبين
        const by = new Map();
        list.forEach(p => { if (p.place && p.place.kind === 'duel') { const t = placeOf(p); const e = by.get(p.place.i) || { x: 0, z: 0, k: 0, live: false }; e.x += t.x; e.z += t.z; e.k++; if (p.pose === 'ready' || p.pose === 'shake' || p.pose === 'reveal') e.live = true; by.set(p.place.i, e); } });
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
    const OUT_U = [-.7, .08, .7], OUT_F = [-.72, .14, .68];        // اليد ممدودة للخصم بالمجسم
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
        if (c.prop) dropObj(c.prop);
        c.prop = kind ? BUILDERS[kind]() : null; c.propKind = kind;
        if (c.prop) { c.prop.scale.setScalar(0); scene.add(c.prop); c.propAt = now; }
        return c.prop;
    }

    // الاتجاهات مكتوبة لليد اليمين (يمين الشخصية = -X)؛ اللي على اليسار يستخدم يده اليسار فتنعكس X،
    // عشان اليدين يتقابلون بالنص قدام الكاميرا.
    function arm(c, U, F) {
        const S = c.hand || 'Right', k = S === 'Left' ? -1 : 1;
        aimBone(c, S + 'Arm', U[0] * k, U[1], U[2]); aimBone(c, S + 'ForeArm', F[0] * k, F[1], F[2]);
    }
    function poseChar(c, dt) {
        const u = now - c.poseAt;
        let showProp = 0;
        if (!c.walking) {
            if (c.pose === 'ready') {
                const k = ease(u / .35);
                arm(c, lerp3([-.22, -1, .05], FIST_U, k), lerp3([-.12, -1, .2], FIST_F, k));
            } else if (c.pose === 'shake') {
                // ثلاث ضربات: «حجرة.. ورقة.. مقص!» — اليد تطلع وتنزل مع العد
                const t = Math.min(u, SHAKE_SEC) / SHAKE_SEC * 3, ph = t % 1, beat = Math.sin(ph * Math.PI);
                const f = lerp3(FIST_F, DOWN_F, u >= SHAKE_SEC ? 1 : (ph < .5 ? ease(ph * 2) : 1 - ease((ph - .5) * 2)));
                arm(c, FIST_U, f);
                addRot(c, 'Spine', .06 * beat, 0, 0);
            } else if (c.pose === 'oops') {
                const k = ease(u / .4); addRot(c, 'Spine', .3 * k, 0, 0); addRot(c, 'Spine1', .1 * k, 0, 0); addRot(c, 'Head', .35 * k, 0, .08 * k);
                if (c.pick && u < 1.4) { arm(c, OUT_U, OUT_F); showProp = c.pick; }
            } else if (c.pose === 'reveal' || (c.pose === 'win' && c.pick && u < 1.4 && c.kind === 'duel') || (c.pose === 'ko' && c.pick && u < .7)) {
                // الخاسر يبقى ماسك اختياره وهو يرجف قبل الإقصاء
                arm(c, OUT_U, OUT_F); showProp = c.pick;
            }
        }
        // المجسم بيد اللاعب: يكبر بنطّة، ويطلع قدام اليد على امتداد الساعد
        const prop = propFor(c, showProp);
        if (prop) {
            const S = c.hand || 'Right';
            c.rig.bones[S + 'Hand'].getWorldPosition(_v1); c.rig.bones[S + 'ForeArm'].getWorldPosition(_v2);
            _v2.subVectors(_v1, _v2).normalize();
            prop.position.copy(_v1).addScaledVector(_v2, c.propKind === 3 ? .1 : .06);
            const s = backOut((now - c.propAt) / .45) * (c.propKind === 1 ? .4 : c.propKind === 2 ? .5 : .74);
            prop.scale.setScalar(Math.max(0, s));
            const toCam = Math.atan2(camera.position.x - prop.position.x, camera.position.z - prop.position.z);
            const toward = (c.hand === 'Left' ? 1 : -1); // جهة الخصم على الشاشة
            if (c.propKind === 1) prop.rotation.set(.3, now * .6 + c.n, .2);                                   // الحجر يلف بهدوء
            else if (c.propKind === 2) prop.rotation.set(-.12, toCam - toward * .35, toward * .08);             // الورقة مواجهة للكاميرا ومايلة للخصم
            else prop.rotation.set(0, toCam, -toward * (Math.PI / 2) + Math.sin(now * 9) * .05);              // المقص رأسه للخصم
        }
    }

    // ================================================================ الكاميرا
    // كاميرا ثابتة: لقطة وحدة تغطي الساحة كلها طول المباراة (تتعدل بس مع مقاس الشاشة)
    // لقطة قريبة ثابتة على مكان المواجهة: الاثنين كاملين ويديهم بالنص، والطابور ورا
    const camLook = new T.Vector3(0, 1.22, DZ);
    function fixCamera() {
        const W = 3.9, H = 3.05, pitch = .2;
        const tv = Math.tan(T.MathUtils.degToRad(camera.fov / 2)), th = tv * camera.aspect;
        const dist = Math.max(H / 2 / tv, W / 2 / th);
        camera.position.set(0, camLook.y + dist * Math.sin(pitch), camLook.z + dist * Math.cos(pitch));
        camera.lookAt(camLook);
    }
    // ================================================================ الإقصاء المضحك
    // 1 «النابض»: يرجف خوف، ينط نابض من الأرض ويطيّره يلف بالسما لين يختفي بنجمة.
    // 2 «الفطيرة»: مجسم عملاق من اختيار الفائز يطيح عليه من فوق ويفرشه فطيرة، ثم يختفي بـ«بوف».
    const coilGeo = (() => { const pts = []; for (let i = 0; i <= 120; i++) { const t = i / 120, a = t * TAU * 6; pts.push(new T.Vector3(Math.cos(a) * .28, t, Math.sin(a) * .28)); } return new T.TubeGeometry(new T.CatmullRomCurve3(pts), 240, .035, 6, false); })();
    const coilMat = new T.MeshStandardMaterial({ color: '#d7dde6', metalness: 1, roughness: .25, envMap: ENV });
    const plateGeo = new T.CylinderGeometry(.42, .42, .06, 24), plateMat = new T.MeshStandardMaterial({ color: '#a8463e', roughness: .5 });
    const starTex = canvasTex(128, 128, (g, w) => { g.translate(w / 2, w / 2); g.fillStyle = '#fff6c8'; g.shadowColor = '#ffd84a'; g.shadowBlur = 20; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 18 : 52, a = k / 10 * TAU - Math.PI / 2; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
    const stars = Array.from({ length: 4 }, () => { const sp = new T.Sprite(new T.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); sp.visible = false; sp.renderOrder = 12; scene.add(sp); return { sp, t: 9 }; });
    function starAt(x, y, z, size) { const s = stars.find(s => s.t >= 1) || stars[0]; s.t = 0; s.size = size || 1; s.sp.position.set(x, y, z); s.sp.visible = true; }
    function dropObj(o) { if (!o) return; o.removeFromParent(); if (o.userData.shared) return; o.traverse(m => { if (m.geometry && m.geometry !== coilGeo && m.geometry !== plateGeo) m.geometry.dispose(); }); }

    function koApply(c) {
        const k = c.ko, u = now - k.at, root = c.rig.root;
        // البداية المشتركة: رجفة خوف وعيون مفتوحة
        if (u < .75) { root.position.x += Math.sin(u * 70) * .025; if (!k.scared) { k.scared = true; c.rig.express('open', 2.5); } }
        if (k.kind === 1) {
            if (u >= .7 && !k.obj) {
                k.obj = new T.Group(); const coil = new T.Mesh(coilGeo, coilMat), plate = new T.Mesh(plateGeo, plateMat); plate.position.y = 1; k.obj.add(coil, plate);
                k.obj.position.set(c.pos.x, 0, c.pos.z); scene.add(k.obj);
            }
            if (k.obj) { const e = u < .82 ? backOut((u - .7) / .12) : Math.max(0, 1 - (u - 1.6) / .4); k.obj.scale.set(1, Math.max(.001, e * .55), 1); k.obj.visible = e > .01; }
            if (u >= .8) {
                const t = u - .8, side = c.pos.x < 0 ? -1 : 1;
                root.position.set(c.pos.x + side * t * 1.6, .55 + 7.5 * t - 4.2 * t * t, c.pos.z - t * 5);
                root.rotation.set(t * 9, c.ry + t * 6, side * t * 4);
                const sc = Math.max(0, 1 - Math.max(0, t - .9) / .9); root.scale.setScalar(sc);
                if (t > 1.65 && !k.star) { k.star = true; starAt(root.position.x, root.position.y, root.position.z, 1.4); }
                if (sc <= 0) { root.visible = false; k.done = true; }
            } else root.scale.setScalar(1);
        } else {
            const IMPACT = 1.0;
            if (u >= .45 && !k.obj) { k.obj = BUILDERS[k.pick](); k.big = { 1: 1.05, 2: 1.6, 3: 1.9 }[k.pick] || 1.5; k.obj.scale.setScalar(k.big); scene.add(k.obj); }
            if (k.obj) {
                const f = clamp01((u - .45) / (IMPACT - .45));
                const rest = k.pick === 1 ? .62 : .75; let y = 7.5 - f * f * (7.5 - rest);
                if (u > IMPACT) { const b = u - IMPACT; y = rest + Math.max(0, Math.sin(b * 7) * .5 * Math.exp(-b * 3)); }
                k.obj.position.set(c.pos.x, y, c.pos.z); k.obj.rotation.set(0, now * 2, k.pick === 3 ? Math.PI / 2 : 0);
                const fade = clamp01((u - 1.9) / .35); k.obj.scale.setScalar(k.big * (1 - fade)); k.obj.visible = fade < 1;
            }
            if (u >= IMPACT) {
                if (!k.hit) { k.hit = true; flashAt(c.pos.x, 0, c.pos.z, '#f2ead8'); flashAt(c.pos.x, 0, c.pos.z, '#cdb27a'); }
                const b = u - IMPACT, wob = Math.sin(b * 22) * Math.exp(-b * 5) * .25;
                let sy = .14 + wob * .3, sxz = 1.55 - wob;
                if (u > 2.5) { const g = clamp01((u - 2.5) / .3); sy *= 1 - g; sxz *= 1 + g * .6; if (g >= 1 && !k.star) { k.star = true; starAt(c.pos.x, .4, c.pos.z, 1.1); } }
                root.scale.set(sxz, Math.max(.001, sy), sxz);
                if (u > 2.8) { root.visible = false; k.done = true; }
            }
        }
        // اللافتات تختفي أول ما يبدأ الطيران أو الفرش
        if (u > .75) { c.tag.visible = false; c.bubble.visible = false; }
        if (u > 1.1) c.badge.visible = false;
    }

    // ================================================================ الحلقة
    const clock = new T.Clock(); let raf = 0, frame = 0, stopped = false;
    function tick() {
        raf = requestAnimationFrame(tick);
        const dt = Math.min(clock.getDelta(), .05); now += dt; frame++;
        // الجمهور الخلفي
        for (let i = 0; i < FANS; i++) { const d = fanData[i], hop = phase === 'champion' ? Math.max(0, Math.sin(now * d.sp + d.ph)) * .3 : 0; p4.set(d.x, d.y + hop, d.z); m4.compose(p4, q4, s4); fans.setMatrixAt(i, m4); }
        fans.instanceMatrix.needsUpdate = true;
        for (const b of beams) { const a = 0; b.beam.lookAt(Math.sin(a + b.ph) * 8, -2, Math.cos(a) * 5); b.beam.rotateX(-Math.PI / 2); b.beam.material.opacity = phase === 'champion' ? .1 : .06; }
        // منصة البطل
        const podUp = phase === 'champion' ? ease((now - phaseAt) / 1.2) : 0;
        podium.position.y = -1.4 + podUp * 1.4; podium.visible = podUp > 0;
        // الشخصيات
        let i = 0;
        for (const c of chars.values()) {
            const d = _v1.subVectors(c.target, c.pos); d.y = 0; const dist = d.length();
            const far = c.kind === 'queue' && chars.size > 20;
            c.walking = dist > .08;
            if (c.walking) {
                const sp = Math.max(2.2, Math.min(5, dist / 1.2)); if (Math.abs(sp - (c.sp || 0)) > .3) { c.sp = sp; c.rig.setSpeed(sp); } const step = Math.min(dist, dt * sp); c.pos.addScaledVector(d.normalize(), step);
                const want = Math.atan2(d.x, d.z); c.ry += Math.atan2(Math.sin(want - c.ry), Math.cos(want - c.ry)) * (1 - Math.exp(-dt * 10));
            } else { c.pos.x = c.target.x; c.pos.z = c.target.z; c.ry += Math.atan2(Math.sin(c.tRy - c.ry), Math.cos(c.tRy - c.ry)) * (1 - Math.exp(-dt * 6)); }
            const groundY = c.kind === 'podium' ? podium.position.y + PODIUM_TOP : 0;
            c.pos.y += (groundY - c.pos.y) * (1 - Math.exp(-dt * 12));
            const a = wantAnim(c); if (a !== c.anim) { c.rig.play(a); c.anim = a; }
            if (c.pose === 'win' || c.pose === 'dance') { if (!c.expT || now > c.expT) { c.rig.express('laugh', 1.4); c.expT = now + 1.3; } }
            c.rig.root.position.copy(c.pos); c.rig.root.rotation.set(0, c.ry, 0);
            if (c.pose === 'ko' && c.ko) { if (!c.ko.done) { c.rig.root.visible = true; koApply(c); } }
            else { c.rig.root.visible = true; c.rig.root.scale.setScalar(1); if (c.ko) { dropObj(c.ko.obj); c.ko = null; } c.tag.visible = c.tagOk !== false; }
            // البعيدين (المتفرجين) يتحدثون كل إطارين بدون فيزياء
            c.acc += dt;
            if (!far || (frame + i) % 2 === 0) { c.rig.update(c.acc, !far); c.acc = 0; }
            poseChar(c, dt);
            // اللافتات فوق الراس
            const head = c.pos.y + 1.92;
            c.tag.position.set(c.pos.x, head, c.pos.z);
            c.bubble.position.set(c.pos.x, head + .26, c.pos.z);
            c.badge.position.set(c.pos.x, head + (c.bubble.visible ? .56 : .26), c.pos.z);
            
            if (c.slot != null) { const air = c.ko && c.ko.kind === 1 ? clamp01((now - c.ko.at - .8) * 2) : (c.ko && c.ko.done ? 1 : 0); p4.set(c.pos.x, c.pos.y + .02, c.pos.z); s4.set(.95 * (1 - air) + .001, 1, .95 * (1 - air) + .001); m4.compose(p4, q4, s4); blobs.setMatrixAt(c.slot, m4); s4.set(1, 1, 1); }
            i++;
        }
        blobs.instanceMatrix.needsUpdate = true;
        pads.forEach((pd, k) => {
            const e = padList[k]; pd.g.visible = !!e; if (!e) return;
            pd.g.position.set(e.x, 0, e.z);
            const pulse = e.live ? .85 : .4;
            pd.ring.material.opacity = pulse;
        });
        for (const st of stars) if (st.t < 1) { st.t += dt / .7; const s = st.size * (st.t < .3 ? st.t / .3 : 1) * (1 + st.t); st.sp.scale.set(s, s, 1); st.sp.material.opacity = 1 - st.t; st.sp.material.rotation = st.t * 3; st.sp.visible = st.t < 1; }
        for (const f of flashes) if (f.t < 1) { f.t += dt / .9; const s = .6 + f.t * 2.4; f.m.scale.set(s, 1, s); f.m.material.opacity = (1 - f.t) * .9; f.m.visible = f.t < 1; }
        if (confT >= 0) {
            confT += dt;
            confData.forEach((d, k) => { d.p.addScaledVector(d.v, dt); d.p.x += Math.sin(now * 2 + k) * dt * .3; if (d.p.y < 0) d.p.y += 8; d.r.x += d.w.x * dt; d.r.y += d.w.y * dt; q4.setFromEuler(d.r); m4.compose(d.p, q4, s4); confetti.setMatrixAt(k, m4); });
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
        rockGeoCache = paperGeoCache = null; if (sciGeoCache) Object.values(sciGeoCache).forEach(g => g.dispose()); sciGeoCache = null;
        envRT.dispose(); ENV = null;
        if (composer) composer.dispose && composer.dispose();
        renderer.dispose(); renderer.domElement.remove();
    }
    return { ready, setState, stop };
}
