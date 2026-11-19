/**
 * «خارج التغطية» — مسرح شاشة البث ثلاثي الأبعاد (Three.js 0.160).
 *
 * مسرح برنامج مسابقات: منصات للاعبين على قوس (وصفين لو العدد كبير)، شاشة LED خلفية
 * تعرض عنوان المرحلة، أضواء متحركة، وأرضية لامعة بحلقة نيون بلون المنصة.
 * الشخصيات نفس شخصيات «سفينة النجاة» (figure بـ games/survival-ship/ship3d.js) بنفس
 * النسب والخامات، وكل شكل له قصة شعر خاصة (oc-looks.js).
 *
 * createStage(container, getFrame) — getFrame() يرجع كل فريم {G, room, now}:
 *   G    = نسخة المذيع من حالة المباراة (null باللوبي) · room = الغرفة · now = وقت الخادم
 * المشهد عرض بس: يقرأ الحالة ويقرر اللقطة والإضاءة وحركة الشخصيات، وما يغيّر شي باللعبة.
 * اللقطات تنحسب من وقت المرحلة (stage.at/ends) فلو انفتحت الصفحة وسط لقطة تكمل من مكانها.
 *
 * يرجع { project(id) → {x,y,on} (مكان رأس الشخصية على الشاشة — لبطاقات التلميح)، dispose() }
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const Looks = window.OCLooks;
const TAU = Math.PI * 2;
const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const span = (u, a, b) => clamp01((u - a) / (b - a));
const FONT = '"IBM Plex Sans Arabic", "Zain", "Segoe UI", Tahoma, sans-serif';
const STAGE_Z = -6;          // مركز قوس المنصات
const POD_H = 0.45, POD_H_BACK = 1.15;
// منطقة الانتظار (منصات القوس) ترجع لورا، وقدّامها «منصة الدور»: كل دفعة تمشي لها وتوقف تحت الإضاءة
const WAIT_BACK = 3.2, FRONT_Z = STAGE_Z + 11.6, FRONT_GAP = 2.8, DECK_Y = 0.3, WALK_SPEED = 6.5;

// ---------------------------------------------------------------- خامات وأشكال مشتركة
const MATS = new Map();
function M(color, o) {
    const key = color + JSON.stringify(o || {});
    let m = MATS.get(key);
    if (!m) { m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.55 }, o || {})); MATS.set(key, m); }
    return m;
}
function canvasTex(w, h, draw) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    return t;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }

// ---------------------------------------------------------------- الشخصية (نفس سفينة النجاة)
function add(par, geo, mat, x, y, z) { const m = new THREE.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; par.add(m); return m; }
const sph = (r, w, h) => new THREE.SphereGeometry(r, w || 16, h || 12);
const cap = (r, l) => new THREE.CapsuleGeometry(r, l, 5, 10);

/** قصات الشعر — كل وحدة تنحط على مجموعة الرأس (نصف قطر الرأس .62 والوجه باتجاه +z). */
function hairCap(head, hm, k) { const c = add(head, new THREE.SphereGeometry(0.67 * (k || 1), 24, 14, 0, TAU, 0, Math.PI * 0.52), hm, 0, 0.04, -0.05); c.rotation.x = -0.32; return c; }
function fringe(head, hm, lift) { for (let i = -2; i <= 2; i++) add(head, sph(0.2, 10, 8), hm, i * 0.17, 0.36 - Math.abs(i) * 0.03 + (lift || 0), 0.46 - Math.abs(i) * 0.05).scale.set(1, 0.7, 0.6); }
function onHead(dirX, dirY, dirZ, r) { return new THREE.Vector3(dirX, dirY, dirZ).normalize().multiplyScalar(r); }
const HAIR = {
    spiky(head, hm) {
        hairCap(head, hm);
        [[0, 1, 0.15], [0.45, 0.85, 0.1], [-0.45, 0.85, 0.1], [0.3, 0.8, -0.5], [-0.3, 0.8, -0.5], [0, 0.7, -0.75], [0.15, 0.95, 0.5], [-0.2, 0.9, 0.45]].forEach(([x, y, z]) => {
            const d = new THREE.Vector3(x, y, z).normalize(), c = add(head, new THREE.ConeGeometry(0.14, 0.46, 7), hm);
            c.position.copy(d.clone().multiplyScalar(0.66)); c.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d);
        });
        fringe(head, hm);
    },
    curly(head, hm) {
        hairCap(head, hm, 1.03);
        for (let i = 0; i < 22; i++) {
            const a = i * 2.39996, y = 1 - (i / 21) * 1.15, r = Math.sqrt(Math.max(0, 1 - y * y));
            const d = new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r);
            if (d.z > 0.45 && d.y < 0.35) continue;   // الوجه مكشوف
            add(head, sph(0.19, 8, 6), hm).position.copy(d.normalize().multiplyScalar(0.68));
        }
        fringe(head, hm, 0.04);
    },
    mohawk(head, hm) {
        const b = add(head, new THREE.SphereGeometry(0.635, 22, 12, 0, TAU, 0, Math.PI * 0.5), M(hm.color.getStyle(), { roughness: 0.7, transparent: true, opacity: 0.55 }), 0, 0.02, -0.03); b.rotation.x = -0.25;
        for (let i = 0; i < 7; i++) {
            const a = -0.35 + i * 0.32, d = new THREE.Vector3(0, Math.cos(a), -Math.sin(a));
            const s = add(head, sph(0.2, 10, 8), hm); s.position.copy(d.clone().multiplyScalar(0.7)); s.scale.set(0.4, 1.25 - Math.abs(i - 2) * 0.08, 0.9); s.rotation.x = -a;
        }
    },
    quiff(head, hm) {
        hairCap(head, hm);
        const q = add(head, sph(0.34, 14, 10), hm, 0, 0.58, 0.26); q.scale.set(1.35, 0.9, 1); q.rotation.x = -0.5;
        add(head, sph(0.5, 16, 12), hm, 0, -0.05, -0.28).scale.set(1.15, 1, 0.8);
        for (const s of [-1, 1]) add(head, sph(0.16, 8, 6), hm, s * 0.52, 0.18, 0.2).scale.set(0.6, 1, 1);
    },
    buzz(head, hm) {
        const b = add(head, new THREE.SphereGeometry(0.64, 22, 12, 0, TAU, 0, Math.PI * 0.48), hm, 0, 0.03, -0.04); b.rotation.x = -0.28;
        add(head, sph(0.45, 14, 10), hm, 0, -0.05, -0.3).scale.set(1.2, 1, 0.75);
    },
    side(head, hm) {
        hairCap(head, hm);
        const sw = add(head, sph(0.3, 14, 10), hm, -0.18, 0.42, 0.36); sw.scale.set(1.7, 0.62, 0.75); sw.rotation.z = 0.32;
        add(head, sph(0.18, 10, 8), hm, 0.42, 0.3, 0.33).scale.set(0.8, 0.8, 0.6);
        add(head, sph(0.5, 16, 12), hm, 0, -0.05, -0.28).scale.set(1.15, 1, 0.8);
    },
    ponytail(head, hm) {
        hairCap(head, hm); fringe(head, hm);
        const t = add(head, cap(0.16, 0.62), hm, 0, -0.18, -0.78); t.rotation.x = 0.55;
        add(head, new THREE.TorusGeometry(0.13, 0.05, 6, 14), M('#f472b6'), 0, 0.15, -0.66).rotation.x = 0.9;
    },
    bun(head, hm) {
        hairCap(head, hm); fringe(head, hm);
        add(head, sph(0.29, 14, 10), hm, 0, 0.66, -0.26);
        add(head, new THREE.TorusGeometry(0.2, 0.05, 6, 16), M('#fbbf24', { metalness: 0.4 }), 0, 0.5, -0.2).rotation.x = Math.PI / 2 - 0.4;
    },
    long(head, hm) {
        hairCap(head, hm); fringe(head, hm);
        add(head, cap(0.5, 0.75), hm, 0, -0.5, -0.32).scale.set(1.16, 1, 0.48);
        for (const s of [-1, 1]) { const l = add(head, cap(0.14, 0.62), hm, s * 0.57, -0.36, 0.08); l.rotation.z = s * 0.08; }
    },
    bob(head, hm) {
        hairCap(head, hm, 1.02);
        add(head, new THREE.SphereGeometry(0.71, 24, 14, Math.PI / 2 + 0.95, TAU - 1.9, Math.PI * 0.28, Math.PI * 0.46), hm, 0, 0.02, -0.03);
        for (let i = -2; i <= 2; i++) add(head, sph(0.19, 10, 8), hm, i * 0.18, 0.32, 0.47 - Math.abs(i) * 0.05).scale.set(1, 0.6, 0.55);
    },
    twinbuns(head, hm) {
        hairCap(head, hm); fringe(head, hm);
        for (const s of [-1, 1]) { add(head, sph(0.23, 12, 10), hm, s * 0.44, 0.56, -0.12); add(head, sph(0.08, 8, 6), M('#a78bfa'), s * 0.3, 0.5, 0.04); }
    },
    pigtails(head, hm) {
        hairCap(head, hm); fringe(head, hm);
        for (const s of [-1, 1]) { const p = add(head, cap(0.16, 0.55), hm, s * 0.62, -0.32, -0.12); p.rotation.z = s * 0.12; add(head, sph(0.09, 10, 8), M('#f472b6'), s * 0.6, 0.08, -0.1); }
    }
};

