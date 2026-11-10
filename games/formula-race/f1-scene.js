/**
 * سباق الفورمولا — المشهد ثلاثي الأبعاد (عرض فقط، الحسابات كلها في f1-game.js).
 *
 * mountRace(el, { track, trackPoint }) → {
 *   setCars(list)              // مزامنة السيارات حسب id (إنشاء/حذف/تحديث)
 *   update(states)             // كل فريم: [{id, x, z, heading, speed, throttle, fx}]
 *   setCamera(mode, focusId)   // orbit | tv | onboard | heli | trackside
 *   setLights(n)               // أضواء البداية على الجسر (0..5)
 *   setPhase(phase)            // lobby | finish
 *   burst(id, kind)            // مؤثر هدية/تكبيس
 *   stop()
 * }
 *
 * مبني بأشكال إجرائية + CanvasTexture (بدون ملفات موديلات)، Three.js 0.160.0.
 */
import * as T from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const FONT = '"IBM Plex Sans Arabic", "Cairo", sans-serif';

// ---------- أدوات ----------
function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new T.CanvasTexture(c);
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; }
    return t;
}

/** دمج أشكال بسيطة (بعد تطبيق مصفوفاتها) في شكل واحد لتقليل draw calls. */
function merge(parts) {
    const pos = [], nor = [];
    for (const [g0, m] of parts) {
        const g = (g0.index ? g0.toNonIndexed() : g0.clone());
        g.applyMatrix4(m);
        pos.push(...g.attributes.position.array);
        nor.push(...g.attributes.normal.array);
        g.dispose(); if (g0 !== g) g0.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    return out;
}
const M = (x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), new T.Vector3(sx, sy, sz));

/** شريط على طول المضمار بين إزاحتين جانبيتين (a,b) — للأسفلت، الكيربات، المناطق الآمنة. */
function ribbon(track, a, b, y, { vScale = 10, filter = null, colorFn = null } = {}) {
    const N = track.count, pos = [], uv = [], col = [], idx = [];
    let vi = 0, prev = false;
    for (let i = 0; i <= N; i++) {
        const k = i % N;
        const on = !filter || filter(k);
        if (!on) { prev = false; continue; }
        const h = track.heading[k], lx = Math.cos(h), lz = -Math.sin(h);
        const x = track.x[k], z = track.z[k];
        pos.push(x + lx * a, y, z + lz * a, x + lx * b, y, z + lz * b);
        const v = i * track.step / vScale;
        uv.push(0, v, 1, v);
        if (colorFn) { const c = colorFn(k); col.push(c.r, c.g, c.b, c.r, c.g, c.b); }
        if (prev) { const p = vi - 2; idx.push(p, p + 1, vi, p + 1, vi + 1, vi); }
        vi += 2; prev = true;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    if (colorFn) g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals();
    // الاتجاه قد يعكس الوجه — نضمن أن الطبيعي لفوق
    const n = g.attributes.normal; let up = 0; for (let i = 0; i < n.count; i++) up += n.getY(i);
    if (up < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i]; ix[i] = ix[i + 1]; ix[i + 1] = t; } g.computeVertexNormals(); }
    return g;
}

