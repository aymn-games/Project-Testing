/**
 * «المافيا» — مشهد شاشة البث ثلاثي الأبعاد (Three.js).
 *
 * ساحة قرية صحراوية بالليل: نار بالوسط، اللاعبين شخصيات كرتونية جالسين حولها،
 * أسوار ونخيل وفوانيس. كل شي مبني بالكود (بدون ملفات موديلات).
 *
 * createStage(container, getFrame) — getFrame() يرجع {G, room, now} كل فريم:
 *   G   = حالة المباراة (نسخة المذيع المفلترة) أو null باللوبي
 *   now = وقت الخادم (MafiaNet.now) — المشاهد تُحسب من الوقت مباشرة (مو تراكمياً)،
 *         فلو تحدّثت الصفحة وسط لقطة يكمل من نفس اللحظة.
 *
 * اللقطات (مددها لازم تطابق SHOT في backend/mafia/mafia-game.js):
 *   intro · inspect (غرفة التحقيق) · attack (هجوم المافيا) · save (الطبيب ينقذ)
 *   · quiet · result (الشروق) — وverdict (القفص ينزل على المطرود) وover (الاحتفال).
 * النصوص فوق المشهد (اللافتات) يرسمها index.html؛ هنا shotInfo() تقول وش اللقطة الحالية.
 */
import * as THREE from 'three';

const L = window.MafiaLooks;
const TAU = Math.PI * 2;
const ease = (x) => x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x);
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const lerp = (a, b, t) => a + (b - a) * t;
const span = (u, a, b) => clamp01((u - a) / (b - a));

// ---------------------------------------------------------------- مواد وأشكال
function mat(color, opts) { return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.85, metalness: 0 }, opts || {})); }
function mesh(geo, m, x, y, z) { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }

function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
}

// ---------------------------------------------------------------- لافتات الأسماء والشات
const FONT = '"Zain", "Segoe UI", Tahoma, sans-serif';
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

function makeSprite(scaleY) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 160;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 10; sp.userData = { c, tex, key: '' };
    sp.scale.set(scaleY * 512 / 160, scaleY, 1);
    return sp;
}

function drawTag(sp, o) {
    const key = JSON.stringify(o); if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '800 50px ' + FONT; ctx.direction = 'rtl';
    const name = o.name.length > 14 ? o.name.slice(0, 13) + '…' : o.name;
    const tw = Math.min(330, ctx.measureText(name).width), bw = tw + 120, x = (W - bw) / 2, y = 14, h = 72;
    ctx.globalAlpha = o.dead ? 0.6 : 1;
    roundRect(ctx, x, y, bw, h, 36); ctx.fillStyle = 'rgba(20,22,40,.82)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = o.ring || 'rgba(255,255,255,.18)'; ctx.stroke();
    // دائرة الرقم (يسار الاسم مثل لافتات البث)
    ctx.beginPath(); ctx.arc(x + 40, y + h / 2, 26, 0, TAU); ctx.fillStyle = o.dead ? '#555a6b' : '#5b54d6'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 32px ' + FONT;
    ctx.fillText(o.dead ? '✕' : String(o.num), x + 40, y + h / 2 + 2);
    ctx.font = '800 46px ' + FONT; ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    ctx.fillText(name, x + bw - 22, y + h / 2 + 3, tw);
    if (o.role) {
        const R = L.ROLE[o.role], t = R.icon + ' ' + R.n;
        ctx.font = '800 38px ' + FONT; const rw = ctx.measureText(t).width + 40;
        roundRect(ctx, (W - rw) / 2, y + h + 8, rw, 52, 26); ctx.fillStyle = R.c; ctx.fill();
        ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.fillText(t, W / 2, y + h + 36);
    }
    ctx.globalAlpha = 1;
    tex.needsUpdate = true;
}

function wrapLines(ctx, text, max, maxLines) {
    const words = text.split(/\s+/), lines = []; let cur = '';
    words.forEach((w) => { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > max && cur) { lines.push(cur); cur = w; } else cur = t; });
    if (cur) lines.push(cur);
    if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] += '…'; }
    return lines;
}

function makeBubble() {
    const c = document.createElement('canvas'); c.width = 640; c.height = 260;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 11; sp.userData = { c, tex, key: '' }; sp.scale.set(2.9, 2.9 * 260 / 640, 1); sp.visible = false;
    return sp;
}
function drawBubble(sp, text) {
    if (sp.userData.key === text) return; sp.userData.key = text;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H); ctx.direction = 'rtl'; ctx.font = '700 44px ' + FONT;
    const lines = wrapLines(ctx, text, 560, 3), lh = 54, bh = lines.length * lh + 34;
    const bw = Math.min(620, Math.max.apply(null, lines.map((l) => ctx.measureText(l).width)) + 50), x = (W - bw) / 2, y = H - bh - 26;
    roundRect(ctx, x, y, bw, bh, 28); ctx.fillStyle = '#fffdf6'; ctx.fill();
    ctx.beginPath(); ctx.moveTo(W / 2 - 18, y + bh - 1); ctx.lineTo(W / 2, H - 4); ctx.lineTo(W / 2 + 18, y + bh - 1); ctx.fill();
    ctx.fillStyle = '#1d1b26'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + 17 + lh / 2 + i * lh));
    tex.needsUpdate = true;
}

function makeBadge() {
    const c = document.createElement('canvas'); c.width = 128; c.height = 128;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = 12; sp.userData = { c, tex, key: '' }; sp.scale.set(0.75, 0.75, 1); sp.visible = false;
    return sp;
}
function drawBadge(sp, text, color) {
    const key = text + color; if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    ctx.beginPath(); ctx.arc(64, 64, 54, 0, TAU); ctx.fillStyle = color; ctx.fill();
    ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = '900 62px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 70);
    tex.needsUpdate = true;
}

// ---------------------------------------------------------------- الشخصية
const GEO = {
    head: new THREE.SphereGeometry(0.45, 32, 24),
    eye: new THREE.SphereGeometry(0.06, 12, 10),
    shine: new THREE.SphereGeometry(0.018, 8, 6),
    torso: new THREE.CapsuleGeometry(0.27, 0.26, 6, 16),
    limb: new THREE.CapsuleGeometry(0.085, 0.26, 4, 10),
    hand: new THREE.SphereGeometry(0.085, 12, 10),
    shoe: new THREE.SphereGeometry(0.11, 12, 10),
    cap: new THREE.SphereGeometry(0.475, 32, 16, 0, TAU, 0, 1.3),
    blob: new THREE.SphereGeometry(0.17, 12, 10),
    stool: new THREE.CylinderGeometry(0.3, 0.26, 0.42, 18)
};