/** يدمج القطع الثابتة داخل كل مجموعة حسب الخامة (أوامر رسم أقل بكثير بدون ما يتغيّر الشكل). */
function bake(group) {
    const byMat = new Map();
    group.children.slice().forEach((o) => {
        if (!o.isMesh) return;
        o.updateMatrix();
        const g = o.geometry.index ? o.geometry : null;
        if (!g || !g.attributes.uv) return;
        let arr = byMat.get(o.material); if (!arr) byMat.set(o.material, arr = []);
        arr.push(o);
    });
    byMat.forEach((list, mat) => {
        if (list.length < 2) return;
        const geos = list.map((o) => { const c = o.geometry.clone(); c.applyMatrix4(o.matrix); return c; });
        let merged = null; try { merged = mergeGeometries(geos, false); } catch (e) { merged = null; }
        geos.forEach((gq) => gq.dispose());
        if (!merged) return;
        list.forEach((o) => { group.remove(o); o.geometry.dispose(); });
        const m = new THREE.Mesh(merged, mat); m.castShadow = true; group.add(m);
    });
}

function buildFigure(look) {
    const L = Looks.get(look), G = new THREE.Group();
    const skin = M(L.skin, { roughness: 0.5 }), outfit = M(L.outfit), hm = M(L.hair, { roughness: 0.45 });
    const shade = new THREE.Color(L.outfit).multiplyScalar(0.75).getStyle();
    const legs = [], arms = [];
    for (const x of [-0.17, 0.17]) {
        const l = new THREE.Group(); l.position.set(x, 0.78, 0);
        add(l, cap(0.13, 0.42), M(L.pants), 0, -0.32, 0);
        add(l, sph(0.19, 12, 8), M('#f8fafc'), 0, -0.7, 0.07).scale.set(1, 0.62, 1.35);
        add(l, new THREE.CylinderGeometry(0.19, 0.19, 0.05, 12), M('#334155'), 0, -0.77, 0.07);
        G.add(l); legs.push(l);
    }
    const body = new THREE.Group(); G.add(body);
    add(body, cap(0.36, 0.42), outfit, 0, 1.18, 0).scale.set(1, 1, 0.82);
    add(body, new THREE.TorusGeometry(0.3, 0.06, 8, 18), M('#ffffff'), 0, 1.52, 0).rotation.x = Math.PI / 2;
    add(body, new THREE.CylinderGeometry(0.37, 0.37, 0.09, 16), M(shade), 0, 0.93, 0);
    add(body, sph(0.07, 8, 6), M('#fde68a'), 0, 1.22, 0.31);
    add(body, new THREE.CylinderGeometry(0.13, 0.15, 0.16, 10), skin, 0, 1.66, 0);
    for (const s of [-1, 1]) {
        const a = new THREE.Group(); a.position.set(s * 0.44, 1.42, 0);
        add(a, cap(0.1, 0.34), outfit, 0, -0.24, 0); add(a, sph(0.12, 10, 8), skin, 0, -0.52, 0);
        a.rotation.z = s * 0.2; G.add(a); arms.push(a);
    }
    const head = new THREE.Group(); head.position.y = 2.18; G.add(head);
    add(head, sph(0.62, 26, 20), skin).scale.set(1, 0.96, 0.94);
    for (const s of [-1, 1]) add(head, sph(0.13, 10, 8), skin, s * 0.6, -0.04, 0).scale.set(0.6, 1, 0.8);
    (HAIR[L.style] || HAIR.buzz)(head, hm);
    const eyeB = M('#1e1b2e', { roughness: 0.2 }), eyeW = M('#ffffff', { roughness: 0.2 }), cheek = M('#fb7185', { transparent: true, opacity: 0.55 });
    for (const s of [-1, 1]) {
        add(head, sph(0.12, 12, 10), eyeB, s * 0.22, -0.02, 0.53).scale.set(0.85, 1.15, 0.5);
        add(head, sph(0.04, 6, 5), eyeW, s * 0.22 + 0.03, 0.05, 0.59);
        add(head, cap(0.025, 0.13), hm, s * 0.22, 0.2, 0.55).rotation.z = Math.PI / 2 + s * 0.15;
        add(head, sph(0.09, 8, 6), cheek, s * 0.36, -0.2, 0.47).scale.set(1, 0.55, 0.3);
    }
    const mouth = add(head, new THREE.TorusGeometry(0.08, 0.022, 6, 12, Math.PI), M('#9f1239'), 0, -0.2, 0.57); mouth.rotation.z = Math.PI;
    bake(body); bake(head); legs.forEach(bake); arms.forEach(bake);
    // الجوال: يطلع بين اليدين وقت كتابة التلميح، وشاشته تضوي على الوجه
    const phone = new THREE.Group(); phone.position.set(0, 1.18, 0.5); phone.rotation.x = -0.95; phone.visible = false; G.add(phone);
    add(phone, new THREE.BoxGeometry(0.34, 0.56, 0.05), M('#18151f', { roughness: 0.3, metalness: 0.4 }));
    add(phone, new THREE.PlaneGeometry(0.29, 0.49), new THREE.MeshBasicMaterial({ color: '#c4b5fd', toneMapped: false }), 0, 0, 0.027);
    G.userData = { legs, arms, head, body, mouth, phone };
    return G;
}