/** جدار عمودي على إزاحة جانبية ثابتة (حواجز). */
function wall(track, off, h, every = 1) {
    const N = track.count, pos = [], uv = [], idx = [];
    let vi = 0;
    for (let i = 0; i <= N; i += every) {
        const k = i % N, hd = track.heading[k], lx = Math.cos(hd), lz = -Math.sin(hd);
        const x = track.x[k] + lx * off, z = track.z[k] + lz * off;
        pos.push(x, 0, z, x, h, z);
        const v = i * track.step / 4; uv.push(v, 0, v, 1);
        if (i) { const p = vi - 2; idx.push(p, vi, p + 1, p + 1, vi, vi + 1); }
        vi += 2;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}

// ---------- سيارة الفورمولا ----------
const SHARED = {};
function sharedCarGeos() {
    if (SHARED.body) return SHARED;
    const box = (w, h, l) => new T.BoxGeometry(w, h, l);
    // الطول ~5.4م باتجاه +z (المقدمة)
    SHARED.body = merge([
        [box(0.86, 0.5, 2.6), M(0, 0.42, 0.1)],                                // الهيكل الأحادي
        [new T.CylinderGeometry(0.1, 0.36, 1.9, 10), M(0, 0.36, 2.25, Math.PI / 2, 0, 0, 1, 1, 0.55)], // الأنف
        [box(0.62, 0.42, 1.5), M(0.62, 0.36, -0.1, 0, 0, 0, 1, 1, 1)],         // الجنب يمين
        [box(0.62, 0.42, 1.5), M(-0.62, 0.36, -0.1)],                          // الجنب يسار
        [box(0.7, 0.62, 1.4), M(0, 0.78, -0.75, -0.18, 0, 0)],                 // غطاء المحرك
        [new T.CylinderGeometry(0.12, 0.3, 1.0, 8), M(0, 0.9, -1.55, Math.PI / 2 - 0.12, 0, 0, 1, 1, 0.9)], // ذيل الغطاء (زعنفة)
        [box(0.06, 0.62, 1.4), M(0, 1.22, -1.2)],                              // زعنفة القرش
        [box(1.9, 0.06, 0.55), M(0, 0.94, -2.35)],                             // الجناح الخلفي الأساسي
        [box(1.9, 0.05, 0.3), M(0, 1.12, -2.48, -0.5, 0, 0)],                  // الجناح الخلفي العلوي (DRS)
        [box(2.2, 0.05, 0.62), M(0, 0.13, 3.0)]                                // الجناح الأمامي
    ]);
    SHARED.carbon = merge([
        [box(0.05, 0.62, 0.9), M(0.96, 0.92, -2.4)],                           // ألواح الجناح الخلفي
        [box(0.05, 0.62, 0.9), M(-0.96, 0.92, -2.4)],
        [box(0.05, 0.3, 0.7), M(1.1, 0.2, 3.0)],                               // ألواح الجناح الأمامي
        [box(0.05, 0.3, 0.7), M(-1.1, 0.2, 3.0)],
        [box(1.2, 0.04, 0.24), M(0, 0.2, 2.82, 0.25, 0, 0)],                   // فلاب أمامي
        [box(1.6, 0.1, 4.2), M(0, 0.1, 0.2)],                                  // الأرضية
        [box(0.08, 0.5, 0.08), M(0, 0.65, -2.3)],                              // عمود الجناح
        [new T.TorusGeometry(0.42, 0.045, 6, 16, Math.PI), M(0, 0.68, 0.55, 0, 0, 0, 1, 1, 1.15)], // الهالة
        [box(0.06, 0.3, 0.06), M(0, 0.82, 1.05, 0.35, 0, 0)],                  // عمود الهالة الأمامي
        [box(0.3, 0.3, 0.2), M(0, 0.95, -0.2)],                                // فتحة الهواء
        // أذرع التعليق
        [box(0.9, 0.04, 0.06), M(0.75, 0.32, 1.75, 0, 0, 0.08)], [box(0.9, 0.04, 0.06), M(-0.75, 0.32, 1.75, 0, 0, -0.08)],
        [box(0.9, 0.04, 0.06), M(0.75, 0.32, -1.45, 0, 0, 0.08)], [box(0.9, 0.04, 0.06), M(-0.75, 0.32, -1.45, 0, 0, -0.08)]
    ]);
    SHARED.wheelF = new T.CylinderGeometry(0.36, 0.36, 0.38, 18).rotateZ(Math.PI / 2);
    SHARED.wheelR = new T.CylinderGeometry(0.38, 0.38, 0.46, 18).rotateZ(Math.PI / 2);
    SHARED.helmet = new T.SphereGeometry(0.2, 14, 10);
    SHARED.flame = new T.ConeGeometry(0.22, 1.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.8);
    SHARED.ring = new T.TorusGeometry(1.6, 0.08, 6, 32).rotateX(Math.PI / 2);
    SHARED.carbonMat = new T.MeshStandardMaterial({ color: 0x15161a, roughness: 0.55, metalness: 0.3, flatShading: true });
    SHARED.tyreTex = canvasTex(128, 32, (ctx, w, h) => {
        ctx.fillStyle = '#16171a'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#2a2b30' : '#1b1c20'; ctx.fillRect(i * w / 8, 0, w / 16, h); }
    });
    SHARED.tyreMat = new T.MeshStandardMaterial({ color: 0xffffff, map: SHARED.tyreTex, roughness: 0.9 });
    return SHARED;
}

function makeLabel(car) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const draw = (img) => {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 128);
        ctx.fillStyle = 'rgba(10,10,14,.82)';
        roundRect(ctx, 8, 24, 496, 80, 40); ctx.fill();
        ctx.fillStyle = car.color; roundRect(ctx, 408, 24, 96, 80, 40); ctx.fill();
        ctx.fillRect(408, 24, 40, 80);
        ctx.fillStyle = luminance(car.color) > 0.6 ? '#111' : '#fff';
        ctx.font = `800 48px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(String(car.number), 462, 66);
        // الصورة
        ctx.save(); ctx.beginPath(); ctx.arc(64, 64, 34, 0, Math.PI * 2); ctx.clip();
        if (img) ctx.drawImage(img, 30, 30, 68, 68);
        else { ctx.fillStyle = car.color; ctx.fillRect(30, 30, 68, 68); ctx.fillStyle = '#fff'; ctx.font = `700 36px ${FONT}`; ctx.fillText(String(car.name).trim().charAt(0) || '?', 64, 66); }
        ctx.restore();
        ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.fillStyle = '#fff';
        let size = 40; ctx.font = `700 ${size}px ${FONT}`;
        while (ctx.measureText(car.name).width > 290 && size > 22) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; }
        ctx.fillText(car.name, 252, 66);
        tex.needsUpdate = true;
    };
    draw(null);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => draw(null));
    if (car.avatar) {
        const img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = () => { try { draw(img); } catch (e) { draw(null); } };
        img.src = car.avatar;
    }
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.scale.set(4.4, 1.1, 1); s.position.y = 2.6; s.renderOrder = 10;
    return s;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function luminance(hex) { const c = new T.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

function buildCar(car) {
    const G = sharedCarGeos();
    const g = new T.Group();
    const paint = new T.MeshStandardMaterial({ color: car.color, roughness: 0.32, metalness: 0.45, flatShading: true });
    const body = new T.Mesh(G.body, paint); body.castShadow = true;
    const carbon = new T.Mesh(G.carbon, G.carbonMat); carbon.castShadow = true;
    g.add(body, carbon);
    const wheels = [];
    [[0.98, 0.36, 1.75, G.wheelF], [-0.98, 0.36, 1.75, G.wheelF], [1.0, 0.38, -1.45, G.wheelR], [-1.0, 0.38, -1.45, G.wheelR]].forEach(([x, y, z, geo]) => {
        const w = new T.Mesh(geo, G.tyreMat); w.position.set(x, y, z); g.add(w); wheels.push(w);
    });
    const helmet = new T.Mesh(G.helmet, new T.MeshStandardMaterial({ color: new T.Color(car.color).offsetHSL(0.1, 0, 0.15), roughness: 0.3, metalness: 0.2 }));
    helmet.position.set(0, 0.88, 0.45); g.add(helmet);
    // لهب التوربو/النيترو + حلقة DRS + إضاءة خلفية
    const flameMat = new T.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const flame = new T.Mesh(G.flame, flameMat); flame.position.set(0, 0.55, -2.55); flame.visible = false; g.add(flame);
    const ringMat = new T.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false });
    const ring = new T.Mesh(G.ring, ringMat); ring.position.y = 0.08; ring.visible = false; g.add(ring);
    const rain = new T.Mesh(new T.BoxGeometry(0.2, 0.12, 0.05), new T.MeshBasicMaterial({ color: 0xff2020 })); rain.position.set(0, 0.62, -2.62); g.add(rain);
    const label = makeLabel(car); g.add(label);
    return { group: g, wheels, flame, flameMat, ring, label, paint, helmet, rain, wingFlap: null, spin: 0, data: car };
}

function disposeCar(o) {
    o.paint.dispose(); o.helmet.material.dispose(); o.flameMat.dispose(); o.ring.material.dispose();
    o.rain.geometry.dispose(); o.rain.material.dispose();
    o.label.material.map.dispose(); o.label.material.dispose();
}

// ---------- المشهد ----------
export function mountRace(el, { track, trackPoint }) {
    const W = () => el.clientWidth || 1, H = () => el.clientHeight || 1;
    const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    r.setSize(W(), H(), false);
    r.outputColorSpace = T.SRGBColorSpace;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block';
    el.appendChild(r.domElement);

    const scene = new T.Scene();
    const SKY = 0xbcd3e8;
    scene.background = canvasTex(4, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#3d7fc4'); g.addColorStop(0.55, '#9cc3e6'); g.addColorStop(1, '#e9eef2');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    scene.fog = new T.Fog(SKY, 260, 900);
    const camera = new T.PerspectiveCamera(55, W() / H(), 0.1, 2000);
    camera.position.set(0, 60, 120);

    scene.add(new T.HemisphereLight(0xdfefff, 0x4c6b3a, 0.9));
    const sun = new T.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(80, 140, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 400 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    // ---- الأرض (عشب مقصوص بخطوط) ----
    const grassTex = canvasTex(256, 256, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#4e8a3a' : '#57963f'; ctx.fillRect(0, i * h / 8, w, h / 8); }
        for (let i = 0; i < 1800; i++) { ctx.fillStyle = `rgba(${20 + Math.random() * 40},${60 + Math.random() * 60},20,.25)`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, true);
    grassTex.repeat.set(60, 60);
    const ground = new T.Mesh(new T.PlaneGeometry(3000, 3000), new T.MeshStandardMaterial({ map: grassTex, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.02, -150); ground.receiveShadow = true;
    scene.add(ground);

    const half = track.width / 2;
    // ---- منطقة آمنة (حصى/أسفلت فاتح) ----
    const runoff = new T.Mesh(ribbon(track, -half - 9, half + 9, 0.0), new T.MeshStandardMaterial({ color: 0xb9ad93, roughness: 1 }));
    runoff.receiveShadow = true; scene.add(runoff);
    // ---- الأسفلت (خطوط بيضاء على الأطراف) ----
    const asphaltTex = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#34363b'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) { const v = 40 + Math.random() * 35; ctx.fillStyle = `rgb(${v},${v},${v + 4})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
        ctx.fillStyle = 'rgba(0,0,0,.18)'; ctx.fillRect(w * 0.3, 0, w * 0.12, h); ctx.fillRect(w * 0.58, 0, w * 0.12, h); // خط السباق الداكن
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(4, 0, 5, h); ctx.fillRect(w - 9, 0, 5, h);
    }, true);
    const asphalt = new T.Mesh(ribbon(track, -half, half, 0.02, { vScale: 14 }), new T.MeshStandardMaterial({ map: asphaltTex, roughness: 0.85 }));
    asphalt.receiveShadow = true; scene.add(asphalt);
    // ---- الكيربات (أحمر/أبيض بالمنعطفات) ----
    const RED = new T.Color(0xd90f0f), WHITE = new T.Color(0xf4f4f4);
    const isCorner = k => Math.abs(track.curvature[k]) > 0.006 || Math.abs(track.curvature[(k + 8) % track.count]) > 0.006 || Math.abs(track.curvature[(k - 8 + track.count) % track.count]) > 0.006;
    const kerbCol = k => (Math.floor(k * track.step / 3) % 2 ? RED : WHITE);
    const kerbMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
    const kerbL = new T.Mesh(ribbon(track, half - 0.2, half + 1.6, 0.05, { filter: isCorner, colorFn: kerbCol }), kerbMat);
    const kerbR = new T.Mesh(ribbon(track, -half - 1.6, -half + 0.2, 0.05, { filter: isCorner, colorFn: kerbCol }), kerbMat);
    kerbL.receiveShadow = kerbR.receiveShadow = true; scene.add(kerbL, kerbR);
    // ---- الحواجز (تيك برو أزرق/أبيض + إعلانات) ----
    const barrierTex = canvasTex(256, 64, (ctx, w, h) => {
        ctx.fillStyle = '#1446a0'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#f5f5f5'; ctx.fillRect(w / 2, 0, w / 2, h);
        ctx.fillStyle = '#e10600'; ctx.fillRect(0, h - 8, w, 8);
        ctx.fillStyle = '#fff'; ctx.font = `800 26px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillText('ألعاب أيمن', w / 4, h / 2 - 3);
        ctx.fillStyle = '#1446a0'; ctx.fillText('AYMN GAMES', w * 3 / 4, h / 2 - 3);
    }, true);
    const barrierMat = new T.MeshStandardMaterial({ map: barrierTex, roughness: 0.6, side: T.DoubleSide });
    scene.add(new T.Mesh(wall(track, half + 9, 1.25, 2), barrierMat), new T.Mesh(wall(track, -half - 9, 1.25, 2), barrierMat));
    // سياج فوق الحاجز
    const fenceTex = canvasTex(64, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(200,205,210,.75)'; ctx.lineWidth = 2;
        for (let i = -w; i < w * 2; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke(); }
    }, true);
    const fenceMat = new T.MeshBasicMaterial({ map: fenceTex, transparent: true, side: T.DoubleSide, depthWrite: false, alphaTest: 0.05 });
    const fence = new T.Mesh(wall(track, half + 9.3, 4, 2), fenceMat); fence.position.y = 1.25; fence.geometry.scale(1, 0.7, 1);
    scene.add(fence);

    // ---- خط البداية (رقعة شطرنج) + علامات الشبكة ----
    const p0 = trackPoint(0, 0);
    const checker = canvasTex(256, 32, (ctx, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa'; ctx.fillRect(x * 16, y * 16, 16, 16); } });
    const startLine = new T.Mesh(new T.PlaneGeometry(track.width, 1.6), new T.MeshStandardMaterial({ map: checker, roughness: 0.6 }));
    startLine.rotation.set(-Math.PI / 2, 0, p0.heading + Math.PI / 2); startLine.rotation.order = 'YXZ';
    startLine.rotation.set(-Math.PI / 2, p0.heading, 0, 'YXZ');
    startLine.position.set(p0.x, 0.035, p0.z); startLine.receiveShadow = true; scene.add(startLine);
    const gridParts = [];
    for (let i = 0; i < 16; i++) {
        const d = -14 - i * 9 + 3.2, lane = i % 2 === 0 ? 3 : -3, p = trackPoint(d, lane);
        gridParts.push([new T.BoxGeometry(2.6, 0.01, 0.25), M(p.x, 0.04, p.z, 0, p.heading, 0)]);
        const pl = trackPoint(d - 0.8, lane + 1.2), pr = trackPoint(d - 0.8, lane - 1.2);
        gridParts.push([new T.BoxGeometry(0.2, 0.01, 1.6), M(pl.x, 0.04, pl.z, 0, p.heading, 0)]);
        gridParts.push([new T.BoxGeometry(0.2, 0.01, 1.6), M(pr.x, 0.04, pr.z, 0, p.heading, 0)]);
    }
    scene.add(new T.Mesh(merge(gridParts), new T.MeshBasicMaterial({ color: 0xf2f2f2 })));

    // ---- جسر أضواء البداية ----
    const gantry = new T.Group();
    const steel = new T.MeshStandardMaterial({ color: 0x23252b, roughness: 0.5, metalness: 0.6 });
    gantry.add(new T.Mesh(merge([
        [new T.BoxGeometry(0.5, 7.5, 0.5), M(half + 1.5, 3.75, 0)],
        [new T.BoxGeometry(0.5, 7.5, 0.5), M(-half - 1.5, 3.75, 0)],
        [new T.BoxGeometry(track.width + 4, 1.4, 0.7), M(0, 7.2, 0)]
    ]), steel));
    const banner = canvasTex(1024, 96, (ctx, w, h) => {
        ctx.fillStyle = '#e10600'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#fff'; ctx.font = `800 58px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
        ctx.fillText('سباق الفورمولا · ألعاب أيمن', w / 2, h / 2 + 2);
    });
    const bannerMesh = new T.Mesh(new T.PlaneGeometry(track.width + 4, 1.3), new T.MeshBasicMaterial({ map: banner }));
    bannerMesh.position.set(0, 7.2, -0.36); bannerMesh.rotation.y = Math.PI; gantry.add(bannerMesh);
    const lightPods = [];
    const podOff = new T.MeshStandardMaterial({ color: 0x220404, emissive: 0x000000, roughness: 0.4 });
    for (let i = 0; i < 5; i++) {
        const m = new T.Mesh(new T.CircleGeometry(0.34, 16), podOff.clone());
        m.position.set((i - 2) * 1.0, 5.9, -0.36); m.rotation.y = Math.PI;
        const housing = new T.Mesh(new T.BoxGeometry(0.85, 1.0, 0.4), steel); housing.position.set((i - 2) * 1.0, 5.95, -0.1);
        gantry.add(housing, m); lightPods.push(m);
    }
    gantry.position.set(p0.x, 0, p0.z); gantry.rotation.y = p0.heading;
    scene.add(gantry);

    // ---- المدرجات (على الخط المستقيم الرئيسي) ----
    const crowdTex = canvasTex(512, 128, (ctx, w, h) => {
        ctx.fillStyle = '#2b2f3a'; ctx.fillRect(0, 0, w, h);
        const cols = ['#e10600', '#ffffff', '#ffd400', '#1e5bc6', '#00d2be', '#ff8700', '#2dd4bf', '#f472b6', '#16a34a'];
        for (let row = 0; row < 8; row++) for (let i = 0; i < 64; i++) {
            ctx.fillStyle = cols[Math.floor(Math.random() * cols.length)];
            ctx.beginPath(); ctx.arc(i * 8 + 4 + (row % 2) * 4, row * 16 + 8, 3.2, 0, Math.PI * 2); ctx.fill();
        }
    }, true);
    const standMat = new T.MeshStandardMaterial({ map: crowdTex, roughness: 0.9 });
    const concrete = new T.MeshStandardMaterial({ color: 0xc9c9cf, roughness: 0.9 });
    const roofMat = new T.MeshStandardMaterial({ color: 0xe10600, roughness: 0.5, metalness: 0.3 });
    [-120, -40, 40, 120, 200].forEach((d, i) => {
        const p = trackPoint(d, -half - 24);
        const g = new T.Group();
        for (let s = 0; s < 5; s++) {
            const step = new T.Mesh(new T.BoxGeometry(60, 1.6, 3), s % 2 ? concrete : standMat);
            step.position.set(0, 0.8 + s * 1.6, -s * 3); step.receiveShadow = true;
            g.add(step);
        }
        const roof = new T.Mesh(new T.BoxGeometry(62, 0.4, 18), roofMat); roof.position.set(0, 11.5, -6); roof.castShadow = true;
        const col = new T.Mesh(merge([[new T.BoxGeometry(0.6, 11.5, 0.6), M(-29, 5.75, -14)], [new T.BoxGeometry(0.6, 11.5, 0.6), M(29, 5.75, -14)]]), concrete);
        g.add(roof, col);
        g.position.set(p.x, 0, p.z); g.rotation.y = p.heading - Math.PI / 2;
        scene.add(g);
    });
    // ---- مبنى الصيانة (الجهة الثانية من المستقيم) ----
    {
        const p = trackPoint(40, half + 26);
        const pit = new T.Group();
        const pitTex = canvasTex(1024, 128, (ctx, w, h) => {
            ctx.fillStyle = '#f2f2f4'; ctx.fillRect(0, 0, w, h);
            for (let i = 0; i < 12; i++) { ctx.fillStyle = '#1b1d22'; ctx.fillRect(i * w / 12 + 8, 40, w / 12 - 16, h - 40); }
            ctx.fillStyle = '#e10600'; ctx.fillRect(0, 0, w, 30);
        });
        const bldg = new T.Mesh(new T.BoxGeometry(220, 12, 16), [concrete, concrete, concrete, concrete, new T.MeshStandardMaterial({ map: pitTex }), concrete]);
        bldg.position.y = 6; bldg.castShadow = true; bldg.receiveShadow = true;
        const tower = new T.Mesh(new T.CylinderGeometry(4, 5, 30, 8), concrete); tower.position.set(70, 15, 4);
        const towerTop = new T.Mesh(new T.CylinderGeometry(7, 5, 5, 8), roofMat); towerTop.position.set(70, 32, 4);
        pit.add(bldg, tower, towerTop);
        pit.position.set(p.x, 0, p.z); pit.rotation.y = p.heading - Math.PI / 2 + Math.PI;
        scene.add(pit);
    }
    // ---- الأشجار (Instanced) ----
    {
        const trunkG = new T.CylinderGeometry(0.4, 0.5, 3, 5), topG = new T.ConeGeometry(3.4, 9, 7);
        const pts = [];
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let tries = 0; pts.length < 260 && tries < 6000; tries++) {
            const x = -700 + rnd() * 1400, z = -650 + rnd() * 900;
            let near = Infinity;
            for (let k = 0; k < track.count; k += 6) near = Math.min(near, Math.hypot(track.x[k] - x, track.z[k] - z));
            if (near > 48 && !(Math.abs(z) < 70 && x > -320 && x < 360)) pts.push([x, z, 0.7 + rnd() * 0.7]);
        }
        const trunks = new T.InstancedMesh(trunkG, new T.MeshStandardMaterial({ color: 0x5b3b22 }), pts.length);
        const tops = new T.InstancedMesh(topG, new T.MeshStandardMaterial({ color: 0x2f6b2c, flatShading: true }), pts.length);
        pts.forEach(([x, z, s], i) => {
            trunks.setMatrixAt(i, M(x, 1.5 * s, z, 0, 0, 0, s, s, s));
            tops.setMatrixAt(i, M(x, (3 + 4.5) * s, z, 0, i, 0, s, s, s));
        });
        tops.castShadow = false; scene.add(trunks, tops);
    }

    // ---- كاميرات جانب المضمار ----
    const trackCams = [];
    for (let i = 0; i < 14; i++) {
        const k = Math.floor(i * track.count / 14);
        const side = track.curvature[k] > 0 ? -1 : 1;
        const hd = track.heading[k], lx = Math.cos(hd), lz = -Math.sin(hd);
        trackCams.push({ d: k * track.step, pos: new T.Vector3(track.x[k] + lx * side * (half + 14), 6, track.z[k] + lz * side * (half + 14)) });
    }

    // ---- جزيئات المؤثرات (مجمّعة) ----
    const sparkTex = canvasTex(64, 64, (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    const parts = [];
    for (let i = 0; i < 90; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: sparkTex, color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        s.visible = false; scene.add(s); parts.push({ s, v: new T.Vector3(), life: 0, max: 1 });
    }
    let partIdx = 0;
    const BURST = { tap: [0xff3b6b, 8], nitro: [0x38bdf8, 18], drs: [0x22c55e, 18], turbo: [0xf97316, 26], jump: [0xeab308, 30], safety: [0xe10600, 36], win: [0xffd400, 60] };

    // ---- السيارات ----
    const cars = new Map();
    let focusId = null, camMode = 'orbit', phase = 'lobby';
    const camPos = new T.Vector3(0, 60, 120), camLook = new T.Vector3();
    let camFov = 55, orbitT = 0, lastMode = '';

    function setCars(list) {
        const ids = new Set(list.map(c => c.id));
        for (const [id, o] of cars) if (!ids.has(id)) { scene.remove(o.group); disposeCar(o); cars.delete(id); }
        list.forEach(c => {
            let o = cars.get(c.id);
            if (o && (o.data.number !== c.number || o.data.color !== c.color)) { scene.remove(o.group); disposeCar(o); cars.delete(c.id); o = null; }
            if (!o) { o = buildCar({ ...c }); cars.set(c.id, o); scene.add(o.group); }
        });
    }

    const tmp = new T.Vector3();
    let states = [];
    function update(list) { states = list; }

    function applyStates(dt) {
        for (const s of states) {
            const o = cars.get(s.id); if (!o) continue;
            const g = o.group;
            g.position.set(s.x, 0, s.z);
            // دوران سلس حول الاتجاه
            let dh = s.heading - g.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
            g.rotation.y += dh * (1 - Math.exp(-dt * 12));
            o.spin += s.speed * dt / 0.37;
            for (const w of o.wheels) w.rotation.x = o.spin;
            const fx = s.fx || {};
            const fire = fx.turbo > 0 || fx.nitro > 0;
            o.flame.visible = fire;
            if (fire) {
                o.flameMat.color.set(fx.turbo > 0 ? 0xff6a00 : 0x38bdf8);
                o.flame.scale.set(1, 1, (fx.turbo > 0 ? 1.6 : 1.1) * (0.8 + Math.random() * 0.45));
            }
            o.ring.visible = fx.drs > 0 || fx.slow > 0;
            if (o.ring.visible) { o.ring.material.color.set(fx.slow > 0 ? 0xe10600 : 0x22c55e); o.ring.rotation.y += dt * 2; o.ring.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.06); }
            o.rain.material.color.setScalar(0); o.rain.material.color.r = (Math.floor(performance.now() / 120) % 2 || s.speed < 30) ? 1 : 0.25;
            const inside = camMode === 'onboard' && s.id === focusId;
            o.label.visible = !inside; o.helmet.visible = !inside;
            g.userData.speed = s.speed;
        }
    }

    function burst(id, kind) {
        const o = cars.get(id); if (!o) return;
        const [color, n] = BURST[kind] || BURST.tap;
        for (let i = 0; i < n; i++) {
            const p = parts[partIdx++ % parts.length];
            p.s.visible = true; p.s.material.color.set(color);
            p.s.position.copy(o.group.position).add(tmp.set((Math.random() - 0.5) * 2, 1 + Math.random(), (Math.random() - 0.5) * 3));
            p.v.set((Math.random() - 0.5) * 9, 4 + Math.random() * 8, (Math.random() - 0.5) * 9);
            p.life = 0; p.max = 0.7 + Math.random() * 0.7;
            p.s.scale.setScalar(kind === 'win' ? 1.4 : 0.9);
        }
    }
    function tickParts(dt) {
        for (const p of parts) {
            if (!p.s.visible) continue;
            p.life += dt;
            if (p.life >= p.max) { p.s.visible = false; continue; }
            p.v.y -= 14 * dt;
            p.s.position.addScaledVector(p.v, dt);
            p.s.material.opacity = 1 - p.life / p.max;
        }
    }

    function setLights(n) {
        lightPods.forEach((m, i) => { const on = i < n; m.material.color.set(on ? 0xff1a1a : 0x220404); m.material.emissive.set(on ? 0xff0000 : 0x000000); m.material.emissiveIntensity = on ? 3 : 0; });
    }

    // ---- الكاميرا ----
    function camera_(dt) {
        const o = cars.get(focusId) || cars.values().next().value;
        const k = 1 - Math.exp(-dt * (camMode === 'onboard' ? 30 : 4.5));
        const jump = lastMode !== camMode; lastMode = camMode;
        let targetPos, targetLook, fov = 55;
        if (camMode === 'orbit' || !o) {
            // دوران حول شبكة الانطلاق
            orbitT += dt * 0.12;
            const c = trackPoint(-50, 0);
            targetPos = tmp.set(c.x + Math.sin(orbitT) * 70, 26 + Math.sin(orbitT * 0.7) * 6, c.z + Math.cos(orbitT) * 70).clone();
            targetLook = new T.Vector3(c.x, 1, c.z);
            fov = 50;
            if (phase === 'finish' && o) { targetLook = o.group.position.clone().setY(1); targetPos = o.group.position.clone().add(new T.Vector3(Math.sin(orbitT * 2) * 12, 5, Math.cos(orbitT * 2) * 12)); fov = 45; }
        } else {
            const g = o.group, fwd = new T.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
            const spd = g.userData.speed || 0;
            if (camMode === 'tv') {
                targetPos = g.position.clone().addScaledVector(fwd, -11 - spd * 0.04).setY(4.2);
                targetLook = g.position.clone().addScaledVector(fwd, 6).setY(1.2);
                fov = 58 + Math.min(14, spd * 0.15);
            } else if (camMode === 'onboard') {
                targetPos = g.position.clone().addScaledVector(fwd, 0.15).setY(1.22);
                targetLook = g.position.clone().addScaledVector(fwd, 20).setY(1.0);
                fov = 72 + Math.min(10, spd * 0.12);
            } else if (camMode === 'heli') {
                targetPos = g.position.clone().addScaledVector(fwd, -45).setY(55);
                targetLook = g.position.clone().addScaledVector(fwd, 8);
                fov = 42;
            } else { // trackside: أقرب كاميرا قدام السيارة
                let best = trackCams[0], bd = Infinity;
                for (const c of trackCams) { const d = c.pos.distanceTo(g.position); if (d < bd) { bd = d; best = c; } }
                targetPos = best.pos.clone();
                targetLook = g.position.clone().setY(0.9);
                fov = Math.max(12, Math.min(55, 1400 / Math.max(bd, 10)));
            }
        }
        if (jump || camMode === 'trackside') { if (jump) camPos.copy(targetPos); else camPos.lerp(targetPos, 1 - Math.exp(-dt * 20)); camLook.copy(targetLook); }
        else { camPos.lerp(targetPos, k); camLook.lerp(targetLook, camMode === 'onboard' ? k : 1 - Math.exp(-dt * 8)); }
        camFov += (fov - camFov) * (jump ? 1 : 1 - Math.exp(-dt * 3));
        camera.position.copy(camPos);
        if (camMode === 'onboard' && o) camera.position.y += Math.sin(performance.now() / 30) * 0.008 * Math.min(1, (o.group.userData.speed || 0) / 40);
        camera.lookAt(camLook);
        if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
        // الظل يتبع ما تشوفه الكاميرا
        const focusP = o ? o.group.position : camLook;
        sun.target.position.copy(focusP); sun.position.copy(focusP).add(new T.Vector3(60, 120, 40));
    }

    // ---- الحلقة ----
    const clock = new T.Clock();
    let raf = 0, running = true;
    function loop() {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        applyStates(dt);
        tickParts(dt);
        camera_(dt);
        r.render(scene, camera);
    }
    loop();
    const ro = new ResizeObserver(() => { r.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
    ro.observe(el);
    const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); loop(); } };
    document.addEventListener('visibilitychange', onVis);

    return {
        setCars, update, burst, setLights,
        setCamera(mode, id) { camMode = phase === 'finish' ? 'orbit' : mode; if (id) focusId = id; },
        setPhase(p) { phase = p; },
        stop() {
            running = false; cancelAnimationFrame(raf); ro.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); });
            r.dispose(); r.domElement.remove();
        }
    };
}