/**
 * يبني شخصية تشيبي جالسة. opts.outfit = 'doctor'|'detective'|'shadow' للشخصيات الخاصة.
 * يرجع {root, body, head, armL, armR, eyes, mats} — root أصله عند الأرض تحت الحوض.
 */
function buildChar(look, opts) {
    opts = opts || {};
    const C = L.colors(look);
    const shadow = opts.outfit === 'shadow';
    const skinM = shadow ? mat('#0b0b10', { roughness: 1 }) : mat(C.skin, { roughness: 0.65 });
    const shirtC = opts.outfit === 'doctor' ? '#f4f6f8' : opts.outfit === 'detective' ? '#8a6a45' : shadow ? '#0b0b10' : C.shirt;
    const shirtM = mat(shirtC), pantsM = mat(shadow ? '#0b0b10' : opts.outfit === 'doctor' ? '#2c8f86' : C.pants), shoeM = mat(shadow ? '#000' : '#2a211c');
    const hairM = mat(C.hair, { roughness: 0.7 });
    const mats = [skinM, shirtM, pantsM, shoeM, hairM];

    const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
    // الجذع
    const torso = mesh(GEO.torso, shirtM, 0, 0.82, 0); body.add(torso);
    // أرجل جالسة: فخذ للأمام ثم ساق للأسفل
    [-1, 1].forEach((s) => {
        const th = mesh(GEO.limb, pantsM, s * 0.13, 0.5, 0.17); th.rotation.x = Math.PI / 2; body.add(th);
        const sh = mesh(GEO.limb, pantsM, s * 0.13, 0.26, 0.36); body.add(sh);
        const fo = mesh(GEO.shoe, shoeM, s * 0.13, 0.07, 0.42); fo.scale.set(1, 0.7, 1.35); body.add(fo);
    });
    // الذراعين: محور الكتف
    const arm = (s) => {
        const g = new THREE.Group(); g.position.set(s * 0.33, 1.0, 0);
        const a = mesh(GEO.limb, shirtM, 0, -0.2, 0); g.add(a);
        const h = mesh(GEO.hand, skinM, 0, -0.4, 0); g.add(h);
        g.rotation.x = -0.55; g.rotation.z = s * 0.12; body.add(g); return g;
    };
    const armL = arm(-1), armR = arm(1);

    // الرأس
    const head = new THREE.Group(); head.position.set(0, 1.42, 0); body.add(head);
    head.add(mesh(GEO.head, skinM));
    const eyeM = mat(shadow ? '#ff2a2a' : '#17110d', shadow ? { emissive: '#ff1a1a', emissiveIntensity: 3 } : { roughness: 0.3 });
    const shineM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const eyes = [];
    [-1, 1].forEach((s) => {
        const e = mesh(GEO.eye, eyeM, s * 0.15, 0.0, 0.405); e.scale.set(1, 1.35, 0.55); head.add(e); eyes.push(e);
        if (!shadow) { const sh = new THREE.Mesh(GEO.shine, shineM); sh.position.set(s * 0.15 + 0.02, 0.035, 0.44); head.add(sh); eyes.push(sh); }
    });
    if (!shadow) {
        const blushM = new THREE.MeshBasicMaterial({ color: '#f39a9a', transparent: true, opacity: 0.45, depthWrite: false });
        [-1, 1].forEach((s) => { const b = new THREE.Mesh(new THREE.CircleGeometry(0.06, 16), blushM); b.position.set(s * 0.25, -0.1, 0.375); b.rotation.y = s * 0.55; head.add(b); });
        const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16, Math.PI), mat('#7a3b2b'));
        mouth.position.set(0, -0.15, 0.43); mouth.rotation.z = Math.PI; head.add(mouth);
    }
    buildHair(head, opts.outfit ? (opts.outfit === 'detective' ? 'fedora' : opts.outfit === 'doctor' ? 'surgeon' : 'hood') : C.style, hairM, mats);

    root.userData.base = mats.map((m) => m.color.clone());
    return { root, body, head, armL, armR, eyes, mats, torso };
}

function buildHair(head, style, hairM, mats) {
    const cap = () => { const c = mesh(GEO.cap, hairM, 0, 0.02, -0.02); c.rotation.x = -0.42; return c; };
    switch (style) {
        case 0: head.add(cap()); break;
        case 1: {
            head.add(cap());
            const cone = new THREE.ConeGeometry(0.11, 0.3, 8);
            for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU; const s = mesh(cone, hairM, Math.cos(a) * 0.26, 0.42, Math.sin(a) * 0.26 - 0.05); s.lookAt(Math.cos(a) * 1.2, 1.4, Math.sin(a) * 1.2 - 0.2); s.rotateX(Math.PI / 2); head.add(s); }
            break;
        }
        case 2: {
            head.add(cap());
            const back = mesh(new THREE.CylinderGeometry(0.47, 0.52, 0.85, 24, 1, true, Math.PI / 2, Math.PI), hairM.clone(), 0, -0.3, -0.02);
            back.material.side = THREE.DoubleSide; mats.push(back.material); head.add(back);
            break;
        }
        case 3: head.add(cap()); [-1, 1].forEach((s) => head.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), hairM, s * 0.33, 0.36, -0.08))); break;
        case 4: {
            for (let i = 0; i < 26; i++) {
                const phi = Math.acos(1 - (i + 0.5) / 26 * 1.15), th = i * 2.399;
                const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
                if (z > 0.55 && y < 0.55) continue;   // نترك الوجه مكشوف
                head.add(mesh(GEO.blob, hairM, x * 0.47, y * 0.47 + 0.02, z * 0.47 - 0.03));
            }
            break;
        }
        case 5: {
            head.add(cap());
            const visor = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20, 1, false, -Math.PI / 2, Math.PI), hairM, 0, 0.2, 0.25); head.add(visor);
            break;
        }
        case 6: {
            const ghutraM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: canvasTex(128, 128, (ctx) => {
                ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#c4302b';
                for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) ctx.fillRect(x, y, 8, 8);
            }) });
            ghutraM.map.wrapS = ghutraM.map.wrapT = THREE.RepeatWrapping; ghutraM.map.repeat.set(3, 2);
            mats.push(ghutraM);
            const top = mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, TAU, 0, 1.45), ghutraM, 0, 0.02, -0.03); top.rotation.x = -0.25; head.add(top);
            const drape = mesh(new THREE.CylinderGeometry(0.49, 0.56, 0.72, 24, 1, true, Math.PI * 0.45, Math.PI * 1.1), ghutraM, 0, -0.3, -0.03); head.add(drape);
            const iqal = mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 28), mat('#141414'), 0, 0.3, -0.06); iqal.rotation.x = Math.PI / 2 - 0.3; head.add(iqal);
            break;
        }
        case 'fedora': {
            const fm = mat('#3a2c22');
            head.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28), fm, 0, 0.3, 0));
            head.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.36, 24), fm, 0, 0.48, 0));
            head.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.08, 24), mat('#16110d'), 0, 0.36, 0));
            break;
        }
        case 'surgeon': head.add(mesh(GEO.cap, mat('#3fb7a8'), 0, 0.04, -0.02)); break;
        case 'hood': {
            const hm = mat('#09090d', { roughness: 1 });
            const hood = mesh(new THREE.SphereGeometry(0.56, 24, 18, Math.PI / 2 + 0.75, TAU - 1.5, 0, 2.2), hm, 0, 0.04, -0.06);   // مفتوح من قدّام عشان تبان العيون الحمر hood.rotation.x = -0.2; head.add(hood);
            hood.material.side = THREE.DoubleSide;
            break;
        }
    }
}