// ---------------------------------------------------------------- لافتات (اسم · حالة · أصوات)
function sprite(w, h, scaleY, order) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    sp.renderOrder = order || 10; sp.userData = { c, tex, key: '' }; sp.scale.set(scaleY * w / h, scaleY, 1);
    return sp;
}
function drawName(sp, name, num, ring, dim) {
    const key = [name, num, ring, dim, FONTS_OK].join('|'); if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '700 46px ' + FONT; ctx.direction = 'rtl';
    const nm = name.length > 14 ? name.slice(0, 13) + '…' : name;
    const tw = Math.min(330, ctx.measureText(nm).width), bw = tw + 104, x = (W - bw) / 2, y = 12, h = 70;
    ctx.globalAlpha = dim ? 0.45 : 1;
    roundRect(ctx, x, y, bw, h, 35); ctx.fillStyle = 'rgba(12,10,20,.86)'; ctx.fill();
    ctx.lineWidth = 4; ctx.strokeStyle = ring || 'rgba(167,139,250,.45)'; ctx.stroke();
    ctx.beginPath(); ctx.arc(x + 38, y + h / 2, 24, 0, TAU); ctx.fillStyle = ring || '#7c3aed'; ctx.fill();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 28px ' + FONT;
    ctx.fillText(String(num), x + 38, y + h / 2 + 2);
    ctx.font = '700 44px ' + FONT; ctx.textAlign = 'right'; ctx.fillText(nm, x + bw - 22, y + h / 2 + 3, tw);
    tex.needsUpdate = true;
}
const BADGE = {
    typing: { bg: '#7c3aed', t: '✍', fs: 64 }, sent: { bg: '#16a34a', t: '✓', fs: 74 }, none: { bg: '#52525b', t: '✕', fs: 64 },
    voted: { bg: '#a78bfa', t: '✓', fs: 74 }, out: { bg: '#e2483d', t: '📵', fs: 60 }, in: { bg: '#2f7de1', t: '📶', fs: 60 }
};
function drawBadge(sp, kind, n) {
    const key = kind + '|' + (n == null ? '' : n); if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 128, 128);
    const B = kind === 'count' ? { bg: n ? '#e2483d' : '#3f3f46', t: String(n), fs: 66 } : BADGE[kind];
    ctx.beginPath(); ctx.arc(64, 64, 54, 0, TAU); ctx.fillStyle = B.bg; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '800 ' + B.fs + 'px ' + FONT;
    ctx.fillText(B.t, 64, 68);
    tex.needsUpdate = true;
}
let FONTS_OK = 0;
try { document.fonts && document.fonts.ready.then(() => { FONTS_OK = 1; }); } catch (e) { }

// ---------------------------------------------------------------- المسرح
export function createStage(container, getFrame) {
    const accent = (getComputedStyle(document.documentElement).getPropertyValue('--agp-accent') || '#a78bfa').trim() || '#a78bfa';
    const r = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);

    const scene = new THREE.Scene();
    const BG = new THREE.Color('#0b0814');
    scene.background = BG.clone(); scene.fog = new THREE.Fog('#0b0814', 34, 80);
    const cam = new THREE.PerspectiveCamera(40, 1, 0.1, 200); cam.position.set(0, 14, 34);
    const camLook = new THREE.Vector3(0, 2, -2);

    // الإضاءة: سماء/أرض + ضوء رئيسي بظل + ضوء حافة ملوّن + بقعة تتبع صاحب اللحظة
    const hemi = new THREE.HemisphereLight('#d9ccff', '#1a1030', 0.9); scene.add(hemi);
    const key = new THREE.DirectionalLight('#fff1e6', 1.6); key.position.set(-8, 18, 14); key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024); Object.assign(key.shadow.camera, { left: -16, right: 16, top: 14, bottom: -10, near: 1, far: 60 }); scene.add(key);
    const rim = new THREE.DirectionalLight(accent, 1.2); rim.position.set(6, 8, -16); scene.add(rim);
    const spot = new THREE.SpotLight('#fff3d6', 0, 30, 0.32, 0.5, 1.2); spot.position.set(0, 16, 2); scene.add(spot); scene.add(spot.target);

    // الأرضية والمنصة
    const floor = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ roughness: 0.9, map: canvasTex(512, 512, (g, w, h) => {
        const gr = g.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, w / 2); gr.addColorStop(0, '#2a1d4a'); gr.addColorStop(0.5, '#140e24'); gr.addColorStop(1, '#0b0814'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    }) }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
    const deck = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.4, 0.3, 72), new THREE.MeshStandardMaterial({ color: '#17122a', roughness: 0.32, metalness: 0.25, map: canvasTex(1024, 1024, (g, w, h) => {
        g.fillStyle = '#17122a'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(167,139,250,.13)'; g.lineWidth = 2;
        for (let i = 1; i < 9; i++) { g.beginPath(); g.arc(w / 2, h / 2, i * w / 18, 0, TAU); g.stroke(); }
        for (let i = 0; i < 24; i++) { const a = i / 24 * TAU; g.beginPath(); g.moveTo(w / 2, h / 2); g.lineTo(w / 2 + Math.cos(a) * w / 2, h / 2 + Math.sin(a) * h / 2); g.stroke(); }
    }) }));
    deck.position.set(0, 0.15, STAGE_Z); deck.receiveShadow = true; scene.add(deck);
    const neon = new THREE.Mesh(new THREE.TorusGeometry(15.25, 0.09, 8, 120), new THREE.MeshBasicMaterial({ color: accent }));
    neon.rotation.x = Math.PI / 2; neon.position.set(0, 0.32, STAGE_Z); scene.add(neon);
    const neon2 = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.06, 6, 80), new THREE.MeshBasicMaterial({ color: '#c4b5fd', transparent: true, opacity: 0.6 }));
    neon2.rotation.x = Math.PI / 2; neon2.position.set(0, 0.31, STAGE_Z + 6.5); scene.add(neon2);

    // شاشة LED الخلفية: عنوان اللعبة والمرحلة
    const ledC = document.createElement('canvas'); ledC.width = 1536; ledC.height = 480;
    const ledTex = new THREE.CanvasTexture(ledC); ledTex.colorSpace = THREE.SRGBColorSpace;
    ledTex.wrapS = THREE.RepeatWrapping; ledTex.repeat.x = -1;   // نشوف الوجه الداخلي، فنقلب النص عشان ينقرا صح
    const led = new THREE.Mesh(new THREE.CylinderGeometry(24, 24, 9, 64, 1, true, Math.PI - 0.62, 1.24), new THREE.MeshBasicMaterial({ map: ledTex, side: THREE.BackSide, toneMapped: false }));
    led.position.set(0, 5.6, STAGE_Z + 2); scene.add(led);
    const ledFrame = new THREE.Mesh(new THREE.CylinderGeometry(24.15, 24.15, 9.3, 64, 1, true, Math.PI - 0.64, 1.28), new THREE.MeshStandardMaterial({ color: '#0e0a18', side: THREE.BackSide, roughness: 0.6 }));
    ledFrame.position.copy(led.position); scene.add(ledFrame);
    let ledKey = '';
    function drawLed(title, sub, tone) {
        const k = title + '|' + sub + '|' + tone + '|' + FONTS_OK; if (k === ledKey) return; ledKey = k;
        const g = ledC.getContext('2d'), W = ledC.width, H = ledC.height;
        const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, tone === 'red' ? '#2a0b14' : '#1a0f33'); gr.addColorStop(1, '#07050d'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
        g.fillStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < H; y += 6) g.fillRect(0, y, W, 2);
        // أيقونة إشارة التغطية (خطوط متدرّجة) — الأخيرة مقطوعة
        const bx = W / 2 - 60, by = 150;
        for (let i = 0; i < 4; i++) { g.fillStyle = i === 3 ? 'rgba(255,255,255,.18)' : (tone === 'red' ? '#f87171' : accent); roundRect(g, bx + i * 32, by - 26 - i * 22, 22, 26 + i * 22, 5); g.fill(); }
        g.strokeStyle = '#f87171'; g.lineWidth = 9; g.beginPath(); g.moveTo(bx + 92, by - 100); g.lineTo(bx + 140, by - 52); g.moveTo(bx + 140, by - 100); g.lineTo(bx + 92, by - 52); g.stroke();
        g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '800 120px ' + FONT; g.fillStyle = '#f4f2f8'; g.shadowColor = tone === 'red' ? '#ef4444' : accent; g.shadowBlur = 30;
        g.fillText(title, W / 2, 262);
        g.shadowBlur = 0; g.font = '600 56px ' + FONT; g.fillStyle = '#c4b5fd'; g.fillText(sub || '', W / 2, 372);
        ledTex.needsUpdate = true;
    }

    // جسور الإضاءة وحزم الضوء (مخاريط شفافة تتمايل، وبالكشف تتجه لصاحب الأصوات)
    const truss = new THREE.Mesh(new THREE.BoxGeometry(30, 0.4, 0.4), M('#2a2340', { metalness: 0.6, roughness: 0.4 }));
    truss.position.set(0, 13, -2); scene.add(truss);
    const beams = [];
    const beamGeo = new THREE.ConeGeometry(1.6, 13, 24, 1, true); beamGeo.translate(0, -6.5, 0);
    [-11, -4, 4, 11].forEach((x, i) => {
        const piv = new THREE.Group(); piv.position.set(x, 13, -2); scene.add(piv);
        const b = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color: i % 2 ? '#c4b5fd' : accent, transparent: true, opacity: 0.08, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        piv.add(b);
        add(piv, new THREE.CylinderGeometry(0.35, 0.45, 0.7, 12), M('#1f1a30', { metalness: 0.7 }), 0, -0.3, 0);
        beams.push({ piv, b, ph: i * 1.7, x });
    });

    // قصاصات الاحتفال (مجمّعة بأمر رسم واحد)
    const CONF_N = 160, conf = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.16, 0.26), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false }), CONF_N);
    conf.visible = false; scene.add(conf);
    const confP = []; const confCols = [accent, '#fbbf24', '#f472b6', '#34d399', '#60a5fa', '#ffffff'];
    for (let i = 0; i < CONF_N; i++) { conf.setColorAt(i, new THREE.Color(confCols[i % confCols.length])); confP.push({ p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3() }); }
    let confT = -1;
    function burst(center) {
        confT = 0; conf.visible = true;
        confP.forEach((c) => { c.p.set(center.x + (Math.random() - 0.5) * 8, 13 + Math.random() * 3, center.z + (Math.random() - 0.5) * 5); c.v.set((Math.random() - 0.5) * 2, -2 - Math.random() * 2.5, (Math.random() - 0.5) * 2); c.w.set(Math.random() * 6, Math.random() * 6, Math.random() * 6); });
    }

    // ---------------------------------------------------------------- منصة الدور: بقعة ضوء لكل لاعب بالدفعة
    const hot = [];
    const hotBeamGeo = new THREE.ConeGeometry(1.25, 11, 28, 1, true); hotBeamGeo.translate(0, -5.5, 0);
    for (let i = 0; i < 5; i++) {
        const g = new THREE.Group(); g.visible = false; scene.add(g);
        const disc = new THREE.Mesh(new THREE.CircleGeometry(1.15, 40), new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        disc.rotation.x = -Math.PI / 2; disc.position.y = DECK_Y + 0.02; g.add(disc);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.05, 6, 48), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, toneMapped: false }));
        ring.rotation.x = Math.PI / 2; ring.position.y = DECK_Y + 0.03; g.add(ring);
        const beam = new THREE.Mesh(hotBeamGeo, new THREE.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
        beam.position.y = 11 + DECK_Y; g.add(beam);
        hot.push({ g, disc, ring, beam, a: 0 });
    }
    /** مكان اللاعب رقم i من n بمنصة الدور (الأول يمين الشاشة مثل القراءة بالعربي) */
    function frontSlot(i, n, out) { return out.set(((n - 1) / 2 - i) * FRONT_GAP, DECK_Y, FRONT_Z); }

    // ---------------------------------------------------------------- اللاعبين
    const figs = new Map();
    function makeFig(p) {
        const root = new THREE.Group();
        const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 1.08, 1, 28), M('#221b38', { roughness: 0.35, metalness: 0.3 }));
        pod.castShadow = pod.receiveShadow = true; root.add(pod);
        const ringMat = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.05, 6, 40), ringMat); ring.rotation.x = Math.PI / 2; root.add(ring);
        const glow = new THREE.Mesh(new THREE.CircleGeometry(1.5, 32), new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
        glow.rotation.x = -Math.PI / 2; root.add(glow);
        const ch = buildFigure(p.look); root.add(ch);
        const name = sprite(512, 96, 0.62, 10); root.add(name);
        const badge = sprite(128, 128, 0.62, 12); badge.visible = false; root.add(badge);
        scene.add(root);
        return { root, pod, ring, ringMat, glow, ch, name, badge, look: p.look, home: new THREE.Vector3(), podH: POD_H, faceY: 0, born: performance.now(), hop: -1, ph: Math.random() * 6, scale: 0.001, flash: 0, lastSent: false };
    }
    function dropFig(f) {
        scene.remove(f.root);
        f.root.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } else if (o.isMesh && o.geometry) { o.geometry.dispose(); if (!o.material.isMeshStandardMaterial) o.material.dispose(); } });
    }

    /** أماكن المنصات: قوس واحد لين 8 لاعبين، وفوقها صفين (الخلفي أعلى). */
    function layout(n) {
        const out = [], rows = n > 8 ? 2 : 1, back = rows === 2 ? Math.floor(n / 2) : 0, front = n - back;
        const row = (count, R, h, half) => {
            const step = Math.min(0.42, 2.3 / Math.max(1, count - 1)), a0 = -step * (count - 1) / 2 + (half ? step / 2 : 0);
            for (let i = 0; i < count; i++) {
                const a = a0 + step * i;
                out.push({ pos: new THREE.Vector3(Math.sin(a) * R, 0, STAGE_Z - WAIT_BACK + Math.cos(a) * R), rot: a * 0.75, h });
            }
        };
        row(front, 9.5 + Math.max(0, front - 6) * 0.35, POD_H);
        if (back) row(back, 13.2, POD_H_BACK, back === front);   // الخلفي (أعلى) بين فراغات الأمامي عشان ما ينحجب
        return out;
    }

    // ---------------------------------------------------------------- الحالة ← المشهد
    let F = null, lastStageSeq = -1, lastStageK = '', layoutN = -1, focus = null, confFor = '';
    function roster() {
        if (F.G) return F.G.players.map((p) => ({ id: p.id, name: p.name, look: p.look, seat: p.seat, left: p.left }));
        return ((F.room && F.room.players) || []).map((p, i) => ({ id: p.id, name: p.name, look: p.look, seat: i, left: !p.online }));
    }
    function sync() {
        const list = roster(), keep = new Set(list.map((p) => p.id));
        for (const [id, f] of figs) if (!keep.has(id)) { dropFig(f); figs.delete(id); }
        const n = list.length;
        const lay = layout(n);
        list.forEach((p) => {
            let f = figs.get(p.id);
            if (f && f.look !== p.look) { dropFig(f); figs.delete(p.id); f = null; }
            if (!f) { f = makeFig(p); figs.set(p.id, f); }
            const L = lay[Math.min(p.seat, lay.length - 1)] || lay[0];
            f.home.copy(L.pos); f.root.rotation.y = L.rot; f.podH = L.h; f.p = p;
            f.pod.scale.y = L.h; f.pod.position.y = L.h / 2; f.ring.position.y = L.h + 0.01; f.glow.position.y = L.h + 0.02;
            if (!f.placed) { f.ch.position.set(0, L.h, 0); f.baseY = L.h; }
            if (layoutN !== n || !f.placed) { f.root.position.copy(f.home); f.placed = true; }
        });
        layoutN = n;
    }

    function headPos(f, out) { f.ch.getWorldPosition(out); out.y += 2.3; return out; }
    function centroid(ids) {
        const c = new THREE.Vector3(); let n = 0, spread = 0; const tmp = new THREE.Vector3(), pts = [];
        ids.forEach((id) => { const f = figs.get(id); if (f) { headPos(f, tmp); c.add(tmp); pts.push(tmp.clone()); n++; } });
        if (!n) return null;
        c.divideScalar(n);
        pts.forEach((q) => { spread = Math.max(spread, q.distanceTo(c)); });
        return { c, spread };
    }

    // ---------------------------------------------------------------- كل فريم
    const clock = new THREE.Clock();
    const P = new THREE.Vector3(), Lk = new THREE.Vector3(), tmpV = new THREE.Vector3();
    const vo = { x: 0, y: 0 }; let occl = false;
    const mood = { hemi: 0.9, key: 1.6, rim: 1.2, spot: 0, fog: new THREE.Color('#0b0814'), red: 0 };
    let raf = 0, last = -1e9, lite = false, pf = { n: 0, s: 0, w: 0 };
    const mob = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function frame(nowMs) {
        raf = requestAnimationFrame(frame);
        if (nowMs - last < 30) return;   // ~30 إطار: نفس سرعة البث، وأخف على جهاز المذيع
        last = nowMs;
        const raw = clock.getDelta(), dt = Math.min(raw, 0.06), t = clock.elapsedTime;
        perf(raw);
        F = getFrame() || {}; sync();
        const G = F.G, st = G && G.stage, k = st ? st.k : 'lobby';
        const now = F.now || Date.now();
        const el = st ? now - st.at : 0, dur = st && st.ends ? st.ends - st.at : 0, u = dur ? clamp01(el / dur) : 0;
        if (st && st.seq !== lastStageSeq) { lastStageSeq = st.seq; lastStageK = k; }

        const players = G ? G.players : [];
        const pById = {}; players.forEach((p) => { pById[p.id] = p; });
        const batchIds = G && G.batch >= 0 ? players.filter((p) => p.batch === G.batch).map((p) => p.id) : [];
        const accused = G && G.accused;
        const res = G && G.result;
        const winners = res ? players.filter((p) => (res.winner === 'out' ? p.out : res.winner === 'in' ? !p.out : false)).map((p) => p.id) : [];

        // ---- شاشة LED
        if (!G) drawLed('خارج التغطية', 'امسح الباركود وادخل من جوالك', '');
        else if (k === 'intro') drawLed('خارج التغطية', 'استعدوا… بدأت المباراة', '');
        else if (k === 'deal') drawLed('المعلومات السرية', 'تم توزيعها على الجوالات', '');
        else if (k === 'write' || k === 'show') drawLed('التلميحات', 'الدفعة ' + (G.batch + 1) + ' من ' + G.batches + ' · الفئة: ' + G.cat, '');
        else if (k === 'talk') drawLed('مين تشك فيه؟', 'نقاش · الفئة: ' + G.cat, '');
        else if (k === 'vote') drawLed('التصويت السري', 'صوّت من جوالك', 'red');
        else if (k === 'runoff') drawLed('تصويت فاصل', 'تعادل! صوّتوا بين المتعادلين', 'red');
        else if (k === 'reveal' || k === 'unmask') drawLed('لحظة الكشف', '', 'red');
        else if (k === 'guess' || k === 'guessed') drawLed('التخمين الأخير', 'فرصة أخيرة للفوز', 'red');
        else if (k === 'over') drawLed(res && res.winner === 'in' ? 'انكشف!' : res && res.winner === 'out' ? 'خارج التغطية فاز' : 'انتهت', G.words ? 'الكلمة: ' + G.words.word : '', '');

        // ---- الإضاءة حسب المرحلة
        let tHemi = 0.9, tKey = 1.6, tRim = 1.2, tSpot = 0, tRed = 0; focus = null;
        if (!G || k === 'intro') { tHemi = 0.75 + (k === 'intro' ? ease(span(u, 0, 0.5)) * 0.2 : 0.15); }
        if (k === 'deal') { const d = Math.sin(Math.PI * clamp01(u)); tHemi = 0.9 - d * 0.55; tKey = 1.6 - d * 1.1; }
        if (k === 'write' || k === 'show') { tSpot = batchIds.length ? 1.2 : 0; }
        if (k === 'vote' || k === 'runoff') { tHemi = 0.55; tKey = 0.95; tRed = 1; }
        if (k === 'reveal') { const dimK = ease(span(u, 0, 0.25)); tHemi = 0.9 - dimK * 0.6; tKey = 1.6 - dimK * 1.25; tRed = 0.5; if (accused && u > 0.62) { focus = accused; tSpot = 3.2; } }
        if (k === 'unmask' || k === 'guess' || k === 'guessed') { tHemi = 0.4; tKey = 0.5; focus = accused; tSpot = 3.4; tRed = G.accusedOut ? 1 : 0; }
        if (k === 'over') { tHemi = 1; tKey = 1.7; tSpot = winners.length ? 2.2 : 0; }
        const km = 1 - Math.exp(-dt * 3);
        mood.hemi += (tHemi - mood.hemi) * km; mood.key += (tKey - mood.key) * km; mood.rim += (tRim - mood.rim) * km; mood.spot += (tSpot - mood.spot) * km; mood.red += (tRed - mood.red) * km;
        hemi.intensity = mood.hemi; key.intensity = mood.key; rim.intensity = mood.rim; spot.intensity = mood.spot * 40;
        rim.color.set(accent).lerp(tmpColor.set('#ef4444'), mood.red);
        neon.material.color.set(accent).lerp(tmpColor.set('#ef4444'), mood.red);
        scene.background.copy(BG).lerp(tmpColor.set('#1a0710'), mood.red * 0.6); scene.fog.color.copy(scene.background);

        // البقعة: على صاحب اللحظة، أو على مركز الدفعة
        let spotTarget = null;
        if (focus && figs.get(focus)) spotTarget = figs.get(focus).root.position;
        else if (k === 'over' && winners.length) { const c = centroid(winners); if (c) spotTarget = c.c; }
        else if (batchIds.length) { const c = centroid(batchIds); if (c) spotTarget = c.c; }
        if (spotTarget) { spot.target.position.lerp(tmpV.set(spotTarget.x, 0, spotTarget.z), km * 2); spot.position.set(spot.target.position.x * 0.6, 16, spot.target.position.z + 6); }

        // حزم الضوء: تتمايل بهدوء، وتتجه للمكشوف/الفائز
        const beamAim = spotTarget && (focus || k === 'over') ? spotTarget : null;
        beams.forEach((B) => {
            let rx = Math.sin(t * 0.35 + B.ph) * 0.25, rz = Math.cos(t * 0.27 + B.ph) * 0.3;
            if (beamAim) { const dx = beamAim.x - B.x, dz = beamAim.z - (-2), dy = 13; rz = Math.atan2(dx, dy); rx = -Math.atan2(dz, dy); }
            if (mob) { rx *= 0.3; rz *= 0.3; }
            B.piv.rotation.x += (rx - B.piv.rotation.x) * km; B.piv.rotation.z += (rz - B.piv.rotation.z) * km;
            B.b.material.opacity = 0.05 + (beamAim ? 0.07 : 0) + mood.red * 0.02;
            B.b.material.color.set(mood.red > 0.5 ? '#f87171' : (B.ph > 2 ? '#c4b5fd' : accent));
        });

        // ---- الشخصيات
        let seatNo = 0;
        const ordered = [...figs.values()].sort((a, b) => a.p.seat - b.p.seat);
        ordered.forEach((f) => {
            seatNo++;
            const p = f.p, gp = pById[p.id] || {}, U = f.ch.userData, ph = t * 2 + f.ph;
            // الدخول: تكبر من الصفر بقفزة خفيفة · اللي طلع: تنزل وتبهت (ما تختفي قبل نهاية الحدث)
            const targetScale = p.left ? 0.82 : 1;
            f.scale += (targetScale - f.scale) * (1 - Math.exp(-dt * 6));
            const pop = f.scale < 0.98 && !p.left ? Math.sin(f.scale * Math.PI) * 0.15 : 0;
            f.ch.scale.setScalar(Math.max(0.001, f.scale + pop));
            f.root.position.lerp(f.home, 1 - Math.exp(-dt * 4));

            // حالة اللاعب ← لون حلقة المنصة والشارة والحركة
            const inBatch = batchIds.indexOf(p.id) >= 0;
            const upFront = inBatch && (k === 'write' || k === 'show') && !p.left;
            f.walking = walkTo(f, upFront ? frontSlot(batchIds.indexOf(p.id), batchIds.length, tmpW) : null, Math.min(raw, 0.25));   // المشي بالوقت الفعلي حتى لو الإطارات قليلة
            let ringC = accent, glowO = 0, badge = null, badgeN = null, anim = 'idle';
            if (p.left) { ringC = '#3f3f46'; anim = 'still'; }
            else if (k === 'write' && inBatch) { ringC = gp.sent ? '#22c55e' : '#c4b5fd'; glowO = 0; badge = gp.sent ? 'sent' : 'typing'; anim = gp.sent ? 'idle' : 'type'; }
            else if (k === 'show' && inBatch) { ringC = gp.hint ? '#22c55e' : '#71717a'; glowO = 0.25; badge = gp.hint ? null : 'none'; }
            else if (k === 'vote' || k === 'runoff') { const cand = !G.runoff || G.runoff.indexOf(p.id) >= 0; ringC = cand ? '#f87171' : '#3f3f46'; badge = gp.voted ? 'voted' : null; anim = 'still'; }
            else if (k === 'reveal' && G.tally) {
                // العدادات تطلع بالتتابع (حسب ترتيب المنصات) ثم البقعة على صاحب أعلى الأصوات
                const showAt = 0.22 + (seatNo / Math.max(1, figs.size)) * 0.36;
                if (u >= showAt && G.tally.counts[p.id] != null) { badge = 'count'; badgeN = G.tally.counts[p.id]; }
                ringC = p.id === accused && u > 0.62 ? '#ef4444' : '#3f3f46'; anim = 'still';
                if (p.id === accused && u > 0.62) glowO = 0.5;
            }
            else if (k === 'unmask' || k === 'guess' || k === 'guessed') {
                if (p.id === accused) { ringC = G.accusedOut ? '#ef4444' : '#3b82f6'; glowO = 0.55; badge = G.accusedOut ? 'out' : 'in'; anim = G.accusedOut ? (k === 'guessed' && G.guessOk ? 'cheer' : 'caught') : 'shrug'; }
                else { ringC = '#3f3f46'; anim = 'still'; }
            }
            else if (k === 'over' && res) {
                const win = winners.indexOf(p.id) >= 0;
                ringC = gp.out ? '#ef4444' : '#3b82f6'; glowO = win ? 0.5 : 0; badge = gp.out ? 'out' : null;
                anim = win ? 'cheer' : res.winner === 'none' ? 'idle' : 'sad';
            }
            else if (k === 'intro' && el < 2500) anim = 'wave';
            // لحظة الإرسال: قفزة وومضة على المنصة
            const sentNow = k === 'write' && inBatch && !!gp.sent;
            if (sentNow && !f.lastSent) { f.hop = 0; f.flash = 1; }
            f.lastSent = sentNow;
            if (f.walking) anim = 'walk';
            else if (!upFront && batchIds.length && (k === 'write' || k === 'show')) anim = 'wait';

            f.ringMat.color.set(ringC);
            f.flash = Math.max(0, f.flash - dt * 1.6);
            f.glow.material.color.set(ringC); f.glow.material.opacity = Math.min(0.8, glowO + f.flash * 0.6);
            if (badge) { drawBadge(f.badge, badge, badgeN); f.badge.visible = true; const bs = badge === 'count' ? 0.85 : 0.62; f.badge.scale.set(bs, bs, 1); } else f.badge.visible = false;
            drawName(f.name, p.name, p.seat + 1, inBatch && (k === 'write' || k === 'show') ? '#a78bfa' : (p.id === accused && (k === 'unmask' || k === 'guess' || k === 'guessed')) ? (G.accusedOut ? '#ef4444' : '#3b82f6') : null, p.left);
            // اللافتات تختفي باللقطات القريبة على غيره عشان ما تزحم
            f.name.visible = !(focus && focus !== p.id && (k === 'unmask' || k === 'guess' || k === 'guessed')) && !(k === 'show' && inBatch);
            f.name.material.opacity = (k === 'write' || k === 'show') && batchIds.length && !inBatch ? 0.35 : 1;

            animate(f, U, anim, dt, t, ph);
            // الاسم والشارة يمشون مع الشخصية
            f.name.position.copy(f.ch.position); f.name.position.y += 3.35;
            f.badge.position.copy(f.ch.position); f.badge.position.y += 4.05;
        });

        // بقع منصة الدور: تضوي بأماكن الدفعة الحالية (أخضر خفيف للي أرسل)
        const hotOn = (k === 'write' || k === 'show') ? batchIds.length : 0;
        hot.forEach((H, i) => {
            const on = i < hotOn;
            H.a += ((on ? 1 : 0) - H.a) * (1 - Math.exp(-dt * 4));
            H.g.visible = H.a > 0.01;
            if (!H.g.visible) return;
            if (on) { frontSlot(i, hotOn, tmpW); H.g.position.set(tmpW.x, 0, tmpW.z); }
            const gp = on ? pById[batchIds[i]] || {} : {}, sent = k === 'write' ? gp.sent : !!gp.hint;
            H.ring.material.color.set(sent ? '#22c55e' : accent);
            H.disc.material.opacity = H.a * (0.28 + Math.sin(t * 3 + i) * 0.04);
            H.ring.material.opacity = H.a * 0.9;
            H.beam.material.opacity = H.a * 0.1;
        });

        // ---- القصاصات
        if (k === 'over' && res && res.winner !== 'none' && confFor !== G.mid) { confFor = G.mid; const c = centroid(winners); burst(c ? c.c : new THREE.Vector3(0, 0, STAGE_Z + 8)); }
        if (k === 'guessed' && G.guessOk && confFor !== G.mid + 'g') { confFor = G.mid + 'g'; const f = figs.get(accused); if (f) burst(f.root.position); }
        if (confT >= 0) {
            confT += dt; const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s1 = new THREE.Vector3(1, 1, 1);
            confP.forEach((c, i) => { c.v.y -= 2.2 * dt; c.v.y = Math.max(c.v.y, -3.2); c.p.addScaledVector(c.v, dt); c.r.x += c.w.x * dt; c.r.y += c.w.y * dt; c.r.z += c.w.z * dt; q.setFromEuler(c.r); m4.compose(c.p, q, s1); conf.setMatrixAt(i, m4); });
            conf.instanceMatrix.needsUpdate = true;
            if (confT > 7) { confT = -1; conf.visible = false; }
        }

        // ---- الكاميرا (مخرج اللقطات)
        occl = false;
        direct(k, u, el, G, batchIds, accused, winners);
        const asp = Math.max(0.3, (container.clientWidth || 1) / (container.clientHeight || 1));
        const rate = k === 'reveal' && u > 0.6 ? 1.7 : k === 'intro' ? 1.4 : 2.3;
        const kc = 1 - Math.exp(-dt * (mob ? rate * 0.7 : rate));
        cam.position.lerp(P, kc); camLook.lerp(Lk, kc); cam.lookAt(camLook);
        const fov = asp < 0.8 ? 58 : asp < 1.3 ? 48 : 40; if (Math.abs(cam.fov - fov) > 0.1) { cam.fov = fov; cam.updateProjectionMatrix(); }
        // الإطار يتزحزح بعيد عن اللوحات: اللوبي يسار، لوحة التلميحات يمين، والنتيجة تحت (وبالشاشة العمودية كلها تحت)
        const tall = asp < 0.8; let sx = 0, sy = 0;
        if (!G) { if (tall) sy = 0.2; else sx = -0.15; }
        else if (k === 'talk' || k === 'vote' || k === 'runoff') { if (tall) sy = 0.14; else sx = 0.11; }
        else if (k === 'over') sy = 0.2;
        vo.x += (sx - vo.x) * kc; vo.y += (sy - vo.y) * kc;
        const vw = container.clientWidth || 1, vh = container.clientHeight || 1;
        if (Math.abs(vo.x) > 0.002 || Math.abs(vo.y) > 0.002) cam.setViewOffset(vw, vh, vo.x * vw, vo.y * vh, vw, vh); else if (cam.view && cam.view.enabled) cam.clearViewOffset();
        // اللقطات القريبة: أي شخصية بين الكاميرا وصاحب اللقطة تختفي مؤقتاً (ما تسد الكادر)
        const seg = camLook.clone().sub(cam.position), segL = seg.length(); seg.normalize();
        const subj = new Set([].concat(batchIds, winners, accused ? [accused] : [], (G && G.runoff) || []));
        for (const [id, f] of figs) {
            let hide = false;
            if (occl && !subj.has(id)) { headPos(f, tmpV).y -= 0.8; const rel = tmpV.sub(cam.position), along = rel.dot(seg); hide = along > 0 && along < segL - 1.4 && rel.addScaledVector(seg, -along).length() < 1.25; }
            f.ch.visible = !hide; if (hide) { f.name.visible = false; f.badge.visible = false; }
        }

        r.render(scene, cam);
    }
    const tmpColor = new THREE.Color();

    /** يحدد مكان الكاميرا (P) ونقطة النظر (Lk) لكل مرحلة — الحركة نفسها ناعمة (lerp) بمعدل ثابت. */
    function direct(k, u, el, G, batchIds, accused, winners) {
        const asp = (container.clientWidth || 1) / (container.clientHeight || 1), far = asp < 0.8 ? 1.75 : asp < 1.3 ? 1.25 : 1;
        const n = figs.size, wideZ = (n > 8 ? 25 : 21) * far, t = clock.elapsedTime;
        const wide = () => { P.set(Math.sin(t * 0.05) * 3, 7.5 * Math.min(far, 1.3), STAGE_Z + wideZ); Lk.set(0, 2.2, STAGE_Z + 1.5); };
        if (!G) { const a = Math.sin(t * 0.07) * 0.28; P.set(Math.sin(a) * wideZ, 8 * Math.min(far, 1.3), STAGE_Z + Math.cos(a) * wideZ); Lk.set(0, 2, STAGE_Z + 2); return; }
        if (k === 'intro') {
            // تأسيسية: من فوق بعيد ← تنزل وتقرب على كل الشخصيات
            const a = ease(span(u, 0, 0.7)), b = ease(span(u, 0.55, 1));
            P.set(-6 * (1 - a), 18 - 9 * a - 1.5 * b, STAGE_Z + wideZ + 14 * (1 - a) - 4 * b);
            Lk.set(0, 1.5 + 0.8 * a, STAGE_Z + 1);
            return;
        }
        if (k === 'deal') { P.set(0, 17 * Math.min(far, 1.25), STAGE_Z + 13 * far); Lk.set(0, 0.5, STAGE_Z + 2.5); return; }
        if ((k === 'write' || k === 'show') && batchIds.length) {
            // متوسطة على لاعبين الدفعة، وزاوية مختلفة لكل دفعة (يمين · يسار · وسط أعلى)
            // الكاميرا ثابتة على منصة الدور (مو تلاحقهم): الدفعة تمشي وتدخل الكادر
            const nB = batchIds.length, c = { c: new THREE.Vector3(0, DECK_Y + 2.3, FRONT_Z), spread: Math.max(1.2, (nB - 1) * FRONT_GAP / 2 + 0.6) };
            const side = [0.42, -0.42, 0][G.batch % 3], dist = (5.6 + c.spread * 1.15 + (k === 'show' ? -0.6 : 0)) * far;
            const dir = new THREE.Vector3(c.c.x - 0, 0, c.c.z - STAGE_Z).normalize(); if (!isFinite(dir.x)) dir.set(0, 0, 1);
            dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), side);
            P.set(c.c.x + dir.x * dist, c.c.y + 1.4 + (G.batch % 3 === 2 ? 1.2 : 0), c.c.z + dir.z * dist);
            Lk.set(c.c.x, c.c.y - 0.3 + (k === 'show' ? 0.5 : 0), c.c.z);
            occl = true; return;
        }
        if (k === 'talk') { const a = Math.sin(t * 0.09) * 0.22; P.set(Math.sin(a) * wideZ * 0.92, 6.5, STAGE_Z + Math.cos(a) * wideZ * 0.92); Lk.set(0, 2.3, STAGE_Z + 1.5); return; }
        if (k === 'vote' || k === 'runoff') {
            // علوية تكشف توزيع الكل — وبالفاصلة تقرب على المتعادلين
            if (k === 'runoff' && G.runoff && G.runoff.length) { const c = centroid(G.runoff); if (c) { P.set(c.c.x, c.c.y + 5.5, c.c.z + (7 + c.spread * 1.2) * far); Lk.copy(c.c).setY(c.c.y - 0.6); occl = true; return; } }
            const a = Math.sin(t * 0.05) * 0.12; P.set(Math.sin(a) * 20 * far, 15.5 * Math.min(far, 1.3), STAGE_Z + Math.cos(a) * 20.5 * far); Lk.set(0, 0.8, STAGE_Z + 2.5); return;
        }
        const af = accused && figs.get(accused);
        if (k === 'reveal') {
            if (af && u > 0.62) { headPos(af, tmpV); const yaw = af.root.rotation.y, d = 5.4 * Math.min(far, 1.4); P.set(tmpV.x + Math.sin(yaw) * d, tmpV.y + 0.9, tmpV.z + Math.cos(yaw) * d); Lk.set(tmpV.x, tmpV.y - 0.5, tmpV.z); occl = true; return; }
            P.set(0, 8.5, STAGE_Z + wideZ * 1.02); Lk.set(0, 2, STAGE_Z + 1.5); return;
        }
        if ((k === 'unmask' || k === 'guess' || k === 'guessed') && af) {
            // لقطة البطل: أقرب ومن تحت شوي
            headPos(af, tmpV);
            const yaw = af.root.rotation.y + (k === 'guess' ? Math.sin(t * 0.2) * 0.25 : 0.22);
            const d = (k === 'guess' ? 4.8 : 4.1) * Math.min(far, 1.45);
            P.set(tmpV.x + Math.sin(yaw) * d, tmpV.y - 0.3, tmpV.z + Math.cos(yaw) * d); Lk.set(tmpV.x, tmpV.y - 0.6, tmpV.z);
            occl = true; return;
        }
        if (k === 'over') {
            if (winners.length && winners.length <= 3) { const c = centroid(winners); if (c) { const a = Math.sin(t * 0.15) * 0.35, d = (6 + c.spread * 1.2) * Math.min(far, 1.4); const yaw = Math.atan2(c.c.x, c.c.z - STAGE_Z) + a; P.set(c.c.x + Math.sin(yaw) * d, c.c.y + 0.8, c.c.z + Math.cos(yaw) * d); Lk.set(c.c.x, c.c.y - 0.4, c.c.z); occl = true; return; } }
            return wide();
        }
        wide();
    }

    const tmpW = new THREE.Vector3(), tmpL = new THREE.Vector3();
    /**
     * يحرك الشخصية لمكان (عالمي) أو يرجعها لمنصتها (null). يرجع true وهي تمشي.
     * المنصة تبقى مكانها (منطقة الانتظار)، والشخصية بس اللي تتحرك.
     */
    function walkTo(f, world, dt) {
        f.root.updateMatrixWorld();
        if (world) { tmpL.copy(world); f.root.worldToLocal(tmpL); tmpL.y = DECK_Y - f.root.position.y; }
        else tmpL.set(0, f.podH, 0);
        const cp = f.ch.position, dx = tmpL.x - cp.x, dz = tmpL.z - cp.z, dist = Math.hypot(dx, dz);
        if (dist > 0.06) {
            const st = Math.min(dist, dt * WALK_SPEED);
            cp.x += dx / dist * st; cp.z += dz / dist * st;
            f.baseYaw = Math.atan2(dx, dz);
            // ينزل من المنصة أول خطوة ويطلع لها آخر خطوة
            const homeD = Math.hypot(cp.x, cp.z);
            f.baseY = homeD < 1.0 ? f.podH + (DECK_Y - f.root.position.y - f.podH) * Math.min(1, homeD) : DECK_Y - f.root.position.y;
            return true;
        }
        cp.x = tmpL.x; cp.z = tmpL.z; f.baseY = tmpL.y;
        // واقف: بمنصة الدور يواجه الكاميرا، وبمنصته باتجاهها
        f.baseYaw = world ? -f.root.rotation.y : 0;
        return false;
    }

    /** حركة الشخصية حسب الحدث — الباقين هادئين (اهتزاز تنفس بسيط) عشان ما يتشتت المشاهد. */
    function animate(f, U, anim, dt, t, ph) {
        const k = 1 - Math.exp(-dt * 10);
        let y = 0, ax0 = 0, ax1 = 0, az0 = -0.2, az1 = 0.2, hx = 0, hz = Math.sin(ph * 0.4) * 0.04, ry = f.baseYaw || 0, lg = 0;
        U.phone.visible = anim === 'type';
        if (anim === 'walk') { const w = t * 11 + f.ph; lg = Math.sin(w) * 0.6; ax0 = -Math.sin(w) * 0.5; ax1 = Math.sin(w) * 0.5; y = Math.abs(Math.sin(w)) * 0.06; hz = 0; }
        else if (anim === 'type') {
            // منزّل راسه يكتب بالجوال: اليدين قدّام ومضمومة، والإبهام ينقر
            const tap = Math.sin(t * 16 + f.ph) * 0.06;
            hx = 0.5 + Math.sin(t * 1.3 + f.ph) * 0.04; hz = Math.sin(t * 0.9 + f.ph) * 0.05;
            ax0 = -1.05 + tap; ax1 = -1.05 - tap; az0 = 0.42; az1 = -0.42;
        }
        else if (anim === 'wait') { hz = Math.sin(ph * 0.3) * 0.05; }
        else if (anim === 'turn') { y = Math.abs(Math.sin(ph * 1.6)) * 0.08; ax0 = Math.sin(ph) * 0.4; ax1 = -Math.sin(ph) * 0.4; hz = Math.sin(ph * 0.8) * 0.1; }
        else if (anim === 'wave') { az1 = 2.6 + Math.sin(t * 9) * 0.35; hz = 0.1; }
        else if (anim === 'cheer') { const c = t * 7 + f.ph; y = Math.abs(Math.sin(c * 0.5)) * 0.8; az0 = -2.7 + Math.sin(c) * 0.3; az1 = 2.7 - Math.sin(c) * 0.3; hz = Math.sin(c) * 0.15; lg = Math.sin(c * 0.5) * 0.4; }
        else if (anim === 'sad') { hx = 0.38; az0 = -0.08; az1 = 0.08; }
        else if (anim === 'caught') { az0 = -2.4; az1 = 2.4; hz = Math.sin(t * 6) * 0.18; ax0 = ax1 = -0.2; }
        else if (anim === 'shrug') { az0 = -1.1; az1 = 1.1; ax0 = ax1 = -0.6; hz = 0.18; }
        else if (anim === 'still') { hz = 0; }
        else { y = 0; }
        if (f.hop >= 0) { f.hop += dt; const q = f.hop / 0.5; if (q >= 1) f.hop = -1; else y += Math.sin(q * Math.PI) * 0.45; }
        U.arms[0].rotation.z += (az0 - U.arms[0].rotation.z) * k; U.arms[1].rotation.z += (az1 - U.arms[1].rotation.z) * k;
        U.arms[0].rotation.x += (ax0 - U.arms[0].rotation.x) * k; U.arms[1].rotation.x += (ax1 - U.arms[1].rotation.x) * k;
        U.head.rotation.x += (hx - U.head.rotation.x) * k; U.head.rotation.z += (hz - U.head.rotation.z) * k;
        U.legs[0].rotation.x = lg; U.legs[1].rotation.x = -lg;
        f.ch.position.y = (f.baseY == null ? f.podH : f.baseY) + y + (anim === 'idle' ? Math.sin(ph * 0.7) * 0.015 : 0);
        let dy = ry - f.ch.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        f.ch.rotation.y += dy * (1 - Math.exp(-dt * 8));
    }

    // وضع الأداء: لو الإطارات نزلت تحت 22/ث تنطفي الظلال وتنزل الدقة (نفس سفينة النجاة)
    function perf(raw) {
        if (lite || raw > 0.5) return; pf.w += raw; if (pf.w < 3) return; pf.n++; pf.s += raw;
        if (pf.s >= 2) { const fps = pf.n / pf.s; pf.n = 0; pf.s = 0; if (fps < 22) goLite(); }
    }
    function goLite() {
        lite = true; key.castShadow = false; r.shadowMap.enabled = false; r.setPixelRatio(0.8); resize();
        scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); });
    }

    function resize() { const w = container.clientWidth || 1, h = container.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }
    const ro = new ResizeObserver(resize); ro.observe(container); resize();
    raf = requestAnimationFrame(frame);

    const proj = new THREE.Vector3();
    return {
        /** مكان فوق رأس الشخصية على الشاشة (بكسل) — لبطاقات التلميح بشاشة البث */
        project(id) {
            const f = figs.get(id); if (!f) return null;
            f.ch.getWorldPosition(proj); proj.y += 3.05; proj.project(cam);
            const w = container.clientWidth, h = container.clientHeight;
            return { x: (proj.x * 0.5 + 0.5) * w, y: (-proj.y * 0.5 + 0.5) * h, on: proj.z < 1 && Math.abs(proj.x) < 1.1 && Math.abs(proj.y) < 1.1 };
        },
        isLite: () => lite,
        dispose() {
            cancelAnimationFrame(raf); ro.disconnect();
            for (const [, f] of figs) dropFig(f); figs.clear();
            scene.traverse((o) => { o.geometry && o.geometry.dispose(); [].concat(o.material || []).forEach((m) => { for (const kk in m) if (m[kk] && m[kk].isTexture) m[kk].dispose(); m.dispose(); }); });
            MATS.clear(); r.dispose(); r.domElement.remove();
        }
    };
}