// ---------------------------------------------------------------- المسرح
export function createStage(container, getFrame) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const NIGHT_SKY = new THREE.Color('#0d1024'), DAY_SKY = new THREE.Color('#e9a86a'), DUSK_SKY = new THREE.Color('#3a2440');
    scene.background = NIGHT_SKY.clone();
    scene.fog = new THREE.Fog(NIGHT_SKY.clone(), 26, 70);
    const camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 200);

    // ---------- إضاءة
    const hemi = new THREE.HemisphereLight('#8090ff', '#3a2016', 0.45); scene.add(hemi);
    const sky = new THREE.DirectionalLight('#9fb4ff', 0.5); sky.position.set(-14, 22, -10); sky.castShadow = true;
    sky.shadow.mapSize.set(2048, 2048); Object.assign(sky.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 }); sky.shadow.bias = -0.0005;
    scene.add(sky);
    const fireLight = new THREE.PointLight('#ff8a32', 30, 22, 1.6); fireLight.position.set(0, 1.4, 0); scene.add(fireLight);

    // ---------- الأرض والساحة
    const groundTex = canvasTex(1024, 1024, (ctx, W, H) => {
        ctx.fillStyle = '#6b4a3c'; ctx.fillRect(0, 0, W, H);
        const cx = W / 2, cy = H / 2;
        for (let ring = 0; ring < 14; ring++) {
            const r0 = 40 + ring * 34, r1 = r0 + 34, n = Math.floor(TAU * (r0 + 17) / 40);
            for (let i = 0; i < n; i++) {
                const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU;
                ctx.beginPath(); ctx.arc(cx, cy, r1 - 2, a0 + 0.004, a1 - 0.004); ctx.arc(cx, cy, r0 + 2, a1 - 0.004, a0 + 0.004, true); ctx.closePath();
                const v = (i + ring) % 2 ? 0 : 1, band = ring >= 3 && ring <= 4;
                ctx.fillStyle = band ? (v ? '#8e3d25' : '#7d3420') : (v ? '#8a6b5b' : '#76584b');
                ctx.fill();
            }
        }
        const g = ctx.createRadialGradient(cx, cy, 380, cx, cy, 512); g.addColorStop(0, 'rgba(60,38,30,0)'); g.addColorStop(1, 'rgba(60,38,30,1)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });
    const plaza = new THREE.Mesh(new THREE.CircleGeometry(16, 96), new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.95 }));
    plaza.rotation.x = -Math.PI / 2; plaza.receiveShadow = true; scene.add(plaza);
    const sand = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat('#4b3328', { roughness: 1 }));
    sand.rotation.x = -Math.PI / 2; sand.position.y = -0.01; sand.receiveShadow = true; scene.add(sand);

    // ---------- الأسوار
    const wallM = mat('#7c3f2c', { roughness: 0.95 }), wallTop = mat('#6d3626');
    function wall(x, z, w, h, d, rotY) {
        const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY || 0;
        g.add(mesh(new THREE.BoxGeometry(w, h, d), wallM, 0, h / 2, 0));
        const n = Math.floor(w / 1.1);
        for (let i = 0; i < n; i++) if (i % 2 === 0) g.add(mesh(new THREE.BoxGeometry(0.55, 0.5, d), wallTop, -w / 2 + 0.55 + i * 1.1, h + 0.25, 0));
        scene.add(g); return g;
    }
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * TAU + 0.3, r = 22 + (i % 3) * 2.5, h = 5 + (i % 4) * 1.6;
        wall(Math.cos(a) * r, Math.sin(a) * r, 8 + (i % 2) * 3, h, 3, -a + Math.PI / 2);
    }
    // ---------- نخيل
    const trunkM = mat('#5a3a24'), leafM = new THREE.MeshStandardMaterial({ color: '#2f6b2a', roughness: 0.8, side: THREE.DoubleSide });
    function palm(x, z, h) {
        const g = new THREE.Group(); g.position.set(x, 0, z);
        for (let i = 0; i < 8; i++) { const seg = mesh(new THREE.CylinderGeometry(0.17 - i * 0.008, 0.2 - i * 0.008, h / 8, 8), trunkM, Math.sin(i * 0.25) * 0.15 * i / 8, h / 16 + i * h / 8, 0); g.add(seg); }
        const leafGeo = new THREE.PlaneGeometry(0.8, 3.2, 1, 6);
        const pos = leafGeo.attributes.position; for (let i = 0; i < pos.count; i++) { const y = pos.getY(i); pos.setZ(i, -Math.pow((y + 1.6) / 3.2, 2) * 1.4); }
        leafGeo.computeVertexNormals(); leafGeo.translate(0, 1.6, 0); leafGeo.rotateX(Math.PI / 2);
        for (let i = 0; i < 9; i++) { const l = new THREE.Mesh(leafGeo, leafM); l.castShadow = true; l.position.set(0.1, h, 0); l.rotation.set(-0.35, (i / 9) * TAU, 0, 'YXZ'); g.add(l); }
        scene.add(g);
    }
    [[-13, -11, 7], [12, -13, 8], [15, 6, 6.5], [-15, 7, 7.5], [-6, -17, 6], [5, 17, 7]].forEach((p) => palm(p[0], p[1], p[2]));
    // ---------- فوانيس
    const lanterns = [];
    [[-13, -9], [13, -9], [-14, 9], [14, 9]].forEach(([x, z]) => {
        const g = new THREE.Group(); g.position.set(x, 0, z);
        g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 4.2, 8), mat('#2a1d16'), 0, 2.1, 0));
        g.add(mesh(new THREE.ConeGeometry(0.45, 0.45, 4), mat('#151010'), 0, 4.75, 0));
        const glass = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.42), new THREE.MeshStandardMaterial({ color: '#ffcf7a', emissive: '#ffae3a', emissiveIntensity: 2 }));
        glass.position.y = 4.3; g.add(glass);
        const pl = new THREE.PointLight('#ffb35c', 10, 12, 1.8); pl.position.y = 4.3; g.add(pl);
        lanterns.push({ pl, glass }); scene.add(g);
    });
    // ---------- القمر والنجوم
    const moon = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 24), new THREE.MeshBasicMaterial({ color: '#fff3d6' }));
    moon.position.set(-18, 26, -40); scene.add(moon);
    const glowTex = canvasTex(128, 128, (ctx) => { const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64); g.addColorStop(0, 'rgba(255,240,210,.9)'); g.addColorStop(0.3, 'rgba(255,230,190,.35)'); g.addColorStop(1, 'rgba(255,230,190,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 128); });
    const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    moonGlow.scale.set(16, 16, 1); moonGlow.position.copy(moon.position); scene.add(moonGlow);
    const starGeo = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 900; i++) { const a = Math.random() * TAU, e = 0.12 + Math.random() * 1.3, r = 90; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: '#ffffff', size: 0.35, transparent: true, fog: false }));
    scene.add(stars);

    // ---------- النار
    const fire = new THREE.Group(); scene.add(fire);
    const stoneM = mat('#2d2a2e', { roughness: 1 });
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; const s = mesh(new THREE.DodecahedronGeometry(0.28 + (i % 3) * 0.05), stoneM, Math.cos(a) * 1.05, 0.15, Math.sin(a) * 1.05); s.rotation.set(i, i * 2, i); fire.add(s); }
    const logM = mat('#3b2416');
    for (let i = 0; i < 4; i++) { const l = mesh(new THREE.CylinderGeometry(0.11, 0.13, 1.5, 8), logM, 0, 0.32, 0); l.rotation.set(0.95, (i / 4) * TAU, 0, 'YXZ'); fire.add(l); }
    const flames = [];
    const flameCols = ['#ff5a1a', '#ff9a2a', '#ffd34d', '#fff2b0'];
    flameCols.forEach((c, i) => {
        const f = new THREE.Mesh(new THREE.ConeGeometry(0.62 - i * 0.13, 1.9 - i * 0.3, 14, 1, true), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        f.position.y = 1.0 - i * 0.12; fire.add(f); flames.push(f);
    });
    const fireGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ff8a3a', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    fireGlow.scale.set(6, 6, 1); fireGlow.position.y = 1.1; fire.add(fireGlow);
    const SPARKS = 80, sparkGeo = new THREE.BufferGeometry(), sparkPos = new Float32Array(SPARKS * 3), sparkSeed = [];
    for (let i = 0; i < SPARKS; i++) sparkSeed.push({ a: Math.random() * TAU, r: Math.random() * 0.5, sp: 0.6 + Math.random(), off: Math.random() });
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
    const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ color: '#ffb347', size: 0.09, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fire.add(sparks);

    // ---------- غرفة التحقيق (بعيدة عن الساحة، الكاميرا تنتقل لها)
    const ROOM = new THREE.Vector3(80, 0, 0);
    const room = new THREE.Group(); room.position.copy(ROOM); scene.add(room);
    const roomBox = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 10), new THREE.MeshStandardMaterial({ color: '#2b2a33', roughness: 1, side: THREE.BackSide, map: canvasTex(256, 256, (ctx) => { ctx.fillStyle = '#34323c'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = '#26242c'; ctx.lineWidth = 4; for (let y = 0; y < 256; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); for (let x = (y / 32) % 2 ? 0 : 32; x < 256; x += 64) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 32); ctx.stroke(); } } }) }));
    roomBox.material.map.wrapS = roomBox.material.map.wrapT = THREE.RepeatWrapping; roomBox.material.map.repeat.set(3, 2);
    roomBox.position.y = 3; roomBox.receiveShadow = true; room.add(roomBox);
    const table = new THREE.Group(); room.add(table);
    table.add(mesh(new THREE.BoxGeometry(2.4, 0.12, 1.4), mat('#4a3324'), 0, 1.0, 0));
    [[-1.05, -0.55], [1.05, -0.55], [-1.05, 0.55], [1.05, 0.55]].forEach(([x, z]) => table.add(mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), mat('#3a281c'), x, 0.5, z)));
    const folder = mesh(new THREE.BoxGeometry(0.5, 0.03, 0.36), mat('#d9b56a'), 0.35, 1.08, 0.1); folder.rotation.y = 0.3; table.add(folder);
    const lampPivot = new THREE.Group(); lampPivot.position.set(0, 6, 0); room.add(lampPivot);
    lampPivot.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 2.6, 6), mat('#111'), 0, -1.3, 0));
    const shade = mesh(new THREE.ConeGeometry(0.45, 0.4, 20, 1, true), mat('#1d2a22', { side: THREE.DoubleSide }), 0, -2.75, 0); lampPivot.add(shade);
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: '#fff4c8' })); bulb.position.y = -2.85; lampPivot.add(bulb);
    const spot = new THREE.SpotLight('#ffe6a8', 110, 10, 0.62, 0.4, 1.1); spot.position.set(0, -2.8, 0); spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.9, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#ffe6a8', transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -4.3; lampPivot.add(beam);
    const roomFill = new THREE.PointLight('#ffb36b', 6, 12, 1.4); roomFill.position.set(3, 3.5, 3); room.add(roomFill);
    const roomRim = new THREE.PointLight('#5f7bff', 5, 10, 1.4); roomRim.position.set(-3.5, 3, -3.5); room.add(roomRim);
    lampPivot.add(spot); const spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -6, 0); lampPivot.add(spotTarget); spot.target = spotTarget;
    const detective = buildChar({ skin: 1 }, { outfit: 'detective' }); detective.root.position.set(0, 0, 1.35); detective.root.rotation.y = Math.PI; room.add(detective.root);
    const susp = buildChar({}, { outfit: 'shadow' }); susp.root.position.set(0, 0, -1.35); room.add(susp.root);
    [detective, susp].forEach((c) => { const st = mesh(GEO.stool, mat('#3a281c'), 0, 0.21, 0); c.root.add(st); c.body.position.y = 0.0; });
    const glass = new THREE.Group();
    glass.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 20), mat('#c9a24a', { metalness: 0.6, roughness: 0.3 })));
    glass.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28, 8), mat('#3a2416'), 0, -0.27, 0));
    glass.position.set(0, -0.48, 0.05); detective.armR.add(glass);
    const qTag = makeSprite(1.1); room.add(qTag); qTag.position.set(0, 2.55, -1.35);
    (function () { const { c, tex } = qTag.userData, ctx = c.getContext('2d'); ctx.font = '900 130px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff4d4d'; ctx.fillText('?', 256, 86); tex.needsUpdate = true; })();

    // ---------- المافيا والطبيب (شخصيات المشاهد)
    const mafioso = buildChar({}, { outfit: 'shadow' }); scene.add(mafioso.root); mafioso.root.visible = false;
    standUp(mafioso);
    const cloak = mesh(new THREE.ConeGeometry(0.62, 1.5, 20, 1, true), mat('#09090d', { side: THREE.DoubleSide, roughness: 1 }), 0, 0.75, 0); mafioso.body.add(cloak);
    const knife = new THREE.Group();
    knife.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.11), mat('#d7dde6', { metalness: 0.9, roughness: 0.2 }), 0, -0.3, 0));
    knife.add(mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), mat('#2a1a10'), 0, 0, 0));
    knife.position.set(0, -0.42, 0); mafioso.armR.add(knife);
    const evilLight = new THREE.PointLight('#ff2a2a', 0, 7, 1.3); scene.add(evilLight);
    const doctor = buildChar({ skin: 2 }, { outfit: 'doctor' }); scene.add(doctor.root); doctor.root.visible = false; standUp(doctor);
    const bag = new THREE.Group(); bag.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.2), mat('#b22a2a')));
    bag.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.205), mat('#ffffff'))); bag.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.205), mat('#ffffff')));
    bag.position.set(0, -0.5, 0.05); doctor.armL.add(bag);
    const healLight = new THREE.PointLight('#5dff9a', 0, 6, 1.5); scene.add(healLight);
    const HEAL = 60, healGeo = new THREE.BufferGeometry(), healPos = new Float32Array(HEAL * 3);
    healGeo.setAttribute('position', new THREE.BufferAttribute(healPos, 3));
    const healPts = new THREE.Points(healGeo, new THREE.PointsMaterial({ color: '#7dffb0', size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(healPts); healPts.visible = false;
    const healRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 40), new THREE.MeshBasicMaterial({ color: '#6dffa6', transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    healRing.rotation.x = -Math.PI / 2; scene.add(healRing); healRing.visible = false;

    // ---------- القفص (حكم الطرد)
    const cage = new THREE.Group(); scene.add(cage); cage.visible = false;
    const barM = mat('#6c6f78', { metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; cage.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), barM, Math.cos(a) * 0.95, 1.3, Math.sin(a) * 0.95)); }
    cage.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 28), barM, 0, 2.62, 0));
    const cageRing = mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 30), barM, 0, 0.05, 0); cageRing.rotation.x = Math.PI / 2; cage.add(cageRing);
    cage.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16), barM, 0, 2.85, 0));
    const verdictSpot = new THREE.SpotLight('#fff2cc', 0, 18, 0.32, 0.5, 1.2); verdictSpot.castShadow = true; scene.add(verdictSpot); scene.add(verdictSpot.target);

    // ---------- احتفال
    const CONF = 260, confGeo = new THREE.BufferGeometry(), confPos = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3), confSeed = [];
    const confPal = ['#ffd34d', '#ff5a7a', '#4dc3ff', '#7dff9a', '#c18cff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONF; i++) { confSeed.push({ x: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16, sp: 1 + Math.random() * 1.5, off: Math.random() * 10, w: Math.random() * TAU }); const c = confPal[i % confPal.length]; confCol.set([c.r, c.g, c.b], i * 3); }
    confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3)); confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
    const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true })); confetti.visible = false; scene.add(confetti);

    // ---------------------------------------------------------------- اللاعبين
    const chars = new Map();   // id -> {c, stool, tag, bubble, badge, seat, angle, lookKey}
    function seatPos(i, n) {
        const r = Math.max(3.4, Math.min(7.2, 2.6 + n * 0.32)), a = (i / n) * TAU + Math.PI / 2;
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, r };
    }
    function syncPlayers(list) {
        const ids = new Set(list.map((p) => p.id));
        chars.forEach((v, id) => { if (!ids.has(id)) { scene.remove(v.group); chars.delete(id); } });
        list.forEach((p, i) => {
            let v = chars.get(p.id); const lookKey = JSON.stringify(p.look || {});
            if (v && v.lookKey !== lookKey) { scene.remove(v.group); chars.delete(p.id); v = null; }
            if (!v) {
                const group = new THREE.Group(), c = buildChar(p.look);
                const stool = mesh(GEO.stool, mat('#4a3020'), 0, 0.21, 0);
                group.add(stool); group.add(c.root);
                const tag = makeSprite(0.62), bubble = makeBubble(), badge = makeBadge();
                group.add(tag); group.add(bubble); group.add(badge);
                scene.add(group);
                v = { group, c, stool, tag, bubble, badge, lookKey, enter: performance.now() };
                chars.set(p.id, v);
            }
            const s = seatPos(i, list.length);
            v.seat = s; v.num = i + 1; v.p = p;
            v.group.position.set(s.x, 0, s.z);
            v.group.rotation.y = Math.atan2(-s.x, -s.z);   // وجهه للنار
        });
    }
    function standUp(c) {
        // وضع الوقوف (للمافيا والطبيب): الفخذ ينزل تحت الجذع والجسم كله يرتفع
        c.body.children.forEach((m) => {
            if (m.geometry === GEO.limb) {
                if (Math.abs(m.rotation.x - Math.PI / 2) < 0.01) { m.rotation.x = 0; m.position.set(m.position.x, 0.6, 0); }
                else m.position.set(m.position.x, 0.24, 0);
            } else if (m.geometry === GEO.shoe) m.position.set(m.position.x, 0.07, 0.06);
            else m.position.y += 0.3;
        });
    }

    function setGrey(c, k) {
        c.mats.forEach((m, i) => { const base = c.root.userData.base[i]; if (!base) return; const g = (base.r + base.g + base.b) / 3; m.color.setRGB(lerp(base.r, g * 0.55, k), lerp(base.g, g * 0.55, k), lerp(base.b, g * 0.6, k)); });
    }

    // ---------------------------------------------------------------- الإضاءة حسب المرحلة
    let dayK = 0;   // 0 ليل · 1 نهار
    function applyLight(target, dt) {
        dayK += (target - dayK) * Math.min(1, dt * 1.6);
        const k = dayK;
        if (k < 0.5) scene.background.copy(NIGHT_SKY).lerp(DUSK_SKY, k * 2); else scene.background.copy(DUSK_SKY).lerp(DAY_SKY, (k - 0.5) * 2);
        scene.fog.color.copy(scene.background);
        hemi.color.set('#8090ff').lerp(new THREE.Color('#ffe2b8'), k); hemi.intensity = lerp(0.45, 1.0, k);
        sky.color.set('#9fb4ff').lerp(new THREE.Color('#ffd29a'), k); sky.intensity = lerp(0.45, 2.2, k);
        sky.position.set(lerp(-14, 16, k), lerp(22, 18, k), lerp(-10, -6, k));
        stars.material.opacity = 1 - k; moon.visible = moonGlow.visible = k < 0.8;
        moon.position.y = lerp(26, 8, k);
        lanterns.forEach((l) => { l.pl.intensity = lerp(10, 1, k); l.glass.material.emissiveIntensity = lerp(2, 0.4, k); });
        renderer.toneMappingExposure = lerp(1.05, 0.95, k);
    }

    // ---------------------------------------------------------------- الكاميرا
    const camPos = new THREE.Vector3(0, 8, 14), camLook = new THREE.Vector3(0, 1, 0);
    let shake = 0, lastShotKey = '', snapNext = false;
    const camTarget = new THREE.Vector3(), lookTarget = new THREE.Vector3();
    function setCam(px, py, pz, lx, ly, lz) {
        camTarget.set(px, py, pz); lookTarget.set(lx, ly, lz);
        camPos.lerp(camTarget, 0.06); camLook.lerp(lookTarget, 0.06);
    }
    function orbit(t, r, h, speed) { const a = t * (speed || 0.05) + 0.6; setCam(Math.sin(a) * r, h, Math.cos(a) * r, 0, 1.0, 0); }
    function seatWorld(v, out) { return (out || new THREE.Vector3()).set(v.seat.x, 0, v.seat.z); }

    // ---------------------------------------------------------------- معلومات اللقطة الحالية (للافتات)
    let info = { shot: null };
    function currentShot(G, now) {
        if (!G || G.phase !== 'dawn' || !G.seq) return null;
        const t = now - G.phaseAt;
        for (let i = G.seq.length - 1; i >= 0; i--) if (t >= G.seq[i].at) return { s: G.seq[i], u: t - G.seq[i].at };
        return G.seq[0] ? { s: G.seq[0], u: 0 } : null;
    }

    // ---------------------------------------------------------------- الحلقة
    let last = performance.now(), stopped = false;
    const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3();

    function resize() {
        const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    addEventListener('resize', resize); resize();

    function frame() {
        if (stopped) return;
        requestAnimationFrame(frame);
        const pnow = performance.now(), dt = Math.min(0.1, (pnow - last) / 1000); last = pnow;
        const T = pnow / 1000;
        const F = getFrame() || {}, G = F.G, now = F.now || Date.now();
        const lobbyPlayers = (F.room && F.room.players) || [];
        const plist = G ? G.players.slice().sort((a, b) => a.seat - b.seat) : lobbyPlayers;
        syncPlayers(plist);
        const phase = G ? G.phase : 'lobby';
        const sh = currentShot(G, now);
        info = { shot: sh ? sh.s.k : null, u: sh ? sh.u : 0, s: sh ? sh.s : null };

        // ----- النار
        flames.forEach((f, i) => { const k = 1 + Math.sin(T * (9 + i * 3) + i) * 0.08 + Math.sin(T * 23 + i * 5) * 0.05; f.scale.set(1 + Math.sin(T * 7 + i) * 0.06, k, 1 + Math.cos(T * 8 + i) * 0.06); f.rotation.y = T * (0.6 + i * 0.3); });
        fireLight.intensity = 26 + Math.sin(T * 13) * 3 + Math.sin(T * 31) * 2;
        for (let i = 0; i < SPARKS; i++) { const s = sparkSeed[i], u = (T * s.sp * 0.5 + s.off) % 1; sparkPos[i * 3] = Math.cos(s.a + u * 3) * (s.r + u * 0.3); sparkPos[i * 3 + 1] = 0.6 + u * 3.6; sparkPos[i * 3 + 2] = Math.sin(s.a + u * 3) * (s.r + u * 0.3); }
        sparkGeo.attributes.position.needsUpdate = true;

        // ----- الإضاءة
        let dayTarget = phase === 'day' || phase === 'vote' || phase === 'verdict' || phase === 'over' ? 1 : phase === 'reveal' || phase === 'lobby' ? 0.15 : 0;
        if (sh && sh.s.k === 'result') dayTarget = ease(sh.u / 3500);
        applyLight(dayTarget, dt);

        // ----- الشخصيات
        const speakers = {};
        if (G && G.chat) G.chat.forEach((m) => { if (m.from && now - m.at < 6000) speakers[m.from] = m; });
        const votes = (G && G.votes) || {}, tally = {};
        Object.keys(votes).forEach((k) => { const t = votes[k]; if (t && t !== 'skip') tally[t] = (tally[t] || 0) + 1; });
        const sleeping = phase === 'night' || (sh && sh.s.k !== 'result');

        chars.forEach((v, id) => {
            const p = v.p, c = v.c, ph = id.charCodeAt(1) * 0.7 + v.num;
            let alive = p.alive !== false, fallK = 0;
            // لقطة الهجوم/الإنقاذ على هذا اللاعب
            if (sh && sh.s.target === id) {
                if (sh.s.k === 'attack') fallK = ease(span(sh.u, 3600, 4400));
                if (sh.s.k === 'save') fallK = 1 - ease(span(sh.u, 3800, 4800));
            }
            if (!alive) fallK = 1;
            // وضع الجلوس الأساسي
            c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
            c.body.position.y = 0.0;
            c.head.rotation.set(0, Math.sin(T * 0.6 + ph) * 0.18, 0);
            c.torso.scale.y = 1 + Math.sin(T * 2 + ph) * 0.025;
            c.armL.rotation.set(-0.55, 0, -0.12); c.armR.rotation.set(-0.55, 0, 0.12);
            const eyeOpen = sleeping && alive && fallK === 0 ? 0.12 : 1;
            c.eyes.forEach((e, i) => { e.scale.y = (i % 2 === 0 || c.eyes.length === 2 ? 1.35 : 1) * eyeOpen; e.visible = !(eyeOpen < 1 && i % 2 === 1); });
            if (sleeping && alive && fallK === 0) { c.head.rotation.x = 0.32 + Math.sin(T * 1.2 + ph) * 0.04; c.head.rotation.z = 0.12; }
            if (speakers[id] && alive) { c.head.rotation.x = Math.sin(T * 14) * 0.06; c.armR.rotation.x = -1.1 + Math.sin(T * 6) * 0.25; }
            if (phase === 'vote' && votes[id] && alive) { c.armR.rotation.set(-2.9, 0, 0.2); }
            if (phase === 'over' && G && alive) {
                const won = G.winner && p.role && L.ROLE[p.role].team === G.winner;
                if (won) { c.root.position.y = Math.abs(Math.sin(T * 5 + ph)) * 0.45; c.armL.rotation.set(-2.8, 0, -0.3); c.armR.rotation.set(-2.8, 0, 0.3); }
            }
            if (fallK > 0) {
                // يطيح على جنبه بجانب الكرسي
                c.root.rotation.z = fallK * Math.PI / 2 * 0.98; c.root.position.x = -fallK * 0.55; c.root.position.y = fallK * 0.28;
                c.head.rotation.set(0, 0, 0);
            }
            setGrey(c, !alive ? 0.85 : fallK * 0.3);
            // اللافتات
            let revealDead = !alive;
            const hideRoleNow = phase === 'verdict' && G.verdict && G.verdict.id === id && now - G.phaseAt < 4200;
            drawTag(v.tag, { name: p.name, num: v.num, dead: revealDead && !(phase === 'verdict' && G.verdict && G.verdict.id === id), role: p.role && (revealDead || phase === 'over') && !hideRoleNow ? p.role : null, ring: speakers[id] ? '#ffd34d' : null });
            v.tag.position.set(0, revealDead ? 1.25 : 2.45, 0);
            // المطرود بالتصويت راح مع القفص: يبقى كرسيه فاضي واسمه عليه
            c.root.visible = !(revealDead && p.cause === 'vote');
            const sp = speakers[id];
            v.bubble.visible = !!(sp && alive && (phase === 'day' || phase === 'vote'));
            if (v.bubble.visible) { drawBubble(v.bubble, sp.text); v.bubble.position.set(0, 3.55, 0); }
            const n = tally[id] || 0;
            v.badge.visible = (phase === 'vote' || phase === 'verdict') && n > 0 && alive;
            if (v.badge.visible) { drawBadge(v.badge, String(n), '#e2483d'); v.badge.position.set(0, v.bubble.visible ? 4.6 : 3.2, 0); }
            // دخول لاعب جديد باللوبي: يطلع من الأرض
            const ek = ease(span(pnow - v.enter, 0, 700)); v.group.scale.setScalar(0.3 + ek * 0.7);
        });

        // ----- المشاهد الخاصة
        mafioso.root.visible = false; doctor.root.visible = false; evilLight.intensity = 0; healPts.visible = false; healRing.visible = false; healLight.intensity = 0;
        cage.visible = false; verdictSpot.intensity = 0; confetti.visible = false;
        let cam = null;   // [px,py,pz, lx,ly,lz, snap]

        if (sh) {
            const s = sh.s, u = sh.u, vt = s.target && chars.get(s.target);
            if (s.k === 'intro') {
                const k = ease(u / s.dur);
                cam = [lerp(0, -6, k), lerp(9, 16, k), lerp(15, 22, k), -10 * k, lerp(1, 12, k), -20 * k];
            } else if (s.k === 'inspect') {
                const k = u / s.dur;
                lampPivot.rotation.z = Math.sin(u / 600) * 0.22;
                const slam = u > 3200 && u < 3700;
                detective.armR.rotation.set(slam ? -1.2 : -0.9 + Math.sin(u / 400) * 0.1, 0, 0.2);
                detective.armL.rotation.set(slam ? -1.6 + span(u, 3200, 3400) * 0.9 : -0.55, 0, -0.12);
                detective.head.rotation.set(0.1, Math.sin(u / 900) * 0.25, 0);
                susp.head.rotation.set(-0.05, Math.sin(u / 500) * 0.1, 0);
                if (u > 3200 && u < 3500) shake = 0.18;
                qTag.material.opacity = 0.6 + Math.sin(u / 200) * 0.4;
                // جانبية: المحقق يمين والمشتبه يسار والطاولة بينهم، والكاميرا تقترب ببطء
                const a = lerp(1.45, 1.68, ease(k)), d = lerp(4.9, 4.2, ease(k));
                cam = [ROOM.x + Math.sin(a) * d, lerp(2.7, 2.3, k), ROOM.z + Math.cos(a) * d, ROOM.x, 1.3, ROOM.z];
                hemi.intensity = 0.06; sky.intensity = 0;
            } else if ((s.k === 'attack' || s.k === 'save') && vt) {
                const p = seatWorld(vt, tmp), dir = tmp2.copy(p).normalize();
                if (s.k === 'attack') {
                    // يظهر من الظلام خلف الضحية، يرفع السكين ويطعن
                    mafioso.root.visible = true;
                    const appear = ease(span(u, 400, 2400));
                    const back = 1.1 + (1 - appear) * 3.5;
                    mafioso.root.position.set(p.x + dir.x * back, 0, p.z + dir.z * back);
                    mafioso.root.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
                    mafioso.root.scale.setScalar(1.05);
                    const raise = ease(span(u, 2400, 3300)), strike = ease(span(u, 3450, 3650));
                    mafioso.armR.rotation.set(-0.5 - raise * 2.6 + strike * 2.2, 0, 0.15);
                    mafioso.armL.rotation.set(-0.4 - raise * 0.6, 0, -0.2);
                    mafioso.head.rotation.set(0.15 - raise * 0.2, Math.sin(u / 300) * 0.05, 0);
                    mafioso.eyes.forEach((e) => { e.material.emissiveIntensity = 2 + raise * 6; });
                    evilLight.position.set(mafioso.root.position.x - dir.x * 0.8, 2.6, mafioso.root.position.z - dir.z * 0.8);
                    evilLight.intensity = appear * (14 + raise * 16);
                    if (u > 3500 && u < 3800) shake = 0.25;
                    const side = new THREE.Vector3(-dir.z, 0, dir.x);
                    const k = ease(u / s.dur);
                    const camBase = p.clone().addScaledVector(dir, -Math.min(3.4, vt.seat.r - 1.6) + k * 0.8).addScaledVector(side, 2.4);
                    cam = [camBase.x, lerp(3.2, 2.3, k), camBase.z, p.x + dir.x * 0.6, 1.3, p.z + dir.z * 0.6];
                } else {
                    // الطبيب يركض من النار للمصاب، يركع، وهالة خضراء ترجعه
                    doctor.root.visible = true;
                    const run = ease(span(u, 0, 2000));
                    const from = new THREE.Vector3(-dir.z * 6, 0, dir.x * 6).add(p);
                    const to = p.clone().addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 1.1);
                    doctor.root.position.lerpVectors(from, to, run);
                    doctor.root.position.y = run < 1 ? Math.abs(Math.sin(u / 90)) * 0.15 : 0;
                    doctor.root.lookAt(p.x, 0, p.z);
                    const swing = run < 1 ? Math.sin(u / 90) * 0.9 : 0;
                    doctor.armL.rotation.set(-0.3 + swing, 0, -0.15); doctor.armR.rotation.set(run < 1 ? -0.3 - swing : -1.4 + Math.sin(u / 160) * 0.15, 0, 0.15);
                    const kneel = ease(span(u, 2000, 2400)); doctor.root.position.y -= kneel * 0.25;
                    const healK = span(u, 2200, 5200);
                    if (healK > 0 && healK < 1) {
                        healPts.visible = true; healRing.visible = true;
                        healLight.position.set(p.x, 1.2, p.z); healLight.intensity = Math.sin(healK * Math.PI) * 25;
                        for (let i = 0; i < HEAL; i++) { const q = (healK * 2 + i / HEAL) % 1, a = i * 2.4 + u / 500; healPos[i * 3] = p.x + Math.cos(a) * (0.9 - q * 0.6); healPos[i * 3 + 1] = q * 2.6; healPos[i * 3 + 2] = p.z + Math.sin(a) * (0.9 - q * 0.6); }
                        healGeo.attributes.position.needsUpdate = true;
                        healRing.position.set(p.x, 0.05 + healK * 1.8, p.z); healRing.scale.setScalar(1 + healK); healRing.material.opacity = 1 - healK;
                    }
                    const side = new THREE.Vector3(-dir.z, 0, dir.x);
                    // من خارج الحلقة وفوق: نشوف المصاب والطبيب جاي من الجنب والنار خلفهم
                    const camBase = p.clone().addScaledVector(dir, 3.6).addScaledVector(side, -2.2);
                    cam = [camBase.x, 3.6, camBase.z, p.x - dir.x * 0.4, 0.7, p.z - dir.z * 0.4];
                }
            } else if (s.k === 'quiet') {
                mafioso.root.visible = u < 3500;
                const k = span(u, 0, 3500);
                const a = 2.2 + k * 0.6;
                mafioso.root.position.set(Math.cos(a) * 11, 0, Math.sin(a) * 11);
                mafioso.root.lookAt(0, 0, 0); mafioso.root.rotateY(k > 0.6 ? Math.PI * ease(span(k, 0.6, 0.8)) : 0);
                mafioso.armR.rotation.set(-0.5, 0, 0.15);
                evilLight.position.set(Math.cos(a) * 10, 2.6, Math.sin(a) * 10); evilLight.intensity = mafioso.root.visible ? 18 : 0;
                cam = [Math.cos(a - 0.25) * 5.5, 2.4, Math.sin(a - 0.25) * 5.5, Math.cos(a) * 11, 1.4, Math.sin(a) * 11];
            } else if (s.k === 'result') {
                const k = ease(u / s.dur);
                cam = [lerp(0, 2, k), lerp(13, 8.5, k), lerp(15.5, 12.5, k), 0, 1, 0];
            }
        }

        if (!cam) {
            const t = T;
            if (phase === 'verdict' && G && G.verdict && G.verdict.id && chars.get(G.verdict.id)) {
                const v = chars.get(G.verdict.id), u = now - G.phaseAt, p = seatWorld(v, tmp), dir = tmp2.copy(p).normalize();
                cage.visible = true;
                const drop = ease(span(u, 1800, 2700)), lift = ease(span(u, 5200, 8000));
                cage.position.set(p.x, lerp(14, 0, drop) + lift * 14, p.z);
                if (u > 2650 && u < 2900) shake = 0.2;
                v.group.position.y = lift * 14;
                verdictSpot.position.set(p.x, 12, p.z); verdictSpot.target.position.set(p.x, 0, p.z); verdictSpot.intensity = 220 * ease(span(u, 0, 900));
                // المطرود واقف وخايف
                v.c.root.rotation.z = 0; v.c.root.position.set(0, 0, 0); setGrey(v.c, 0);
                v.c.armL.rotation.set(-2.6, 0, -0.4); v.c.armR.rotation.set(-2.6, 0, 0.4); v.c.head.rotation.set(-0.2, Math.sin(u / 120) * 0.15, 0);
                v.tag.position.y = 2.45;
                const camBase = p.clone().addScaledVector(dir, -Math.min(4, v.seat.r - 1)).addScaledVector(new THREE.Vector3(-dir.z, 0, dir.x), 2.5);
                cam = [camBase.x, 3.2 + lift * 7.7, camBase.z, p.x, 1.3 + lift * 14, p.z];
                v.c.root.visible = true;
            } else if (phase === 'over') {
                confetti.visible = true;
                for (let i = 0; i < CONF; i++) { const s = confSeed[i], y = 12 - ((t * s.sp + s.off) % 12); confPos[i * 3] = s.x + Math.sin(t * 2 + s.w) * 0.5; confPos[i * 3 + 1] = y; confPos[i * 3 + 2] = s.z + Math.cos(t * 2 + s.w) * 0.5; }
                confGeo.attributes.position.needsUpdate = true;
                orbit(t, 13, 6, 0.12);
            } else if (phase === 'night') orbit(t, 12, 4.2, 0.03);
            else if (phase === 'vote') orbit(t, 13, 7.5, 0.04);
            else if (phase === 'day') orbit(t, 13.5, 6, 0.05);
            else orbit(t, 14, 6.5, 0.04);
        }
        if (cam) { camPos.set(cam[0], cam[1], cam[2]); camLook.set(cam[3], cam[4], cam[5]); }   // اللقطات محسوبة من الوقت مباشرة

        // كل تغيّر لقطة أو مرحلة = قطع مباشر للكاميرا (بدون طيران بين الأماكن)
        const shotKey = sh ? 'shot' + sh.s.at : phase + (G ? G.phaseAt : '');
        if (shotKey !== lastShotKey) { lastShotKey = shotKey; if (cam) { camPos.set(cam[0], cam[1], cam[2]); camLook.set(cam[3], cam[4], cam[5]); } else snapNext = true; }
        else if (snapNext) { snapNext = false; camPos.copy(camTarget); camLook.copy(lookTarget); }

        shake *= Math.pow(0.02, dt);
        camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
        camera.lookAt(camLook);
        renderer.render(scene, camera);
    }
    requestAnimationFrame(frame);

    return {
        shotInfo: () => info,
        /** موضع لاعب على الشاشة (0..1) — لعرض عناصر HTML فوق الشخصية إذا احتجنا */
        screenOf(id) { const v = chars.get(id); if (!v) return null; const p = v.group.position.clone(); p.y += 2.5; p.project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; },
        dispose() { stopped = true; removeEventListener('resize', resize); renderer.dispose(); }
    };
}
