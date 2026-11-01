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
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

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
    if (o.role || o.team) {
        // الدور كامل لو مكشوف، وإلا الفريق بس (المطرود حسب القواعد)
        const R = o.role ? L.ROLE[o.role] : o.team === 'mafia' ? { icon: '🔪', n: 'مافيا', c: '#e2483d' } : { icon: '🏠', n: 'من المدينة', c: '#2f7de1' };
        const t = R.icon + ' ' + R.n;
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

// ---------------------------------------------------------------- الشخصية (نفس تصميم شخصيات «سفينة النجاة» — games/survival-ship/ship3d.js)
const CHAR_K = 0.72;   // مقياس الشخصية بالساحة (وحدات السفينة أكبر)
const SIT_Y = -0.12;   // نزول الجسم وهو جالس عشان الحوض يركب على الكرسي
const GEO_HI = {
    head: new THREE.SphereGeometry(0.62, 28, 22),
    ear: new THREE.SphereGeometry(0.13, 12, 10),
    eye: new THREE.SphereGeometry(0.12, 16, 12),
    shine: new THREE.SphereGeometry(0.04, 8, 6),
    brow: new THREE.CapsuleGeometry(0.025, 0.13, 3, 6),
    cheek: new THREE.SphereGeometry(0.09, 10, 8),
    mouth: new THREE.TorusGeometry(0.08, 0.022, 6, 14, Math.PI),
    neck: new THREE.CylinderGeometry(0.13, 0.15, 0.16, 12),
    torso: new THREE.CapsuleGeometry(0.36, 0.42, 6, 16),
    collar: new THREE.TorusGeometry(0.3, 0.06, 8, 20),
    belt: new THREE.CylinderGeometry(0.37, 0.37, 0.09, 18),
    button: new THREE.SphereGeometry(0.07, 10, 8),
    arm: new THREE.CapsuleGeometry(0.1, 0.34, 4, 10),
    hand: new THREE.SphereGeometry(0.12, 12, 10),
    leg: new THREE.CapsuleGeometry(0.13, 0.14, 4, 10),
    shoe: new THREE.SphereGeometry(0.19, 14, 10),
    sole: new THREE.CylinderGeometry(0.19, 0.19, 0.05, 14),
    hairCap: new THREE.SphereGeometry(0.67, 28, 18, 0, TAU, 0, Math.PI * 0.52),
    fringe: new THREE.SphereGeometry(0.2, 12, 10),
    tail: new THREE.CapsuleGeometry(0.16, 0.55, 6, 12),
    clip: new THREE.SphereGeometry(0.09, 10, 8),
    backHair: new THREE.SphereGeometry(0.5, 18, 14),
    cap: new THREE.SphereGeometry(0.475, 32, 16, 0, TAU, 0, 1.3),
    blob: new THREE.SphereGeometry(0.17, 12, 10),
    stool: new THREE.CylinderGeometry(0.3, 0.26, 0.42, 18)
};

// نسخة خفيفة للحلقات البعيدة (أقل تقسيمات) — نفس الأشكال بمثلثات أقل بكثير
const GEO = GEO_HI;   // الافتراضي لباقي المشهد (الكراسي وغيرها)
const GEO_LO = Object.assign({}, GEO_HI, {
    head: new THREE.SphereGeometry(0.62, 12, 9),
    eye: new THREE.SphereGeometry(0.12, 6, 5),
    torso: new THREE.CapsuleGeometry(0.36, 0.42, 3, 8),
    arm: new THREE.CapsuleGeometry(0.1, 0.34, 2, 6),
    hand: new THREE.SphereGeometry(0.12, 6, 5),
    leg: new THREE.CapsuleGeometry(0.13, 0.14, 2, 6),
    shoe: new THREE.SphereGeometry(0.19, 7, 5),
    neck: new THREE.CylinderGeometry(0.13, 0.15, 0.16, 6),
    hairCap: new THREE.SphereGeometry(0.67, 12, 6, 0, TAU, 0, Math.PI * 0.52),
    fringe: new THREE.SphereGeometry(0.2, 6, 5),
    tail: new THREE.CapsuleGeometry(0.16, 0.55, 2, 6),
    clip: new THREE.SphereGeometry(0.09, 5, 4),
    backHair: new THREE.SphereGeometry(0.5, 9, 7),
    cap: new THREE.SphereGeometry(0.475, 12, 6, 0, TAU, 0, 1.3),
    blob: new THREE.SphereGeometry(0.17, 6, 5)
});

/**
 * يبني شخصية بتصميم السفينة (رأس كبير، ياقة بيضاء وحزام وزر، جزمة بيضاء).
 * opts.outfit = 'doctor'|'detective'|'shadow' للشخصيات الخاصة.
 * يرجع {root, body, head, armL, armR, legs, eyes, mats, torso, sit(bool)} — root أصله عند الأرض.
 */
function buildChar(look, opts) {
    opts = opts || {};
    const GEO = opts.lite ? GEO_LO : GEO_HI;
    const C = L.colors(look);
    const shadow = opts.outfit === 'shadow';
    const S = (c, o) => mat(c, Object.assign({ roughness: 0.55 }, o || {}));
    const outfitC = opts.outfit === 'doctor' ? '#f4f6f8' : opts.outfit === 'detective' ? '#8a6a45' : shadow ? '#0b0b10' : C.shirt;
    const skinM = shadow ? S('#0b0b10', { roughness: 1 }) : S(C.skin, { roughness: 0.5 });
    const outfitM = S(outfitC), shadeM = S(new THREE.Color(outfitC).multiplyScalar(0.75).getStyle());
    const pantsM = S(shadow ? '#0b0b10' : opts.outfit === 'doctor' ? '#2c8f86' : C.pants);
    const shoeM = S(shadow ? '#000' : '#f8fafc'), soleM = S(shadow ? '#000' : '#334155');
    const hairM = S(C.hair, { roughness: 0.45 });
    const whiteM = S(shadow ? '#0b0b10' : '#ffffff'), btnM = S(shadow ? '#0b0b10' : '#fde68a');
    const mats = [skinM, outfitM, shadeM, pantsM, shoeM, soleM, hairM, whiteM, btnM];
    const add = (geo, m, x, y, z, par) => { const o = mesh(geo, m, x, y, z); par.add(o); return o; };

    const root = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(CHAR_K); root.add(body);
    // الأرجل: فخذ من الحوض، والركبة محور للساق (جلوس = فخذ للأمام وساق للأسفل)
    const legs = [-0.17, 0.17].map((x) => {
        const hip = new THREE.Group(); hip.position.set(x, 0.78, 0); body.add(hip);
        add(GEO.leg, pantsM, 0, -0.17, 0, hip);
        const knee = new THREE.Group(); knee.position.y = -0.36; hip.add(knee);
        add(GEO.leg, pantsM, 0, -0.14, 0, knee);
        add(GEO.shoe, shoeM, 0, -0.34, 0.07, knee).scale.set(1, 0.62, 1.35);
        if (!opts.lite) add(GEO.sole, soleM, 0, -0.41, 0.07, knee);
        return { hip, knee };
    });
    const torso = add(GEO.torso, outfitM, 0, 1.18, 0, body); torso.scale.set(1, 1, 0.82);
    if (!opts.lite) {
        add(GEO.collar, whiteM, 0, 1.52, 0, body).rotation.x = Math.PI / 2;
        add(GEO.belt, shadeM, 0, 0.93, 0, body);
        add(GEO.button, btnM, 0, 1.22, 0.31, body);
    }
    const arm = (s) => {
        const g = new THREE.Group(); g.position.set(s * 0.44, 1.42, 0); body.add(g);
        add(GEO.arm, outfitM, 0, -0.24, 0, g); add(GEO.hand, skinM, 0, -0.52, 0, g);
        g.rotation.x = -0.55; g.rotation.z = s * 0.2; return g;
    };
    const armL = arm(-1), armR = arm(1);
    add(GEO.neck, skinM, 0, 1.66, 0, body);

    const head = new THREE.Group(); head.position.y = 2.18; body.add(head);
    add(GEO.head, skinM, 0, 0, 0, head).scale.set(1, 0.96, 0.94);
    if (!opts.lite) [-1, 1].forEach((s) => add(GEO.ear, skinM, s * 0.6, -0.04, 0, head).scale.set(0.6, 1, 0.8));

    const eyeM = shadow ? mat('#ff0000', { emissive: '#ff0000', emissiveIntensity: 1 }) : S('#1e1b2e', { roughness: 0.2 });
    const shineM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const eyes = [];
    [-1, 1].forEach((s) => {
        const e = add(GEO.eye, eyeM, s * 0.22, -0.02, 0.53, head); e.scale.set(0.85, 1.15, 0.5); e.userData.sy = 1.15; eyes.push(e);
        if (shadow || opts.lite) return;
        const sh = new THREE.Mesh(GEO.shine, shineM); sh.position.set(s * 0.22 + 0.03, 0.05, 0.59); head.add(sh); sh.userData.sy = 1; eyes.push(sh);
        add(GEO.brow, hairM, s * 0.22, 0.2, 0.55, head).rotation.z = Math.PI / 2 + s * 0.15;
        add(GEO.cheek, new THREE.MeshStandardMaterial({ color: '#fb7185', transparent: true, opacity: 0.55, roughness: 0.55 }), s * 0.36, -0.2, 0.47, head).scale.set(1, 0.55, 0.3);
    });
    if (!shadow) add(GEO.mouth, S('#9f1239'), 0, -0.2, 0.57, head).rotation.z = Math.PI;

    const style = opts.outfit ? (opts.outfit === 'detective' ? 'fedora' : opts.outfit === 'doctor' ? 'surgeon' : 'hood') : C.style;
    buildHair(head, style, hairM, mats, GEO);

    // الحلقات البعيدة (فوق 25 لاعب): بدون ظلال عشان الأداء
    if (opts.lite) root.traverse((o) => { o.castShadow = false; });
    root.userData.base = mats.map((m) => m.color.clone());
    const c = { root, body, head, armL, armR, legs, eyes, mats, torso, sitY: SIT_Y };
    c.sit = (on) => {
        c.sitY = on ? SIT_Y : 0; body.position.y = c.sitY;
        legs.forEach((l) => { l.hip.rotation.x = on ? -Math.PI / 2 : 0; l.knee.rotation.x = on ? Math.PI / 2 : 0; });
    };
    c.sit(true);
    return c;
}

/**
 * الحلقات البعيدة (لين 200 لاعب): نذوّب الشخصية كلها في mesh واحد بألوان على الرؤوس
 * (draw call واحد بدل ~30). الحركة بعدها للجسم كامل بس (طيحة/قفز/تلوين الميت).
 */
function bakeChar(c) {
    c.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(c.root.matrixWorld).invert(), m = new THREE.Matrix4();
    const pos = [], nor = [], col = [], idx = [];
    let base = 0;
    c.root.traverse((o) => {
        if (!o.isMesh || !o.material.color) return;
        const g = o.geometry.clone(); g.applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld));
        const P = g.attributes.position, N = g.attributes.normal, cc = o.material.color;
        for (let i = 0; i < P.count; i++) { pos.push(P.getX(i), P.getY(i), P.getZ(i)); nor.push(N.getX(i), N.getY(i), N.getZ(i)); col.push(cc.r, cc.g, cc.b); }
        if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(base + g.index.getX(i));
        else for (let i = 0; i < P.count; i++) idx.push(base + i);
        base += P.count; g.dispose();
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    const baked = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    baked.receiveShadow = true;
    c.root.remove(c.body); c.root.add(baked); c.baked = baked;
    c.mats.forEach((mm) => mm.dispose());
    return c;
}

function buildHair(head, style, hairM, mats, GEO) {
    // تسريحة السفينة: طاقية شعر + غُرّة من خمس كرات
    const shipCap = () => {
        const cap = mesh(GEO.hairCap, hairM, 0, 0.04, -0.05); cap.rotation.x = -0.32; head.add(cap);
        for (let i = -2; i <= 2; i++) { const f = mesh(GEO.fringe, hairM, i * 0.17, 0.36 - Math.abs(i) * 0.03, 0.46 - Math.abs(i) * 0.05); f.scale.set(1, 0.7, 0.6); head.add(f); }
    };
    // باقي التسريحات مصممة على رأس أصغر (0.45) فنكبّرها لرأس السفينة
    const big = new THREE.Group(); big.scale.setScalar(1.4); head.add(big);
    const cap = () => { const c = mesh(GEO.cap, hairM, 0, 0.02, -0.02); c.rotation.x = -0.42; return c; };
    switch (style) {
        case 0: { shipCap(); const back = mesh(GEO.backHair, hairM, 0, -0.05, -0.28); back.scale.set(1.15, 1, 0.8); head.add(back); break; }
        case 1: {
            shipCap();
            [-1, 1].forEach((s) => {
                const p = mesh(GEO.tail, hairM, s * 0.62, -0.32, -0.12); p.rotation.z = s * 0.12; head.add(p);
                head.add(mesh(GEO.clip, mat('#f472b6'), s * 0.6, 0.08, -0.1));
            });
            break;
        }
        case 2: {
            shipCap();
            const back = mesh(new THREE.CylinderGeometry(0.47, 0.52, 0.85, 24, 1, true, Math.PI / 2, Math.PI), hairM.clone(), 0, -0.3, -0.02);
            back.material.side = THREE.DoubleSide; mats.push(back.material); big.add(back);
            break;
        }
        case 3: shipCap(); [-1, 1].forEach((s) => big.add(mesh(new THREE.SphereGeometry(0.2, 16, 12), hairM, s * 0.33, 0.36, -0.08))); break;
        case 4: {
            for (let i = 0; i < 26; i++) {
                const phi = Math.acos(1 - (i + 0.5) / 26 * 1.15), th = i * 2.399;
                const x = Math.sin(phi) * Math.cos(th), y = Math.cos(phi), z = Math.sin(phi) * Math.sin(th);
                if (z > 0.55 && y < 0.55) continue;   // نترك الوجه مكشوف
                big.add(mesh(GEO.blob, hairM, x * 0.47, y * 0.47 + 0.02, z * 0.47 - 0.03));
            }
            break;
        }
        case 5: {
            big.add(cap());
            big.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 20, 1, false, -Math.PI / 2, Math.PI), hairM, 0, 0.2, 0.25));
            break;
        }
        case 6: {
            const ghutraM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: canvasTex(128, 128, (ctx) => {
                ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, 128, 128); ctx.fillStyle = '#c4302b';
                for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? 8 : 0; x < 128; x += 16) ctx.fillRect(x, y, 8, 8);
            }) });
            ghutraM.map.wrapS = ghutraM.map.wrapT = THREE.RepeatWrapping; ghutraM.map.repeat.set(3, 2);
            mats.push(ghutraM);
            const top = mesh(new THREE.SphereGeometry(0.5, 28, 14, 0, TAU, 0, 1.45), ghutraM, 0, 0.02, -0.03); top.rotation.x = -0.25; big.add(top);
            big.add(mesh(new THREE.CylinderGeometry(0.49, 0.56, 0.72, 24, 1, true, Math.PI * 0.45, Math.PI * 1.1), ghutraM, 0, -0.3, -0.03));
            const iqal = mesh(new THREE.TorusGeometry(0.4, 0.045, 8, 28), mat('#141414'), 0, 0.3, -0.06); iqal.rotation.x = Math.PI / 2 - 0.3; big.add(iqal);
            break;
        }
        case 'fedora': {
            const fm = mat('#3a2c22');
            big.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28), fm, 0, 0.3, 0));
            big.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.36, 24), fm, 0, 0.48, 0));
            big.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.08, 24), mat('#16110d'), 0, 0.36, 0));
            break;
        }
        case 'surgeon': big.add(mesh(GEO.cap, mat('#3fb7a8'), 0, 0.04, -0.02)); break;
        case 'hood': {
            // مفتوح من قدّام عشان تبان العيون الحمر
            const hood = mesh(new THREE.SphereGeometry(0.56, 24, 18, Math.PI / 2 + 0.75, TAU - 1.5, 0, 2.2), mat('#09090d', { roughness: 1, side: THREE.DoubleSide }), 0, 0.04, -0.06);
            hood.rotation.x = -0.2; big.add(hood);
            break;
        }
    }
}

// ---------------------------------------------------------------- المسرح
/**
 * opts.onCue(k, data)   مؤثر صوتي لحظي بتوقيت اللقطة (mafia-sfx.js)
 * opts.onAmbience(mode) جو المكان الحالي: 'plaza-night' | 'plaza-day' | 'market' | 'room'
 */
export function createStage(container, getFrame, opts) {
    opts = opts || {};
    const onCue = opts.onCue || (() => {}), onAmbience = opts.onAmbience || (() => {});
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
    const ROOM = new THREE.Vector3(80, 0, 0), ORIGIN = new THREE.Vector3(0, 0, 0);
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
    [detective, susp].forEach((c) => c.root.add(mesh(GEO.stool, mat('#3a281c'), 0, 0.21, 0)));
    const glass = new THREE.Group();
    glass.add(mesh(new THREE.TorusGeometry(0.13, 0.025, 8, 20), mat('#c9a24a', { metalness: 0.6, roughness: 0.3 })));
    glass.add(mesh(new THREE.CylinderGeometry(0.02, 0.025, 0.28, 8), mat('#3a2416'), 0, -0.27, 0));
    glass.position.set(0, -0.62, 0.05); glass.scale.setScalar(1.3); detective.armR.add(glass);
    const qTag = makeSprite(1.1); room.add(qTag); qTag.position.set(0, 2.55, -1.35);
    // جوال المحقق على الطاولة (يضيء لما توصل النتيجة) وساعة جدار
    const phoneScreen = new THREE.MeshStandardMaterial({ color: '#111', emissive: '#7dd3fc', emissiveIntensity: 0 });
    const phone = new THREE.Group(); phone.position.set(-0.55, 1.075, 0.25); phone.rotation.y = -0.4; table.add(phone);
    phone.add(mesh(new THREE.BoxGeometry(0.16, 0.02, 0.3), mat('#1c1c22'), 0, 0, 0));
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.27), phoneScreen); scr.rotation.x = -Math.PI / 2; scr.position.y = 0.011; phone.add(scr);
    const clock = new THREE.Group(); clock.position.set(-4.95, 3.6, 0); clock.rotation.y = Math.PI / 2; room.add(clock);
    const face = mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 32), mat('#e9e2cf'), 0, 0, 0); face.rotation.x = Math.PI / 2; clock.add(face);
    const handM = mat('#151515'), minH = new THREE.Group(), secH = new THREE.Group(); clock.add(minH); clock.add(secH);
    minH.add(mesh(new THREE.BoxGeometry(0.035, 0.32, 0.02), handM, 0, 0.14, 0.05)); secH.add(mesh(new THREE.BoxGeometry(0.015, 0.38, 0.02), mat('#b91c1c'), 0, 0.16, 0.06));
    (function () { const { c, tex } = qTag.userData, ctx = c.getContext('2d'); ctx.font = '900 130px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#ff4d4d'; ctx.fillText('?', 256, 86); tex.needsUpdate = true; })();

    // ---------- المافيا والطبيب (شخصيات المشاهد)
    const mafioso = buildChar({}, { outfit: 'shadow' }); scene.add(mafioso.root); mafioso.root.visible = false;
    standUp(mafioso);
    const cloak = mesh(new THREE.ConeGeometry(0.78, 1.65, 20, 1, true), mat('#09090d', { side: THREE.DoubleSide, roughness: 1 }), 0, 0.82, 0); mafioso.body.add(cloak);
    const knife = new THREE.Group();
    knife.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.11), mat('#d7dde6', { metalness: 0.9, roughness: 0.2 }), 0, -0.3, 0));
    knife.add(mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), mat('#2a1a10'), 0, 0, 0));
    knife.position.set(0, -0.56, 0); knife.scale.setScalar(1.3); mafioso.armR.add(knife);
    const evilLight = new THREE.PointLight('#ff2a2a', 0, 7, 1.3); scene.add(evilLight);
    const doctor = buildChar({ skin: 2 }, { outfit: 'doctor' }); scene.add(doctor.root); doctor.root.visible = false; standUp(doctor);
    const bag = new THREE.Group(); bag.add(mesh(new THREE.BoxGeometry(0.42, 0.3, 0.2), mat('#b22a2a')));
    bag.add(mesh(new THREE.BoxGeometry(0.2, 0.06, 0.205), mat('#ffffff'))); bag.add(mesh(new THREE.BoxGeometry(0.06, 0.2, 0.205), mat('#ffffff')));
    bag.position.set(0, -0.7, 0.05); bag.scale.setScalar(1.3); doctor.armL.add(bag);
    const healLight = new THREE.PointLight('#5dff9a', 0, 6, 1.5); scene.add(healLight);
    const HEAL = 60, healGeo = new THREE.BufferGeometry(), healPos = new Float32Array(HEAL * 3);
    healGeo.setAttribute('position', new THREE.BufferAttribute(healPos, 3));
    const healPts = new THREE.Points(healGeo, new THREE.PointsMaterial({ color: '#7dffb0', size: 0.16, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    scene.add(healPts); healPts.visible = false;
    const healRing = new THREE.Mesh(new THREE.RingGeometry(0.6, 0.8, 40), new THREE.MeshBasicMaterial({ color: '#6dffa6', transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
    healRing.rotation.x = -Math.PI / 2; scene.add(healRing); healRing.visible = false;

    // ---------- السوق الشعبي بالليل (لقطة هجوم المافيا والإنقاذ — بعيد عن الساحة)
    // الشارع على محور x (الضحية تمشي من -x إلى +x)، والزقاق المظلم اللي يطلع منه المافيا عند x=-4 بالجهة السالبة من z
    const MARKET = new THREE.Vector3(-80, 0, 0);
    const market = new THREE.Group(); market.position.copy(MARKET); scene.add(market);
    const cobble = canvasTex(256, 256, (ctx) => {
        ctx.fillStyle = '#3a2c26'; ctx.fillRect(0, 0, 256, 256);
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
            const ox = (y % 2) * 16, v = 70 + ((x * 7 + y * 13) % 5) * 9;
            ctx.fillStyle = 'rgb(' + v + ',' + (v * 0.78 | 0) + ',' + (v * 0.66 | 0) + ')';
            roundRect(ctx, x * 32 + ox + 2, y * 32 + 2, 28, 28, 7); ctx.fill();
        }
    });
    cobble.wrapS = cobble.wrapT = THREE.RepeatWrapping; cobble.repeat.set(12, 5);
    const street = new THREE.Mesh(new THREE.PlaneGeometry(44, 22), new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.9 }));
    street.rotation.x = -Math.PI / 2; street.receiveShadow = true; market.add(street);
    const awningTex = (a, b) => canvasTex(128, 64, (ctx) => { for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? a : b; ctx.fillRect(i * 16, 0, 16, 64); } ctx.fillStyle = 'rgba(0,0,0,.25)'; for (let i = 0; i < 8; i++) { ctx.beginPath(); ctx.arc(i * 16 + 8, 64, 8, Math.PI, 0); ctx.fill(); } });
    const awnings = [['#b3261e', '#f2e3c4'], ['#1f6f6b', '#f2e3c4'], ['#d98b1f', '#5a2a14'], ['#6b2a7a', '#f2e3c4'], ['#2f5aa8', '#f2c94c']].map((p) => awningTex(p[0], p[1]));
    const wallCols = ['#8a5a3c', '#7a4e34', '#9a6a46', '#6e4630'];
    const goodsCols = ['#e8a33a', '#c0392b', '#7cb342', '#f4d03f', '#d35400', '#8e44ad'];
    const darkM = mat('#0d0a0a', { roughness: 1 });
    // دكاكين على الجهتين، مع فجوة بالجهة السالبة عند x=-4 (الزقاق)
    for (const side of [-1, 1]) {
        for (let i = 0, x = -18; x <= 18; x += 4, i++) {
            if (side === -1 && x === -6) continue;           // الزقاق
            const h = 4 + ((i * 3 + (side > 0 ? 1 : 0)) % 3) * 1.2, w = 3.8, z = side * 5;
            const b = mesh(new THREE.BoxGeometry(w, h, 3), mat(wallCols[(i + (side > 0 ? 2 : 0)) % 4], { roughness: 0.95 }), x, h / 2, z + side * 1.5); market.add(b);
            // باب/مدخل مظلم بقوس
            const door = mesh(new THREE.PlaneGeometry(1.3, 2.1), darkM, x - 0.8, 1.05, z - side * 0.01); door.rotation.y = side > 0 ? Math.PI : 0; market.add(door);
            // مظلّة مخططة
            const aw = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.2, 1.6), new THREE.MeshStandardMaterial({ map: awnings[(i + (side > 0 ? 3 : 0)) % awnings.length], side: THREE.DoubleSide, roughness: 0.9 }));
            aw.position.set(x, 2.75, z - side * 0.75); aw.rotation.x = -Math.PI / 2 + side * 0.45; aw.castShadow = true; market.add(aw);
            // بسطة وبضاعة
            market.add(mesh(new THREE.BoxGeometry(2.2, 0.9, 0.9), mat('#5a3a22'), x + 0.6, 0.45, z - side * 0.6));
            for (let g = 0; g < 6; g++) market.add(mesh(new THREE.SphereGeometry(0.13, 8, 6), mat(goodsCols[(g + i) % goodsCols.length]), x - 0.2 + (g % 3) * 0.4 + 0.4, 0.98, z - side * 0.6 + (g < 3 ? -0.18 : 0.18)));
            if (i % 2) market.add(mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.6, 10), mat('#a0522d'), x - 1.4, 0.3, z - side * 0.9));
        }
    }
    // الزقاق: جدران ضيقة وجدار خلفي، بدون إضاءة
    market.add(mesh(new THREE.BoxGeometry(0.4, 5, 7), mat('#3a261c'), -7.6, 2.5, -8.5));
    market.add(mesh(new THREE.BoxGeometry(0.4, 5, 7), mat('#3a261c'), -4.4, 2.5, -8.5));
    market.add(mesh(new THREE.BoxGeometry(3.6, 5, 0.4), mat('#24170f'), -6, 2.5, -12));
    // أسلاك إضاءة فوق الشارع
    const bulbM = new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ffb347', emissiveIntensity: 2.5 });
    for (let x = -16; x <= 16; x += 4) {
        for (let j = 0; j < 7; j++) { const zz = -3.4 + j * (6.8 / 6), sag = Math.sin((j / 6) * Math.PI) * 0.5; const bl = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), bulbM); bl.position.set(x + 1, 4.2 - sag, zz); market.add(bl); }
    }
    [-12, -2, 6, 14].forEach((x) => { const pl = new THREE.PointLight('#ffb35c', 14, 11, 1.6); pl.position.set(x, 3.6, 0.3); market.add(pl); });
    const marketMoon = new THREE.PointLight('#6f86ff', 6, 30, 1.2); marketMoon.position.set(4, 9, 6); market.add(marketMoon);
    // فوانيس معلّقة على الدكاكين
    [[-10, 3.4], [2, 3.4], [10, -3.4], [-14, -3.4]].forEach(([x, z]) => { const l = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.4, 0.28), bulbM); l.position.set(x, 3.1, z); market.add(l); });
    // ضوء القمر على السوق بظلال حقيقية (الشمس/القمر العام ظلاله للساحة بس)
    const marketKey = new THREE.SpotLight('#9fb2ff', 70, 40, 0.55, 0.6, 1.1);
    marketKey.position.set(6, 16, 9); marketKey.castShadow = true; marketKey.shadow.mapSize.set(1024, 1024); marketKey.shadow.bias = -0.0004;
    market.add(marketKey); market.add(marketKey.target); marketKey.target.position.set(-2, 0, 0);
    // غبار وفراشات ليل تسبح بضوء الفوانيس
    const MOTES = 140, moteGeo = new THREE.BufferGeometry(), motePos = new Float32Array(MOTES * 3), moteSeed = [];
    for (let i = 0; i < MOTES; i++) moteSeed.push({ x: (Math.random() - 0.5) * 30, y: 0.4 + Math.random() * 4, z: (Math.random() - 0.5) * 8, s: 0.2 + Math.random() * 0.6, o: Math.random() * 10 });
    moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({ color: '#ffd9a0', size: 0.05, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
    market.add(motes);
    // غبار الطيحة على الحجر
    const DUST = 50, dustGeo = new THREE.BufferGeometry(), dustPos = new Float32Array(DUST * 3), dustSeed = [];
    for (let i = 0; i < DUST; i++) { const a = Math.random() * TAU; dustSeed.push({ dx: Math.cos(a) * (0.6 + Math.random()), dz: Math.sin(a) * (0.4 + Math.random() * 0.6), dy: 0.3 + Math.random() * 0.6 }); }
    dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
    const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: '#8a7766', size: 0.12, transparent: true, opacity: 0, depthWrite: false }));
    market.add(dust);
    // الضحية بالسوق: نسخة واقفة من شخصية اللاعب (بدون اسم)
    let walker = null, walkerKey = '';
    function marketWalker(look) {
        const key = JSON.stringify(look || {});
        if (walker && walkerKey === key) return walker;
        if (walker) market.remove(walker.wrap);
        walker = buildChar(look); walker.sit(false); walkerKey = key;
        walker.wrap = new THREE.Group(); walker.wrap.add(walker.root); market.add(walker.wrap);
        walker.root.userData.base = walker.mats.map((m) => m.color.clone());
        return walker;
    }
    function walkPose(c, t, amp) {
        const w = Math.sin(t);
        c.legs[0].hip.rotation.x = w * amp; c.legs[1].hip.rotation.x = -w * amp;
        c.legs[0].knee.rotation.x = Math.max(0, -w) * amp; c.legs[1].knee.rotation.x = Math.max(0, w) * amp;
        c.armL.rotation.set(-w * amp * 0.8, 0, -0.2); c.armR.rotation.set(w * amp * 0.8, 0, 0.2);
    }
    function standPose(c) { c.legs.forEach((l) => { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }); }
    const mw = (x, y, z) => new THREE.Vector3(MARKET.x + x, MARKET.y + y, MARKET.z + z);   // من إحداثيات السوق للعالم

    // ---------- توقيتات مشهد الهجوم (ms من بداية اللقطة — مدتها SHOT.attack=10000 بالخادم)
    // 0 تأسيس: الضحية تمشي بالسوق · 3200 الزقاق: عيون حمرا · 4400 المافيا يلحقه · 6000 يحس فيه ويلتفت
    // · 6650 الطعنة · 7300–7900 يطيح · 8200 المافيا يهرب للزقاق
    const ATK = { walkEnd: 6000, eyes: 3200, out: 4000, follow: 4700, close: 6200, raise: 6000, strike: 6650, buckle: 6750, fall: 7300, down: 7900, flee: 8200, gone: 9800 };
    const WALK_FROM = -12, STOP_X = 0, STREET_Z = 0.6;
    const walkX = (u) => lerp(WALK_FROM, STOP_X, 1 - Math.pow(1 - span(u, 0, ATK.walkEnd), 1.6));   // يبطّي بآخر خطوات
    const walkPhase = (u) => (walkX(u) - WALK_FROM) * 2.4;   // الخطوة على المسافة: بدون انزلاق رجول
    // مؤثرات كل لقطة: خطوات الضحية محسوبة من نفس دورة المشي
    const CUES = (() => {
        const atk = [{ t: 0, k: 'whoosh', g: 0.6 }];
        let prev = 0;
        for (let u = 10; u <= ATK.walkEnd; u += 10) { const ph = Math.floor(walkPhase(u) / Math.PI); if (ph > prev) { prev = ph; atk.push({ t: u, k: 'step', g: 0.55, pan: 0.15 }); } }
        atk.push({ t: ATK.eyes, k: 'whoosh', g: 0.5 }, { t: ATK.eyes + 150, k: 'eyes' }, { t: ATK.eyes + 100, k: 'drone', dur: ATK.strike - ATK.eyes });
        for (let t = ATK.eyes + 500, gap = 950; t < ATK.strike - 150; t += gap, gap = Math.max(420, gap * 0.86)) atk.push({ t, k: 'heart', g: 0.5 + (t - ATK.eyes) / 7000 });
        for (let t = ATK.follow; t < ATK.close; t += 620) atk.push({ t, k: 'step', g: 0.12, pan: -0.4 });
        atk.push({ t: ATK.raise + 60, k: 'shing' }, { t: ATK.strike, k: 'stab' }, { t: ATK.strike + 20, k: 'stinger' }, { t: ATK.down - 40, k: 'thud' });
        for (let t = ATK.flee + 100, i = 0; t < ATK.gone; t += 230, i++) atk.push({ t, k: 'step', g: Math.max(0.05, 0.45 - i * 0.06), pan: -0.5 });
        // الإنقاذ: ركض الطبيب، تزحلق على الركب، علاج ونبض يرجع يقوى، يقوم
        const save = [{ t: 0, k: 'whoosh', g: 0.6 }];
        for (let t = 80; t < 2000; t += 200) save.push({ t, k: 'step', g: 0.45, pan: 0.3 });
        save.push({ t: 2050, k: 'step', g: 0.9 }, { t: 2300, k: 'heal' });
        [2700, 3300, 3800, 4250].forEach((t, i) => save.push({ t, k: 'heart', g: 0.3 + i * 0.17 }));
        save.push({ t: 4600, k: 'rise' });
        // التحقيق: ساعة تتكتك، تقليب ملف، ضربة الطاولة، الجوال يهتز بالنتيجة
        const inspect = [{ t: 0, k: 'whoosh', g: 0.6 }];
        for (let t = 500; t < 6500; t += 1000) inspect.push({ t, k: 'tick', g: 0.5 });
        inspect.push({ t: 1550, k: 'paper' }, { t: 3250, k: 'slam' }, { t: 5300, k: 'buzz' });
        // الليلة الهادية: عيون بالظلام، نبض، وانسحاب
        const quiet = [{ t: 0, k: 'whoosh', g: 0.5 }, { t: 300, k: 'eyes' }, { t: 1300, k: 'heart', g: 0.4 }, { t: 2100, k: 'heart', g: 0.45 }, { t: 2600, k: 'whoosh', g: 0.4 }, { t: 2900, k: 'heart', g: 0.35 }, { t: 3900, k: 'owl' }];
        for (let t = 4250; t < 5000; t += 260) quiet.push({ t, k: 'step', g: 0.12, pan: -0.3 });
        return {
            attack: atk, save, inspect, quiet, intro: [{ t: 0, k: 'whoosh', g: 0.8 }, { t: 900, k: 'owl' }],
            result: [{ t: 300, k: 'bell' }], resultVictim: [{ t: 1700, k: 'mourn' }]
        };
    })();
    let cueKey = '', cueU = 0;
    /** يطلق مؤثرات اللقطة اللي وقتها بين آخر فريم والحين. الدخول بنص اللقطة (تحديث صفحة) ما يعيد اللي فات. */
    function runCues(key, u, list) {
        if (key !== cueKey) { cueKey = key; cueU = u > 400 ? u : -1; }
        for (let i = 0; i < list.length; i++) if (list[i].t > cueU && list[i].t <= u) onCue(list[i].k, list[i]);
        cueU = u;
    }

    // ---------- القفص (حكم الطرد)
    const cage = new THREE.Group(); scene.add(cage); cage.visible = false;
    const barM = mat('#6c6f78', { metalness: 0.8, roughness: 0.35 });
    for (let i = 0; i < 14; i++) { const a = (i / 14) * TAU; cage.add(mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 6), barM, Math.cos(a) * 0.95, 1.3, Math.sin(a) * 0.95)); }
    cage.add(mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.1, 28), barM, 0, 2.62, 0));
    const cageRing = mesh(new THREE.TorusGeometry(0.95, 0.05, 8, 30), barM, 0, 0.05, 0); cageRing.rotation.x = Math.PI / 2; cage.add(cageRing);
    cage.add(mesh(new THREE.TorusGeometry(0.2, 0.04, 8, 16), barM, 0, 2.85, 0));
    const verdictSpot = new THREE.SpotLight('#fff2cc', 0, 18, 0.32, 0.5, 1.2); verdictSpot.castShadow = true; scene.add(verdictSpot); scene.add(verdictSpot.target);
    // شعاع الكشاف المرئي، وسلسلة القفص للسماء
    const spotBeam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 12, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#fff2cc', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    scene.add(spotBeam);
    const chain = mesh(new THREE.CylinderGeometry(0.05, 0.05, 30, 6), barM, 0, 17.9, 0); cage.add(chain);
    // حلقة غبار وقت ارتطام القفص بالأرض
    const RING = 70, ringGeo = new THREE.BufferGeometry(), ringPos = new Float32Array(RING * 3), ringSeed = [];
    for (let i = 0; i < RING; i++) ringSeed.push({ a: (i / RING) * TAU + Math.random() * 0.1, s: 1.4 + Math.random() * 1.4, y: 0.2 + Math.random() * 0.5 });
    ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3));
    const dustRing = new THREE.Points(ringGeo, new THREE.PointsMaterial({ color: '#b49a84', size: 0.16, transparent: true, opacity: 0, depthWrite: false }));
    scene.add(dustRing);

    // ---------- احتفال
    const CONF = 260, confGeo = new THREE.BufferGeometry(), confPos = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3), confSeed = [];
    const confPal = ['#ffd34d', '#ff5a7a', '#4dc3ff', '#7dff9a', '#c18cff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONF; i++) { confSeed.push({ x: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16, sp: 1 + Math.random() * 1.5, off: Math.random() * 10, w: Math.random() * TAU }); const c = confPal[i % confPal.length]; confCol.set([c.r, c.g, c.b], i * 3); }
    confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3)); confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
    const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true })); confetti.visible = false; scene.add(confetti);
    // ألعاب نارية: 6 انفجارات، كل واحد 90 شرارة (مواقعها وتوقيتها ثابتة من رقم الانفجار)
    const FW = 6, FWN = 90, fwGeo = new THREE.BufferGeometry(), fwPos = new Float32Array(FW * FWN * 3), fwCol = new Float32Array(FW * FWN * 3), fwDir = [];
    for (let i = 0; i < FW * FWN; i++) { const th = Math.random() * TAU, ph = Math.acos(2 * Math.random() - 1), sp = 0.7 + Math.random() * 0.3; fwDir.push([Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp]); }
    fwGeo.setAttribute('position', new THREE.BufferAttribute(fwPos, 3)); fwGeo.setAttribute('color', new THREE.BufferAttribute(fwCol, 3));
    const fireworks = new THREE.Points(fwGeo, new THREE.PointsMaterial({ size: 0.6, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    fireworks.visible = false; fireworks.frustumCulled = false; scene.add(fireworks);
    const FW_PERIOD = 1300, fwLast = new Array(FW).fill(1e9);   // انفجار كل 1.3ث بالتناوب على الستة
    // الشمس للشروق (تطلع من ورا السور الشرقي)
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 24, 16), new THREE.MeshBasicMaterial({ color: '#ffd38a', fog: false }));
    const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: '#ffb347', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sunGlow.scale.set(30, 30, 1); scene.add(sun); scene.add(sunGlow); sun.visible = sunGlow.visible = false;

    // ---------------------------------------------------------------- اللاعبين
    const chars = new Map();   // id -> {c, stool, tag, bubble, badge, seat, angle, lookKey}
    // أول 25 حول النار بأسمائهم، والباقي (لين 200) حلقات أبعد بشخصيات أصغر وبدون أسماء
    const INNER = 25, RINGS = [[9.4, 44], [11, 52], [12.6, 60], [14.2, 68]];
    function seatPos(i, n) {
        if (i < INNER) {
            const m = Math.min(n, INNER), r = Math.max(3.4, Math.min(7.2, 2.6 + m * 0.32)), a = (i / m) * TAU + Math.PI / 2;
            return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, r, inner: true };
        }
        let j = i - INNER, left = n - INNER;
        for (let k = 0; k < RINGS.length; k++) {
            const [r, cap] = RINGS[k], cnt = Math.min(cap, left);
            if (j < cnt) { const a = (j / cnt) * TAU + Math.PI / 2 + k * 0.17; return { x: Math.cos(a) * r, z: Math.sin(a) * r, a, r, inner: false }; }
            j -= cnt; left -= cnt;
        }
        const a = j * 0.37; return { x: Math.cos(a) * 15.6, z: Math.sin(a) * 15.6, a, r: 15.6, inner: false };
    }
    let outerR = 0;   // نصف قطر أبعد حلقة (الكاميرات العامة ترجع لورا وتطلع فوق لما تكبر الحلقات)
    function syncPlayers(list) {
        outerR = 0;
        const ids = new Set(list.map((p) => p.id));
        chars.forEach((v, id) => { if (!ids.has(id)) { scene.remove(v.group); chars.delete(id); } });
        list.forEach((p, i) => {
            let v = chars.get(p.id); const lookKey = JSON.stringify(p.look || {});
            if (v && (v.lookKey !== lookKey || v.lite !== (i >= INNER))) { scene.remove(v.group); chars.delete(p.id); v = null; }
            if (!v) {
                const lite = i >= INNER, group = new THREE.Group(), c = buildChar(p.look, { lite });
                if (lite) bakeChar(c);
                const stool = mesh(GEO.stool, mat('#4a3020'), 0, 0.21, 0); if (lite) stool.castShadow = false;
                group.add(stool); group.add(c.root);
                const tag = makeSprite(0.62), bubble = makeBubble(), badge = makeBadge();
                group.add(tag); group.add(bubble); group.add(badge);
                scene.add(group);
                v = { group, c, stool, tag, bubble, badge, lookKey, lite, enter: performance.now() };
                chars.set(p.id, v);
            }
            const s = seatPos(i, list.length);
            v.seat = s; v.num = i + 1; v.p = p; outerR = Math.max(outerR, s.r);
            v.group.position.set(s.x, 0, s.z);
            v.group.rotation.y = Math.atan2(-s.x, -s.z);   // وجهه للنار
        });
    }
    function standUp(c) { c.sit(false); }   // المافيا والطبيب واقفين

    function setGrey(c, k) {
        if (c.baked) { c.baked.material.color.setScalar(lerp(1, 0.4, k)); return; }
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
        sun.visible = sunGlow.visible = k > 0.02; sun.position.set(30, lerp(-8, 24, k), -55); sunGlow.position.copy(sun.position);
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
    // بالرومات الكبيرة الكاميرا تكون برا أبعد حلقة وأعلى، عشان ما تنحجب بالرؤوس القريبة
    function pull(r, h) { const extra = Math.max(0, outerR - 7.2); return [Math.max(r, outerR + 7), h + extra * 1.1]; }
    function orbit(t, r, h, speed) { const a = t * (speed || 0.05) + 0.6, [R, H] = pull(r, h); setCam(Math.sin(a) * R, H, Math.cos(a) * R, 0, 1.0, 0); }
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

    // ما بعد المعالجة: توهّج (bloom) للّمبات والنار والعيون، والتلوين النهائي بـ OutputPass
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.4, 0.98);   // عتبة عالية: يتوهج اللي يطلع ضوء بس (لمبات، نار، عيون)
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    function resize() {
        const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
        renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
        composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(w, h);
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
        // السوق وغرفة التحقيق ما ينرسمون إلا بلقطاتهم، واللاعبين بالساحة يختفون وقتها (أداء)
        market.visible = !!(sh && (sh.s.k === 'attack' || sh.s.k === 'save'));
        room.visible = !!(sh && sh.s.k === 'inspect');
        const away = market.visible || room.visible;
        info = { shot: sh ? sh.s.k : null, u: sh ? sh.u : 0, s: sh ? sh.s : null };
        if (sh && CUES[sh.s.k]) runCues('shot' + G.phaseAt + ':' + sh.s.at, sh.u, sh.s.k === 'result' && sh.s.victim ? CUES.resultVictim : CUES[sh.s.k]);
        onAmbience(market.visible ? 'market' : room.visible ? 'room' : dayK > 0.5 ? 'plaza-day' : 'plaza-night');

        // ----- النار
        flames.forEach((f, i) => { const k = 1 + Math.sin(T * (9 + i * 3) + i) * 0.08 + Math.sin(T * 23 + i * 5) * 0.05; f.scale.set(1 + Math.sin(T * 7 + i) * 0.06, k, 1 + Math.cos(T * 8 + i) * 0.06); f.rotation.y = T * (0.6 + i * 0.3); });
        fireLight.intensity = 26 + Math.sin(T * 13) * 3 + Math.sin(T * 31) * 2;
        for (let i = 0; i < SPARKS; i++) { const s = sparkSeed[i], u = (T * s.sp * 0.5 + s.off) % 1; sparkPos[i * 3] = Math.cos(s.a + u * 3) * (s.r + u * 0.3); sparkPos[i * 3 + 1] = 0.6 + u * 3.6; sparkPos[i * 3 + 2] = Math.sin(s.a + u * 3) * (s.r + u * 0.3); }
        sparkGeo.attributes.position.needsUpdate = true;

        // ----- الإضاءة
        let dayTarget = phase === 'over' ? 0.32 : phase === 'day' || phase === 'vote' || phase === 'verdict' ? 1 :   // النهاية وقت الغروب عشان تبان الألعاب النارية
             phase === 'reveal' || phase === 'lobby' ? 0.15 : 0;
        if (sh && sh.s.k === 'result') dayTarget = ease(sh.u / 3500);
        applyLight(dayTarget, dt);
        // السوق: ضباب ليلي كثيف للعمق، وغبار يسبح بضوء الفوانيس
        if (market.visible) {
            scene.fog.near = 3; scene.fog.far = 30; scene.fog.color.set('#0a0d1e'); scene.background.set('#090b1a');
            for (let i = 0; i < MOTES; i++) { const m = moteSeed[i]; motePos[i * 3] = m.x + Math.sin(T * m.s + m.o) * 0.6; motePos[i * 3 + 1] = m.y + Math.sin(T * m.s * 1.3 + m.o) * 0.3; motePos[i * 3 + 2] = m.z + Math.cos(T * m.s + m.o) * 0.4; }
            moteGeo.attributes.position.needsUpdate = true;
        } else { scene.fog.near = 26; scene.fog.far = 70; }

        // ----- الشخصيات
        const speakers = {};
        const chatList = G ? G.chat : (F.room && F.room.chat) || [];   // باللوبي: شات الانتظار
        chatList.forEach((m) => { if (m.from && m.ch !== 'district' && m.ch !== 'mafia' && now - m.at < 6000) speakers[m.from] = m; });
        const votes = (G && G.votes) || {}, tally = {};
        Object.keys(votes).forEach((k) => { const t = votes[k]; if (t && t !== 'skip') tally[t] = (tally[t] || 0) + 1; });
        const sleeping = phase === 'night' || (sh && sh.s.k !== 'result');

        chars.forEach((v, id) => {
            const p = v.p, c = v.c, ph = id.charCodeAt(1) * 0.7 + v.num;
            let alive = p.alive !== false, fallK = 0;
            if (!alive) fallK = 1;
            // وضع الجلوس الأساسي
            c.root.position.set(0, 0, 0); c.root.rotation.set(0, 0, 0);
            c.body.position.y = c.sitY;
            c.head.rotation.set(0, Math.sin(T * 0.6 + ph) * 0.18, 0);
            c.torso.scale.y = 1 + Math.sin(T * 2 + ph) * 0.025;
            c.armL.rotation.set(-0.55, 0, -0.2); c.armR.rotation.set(-0.55, 0, 0.2);
            const eyeOpen = sleeping && alive && fallK === 0 ? 0.12 : 1;
            c.eyes.forEach((e, i) => { e.scale.y = e.userData.sy * eyeOpen; e.visible = !(eyeOpen < 1 && i % 2 === 1); });
            if (sleeping && alive && fallK === 0) { c.head.rotation.x = 0.32 + Math.sin(T * 1.2 + ph) * 0.04; c.head.rotation.z = 0.12; }
            if (speakers[id] && alive) { c.head.rotation.x = Math.sin(T * 14) * 0.06; c.armR.rotation.x = -1.1 + Math.sin(T * 6) * 0.25; }
            if (phase === 'vote' && votes[id] && alive) { c.armR.rotation.set(-2.9, 0, 0.2); }
            if (phase === 'verdict' && G.verdict && G.verdict.id && G.verdict.id !== id && alive && chars.get(G.verdict.id)) {
                // الكل يطالع المطرود
                const ts = chars.get(G.verdict.id).seat; let yaw = Math.atan2(ts.x - v.seat.x, ts.z - v.seat.z) - v.group.rotation.y;
                yaw = Math.atan2(Math.sin(yaw), Math.cos(yaw)); c.head.rotation.set(0, Math.max(-1.2, Math.min(1.2, yaw)), 0);
            }
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
            const shown = (revealDead || phase === 'over') && !hideRoleNow, isVerdict = phase === 'verdict' && G.verdict && G.verdict.id === id;
            v.tag.visible = !v.lite || isVerdict;   // الحلقات البعيدة بدون أسماء (إلا المطرود وقت مشهده)
            if (v.tag.visible) drawTag(v.tag, { name: p.name, num: v.num, dead: revealDead && !isVerdict, role: shown ? p.role : null, team: shown ? p.team : null, ring: speakers[id] ? '#ffd34d' : null });
            v.tag.position.set(0, revealDead ? 1.25 : 2.45, 0);
            // المطرود بالتصويت راح مع القفص: يبقى كرسيه فاضي واسمه عليه
            c.root.visible = !(revealDead && p.cause === 'vote');
            const sp = speakers[id];
            v.bubble.visible = !!(sp && alive && !v.lite && (phase === 'day' || phase === 'vote' || phase === 'lobby'));
            if (v.bubble.visible) { drawBubble(v.bubble, sp.text); v.bubble.position.set(0, 3.55, 0); }
            const n = tally[id] || 0;
            v.badge.visible = (phase === 'vote' || phase === 'verdict') && n > 0 && alive;
            if (v.badge.visible) { drawBadge(v.badge, String(n), '#e2483d'); v.badge.position.set(0, v.bubble.visible ? 4.6 : 3.2, 0); }
            // دخول لاعب جديد باللوبي: يطلع من الأرض
            v.group.visible = !away;
            const ek = ease(span(pnow - v.enter, 0, 700)); v.group.scale.setScalar((0.3 + ek * 0.7) * (v.lite ? 0.85 : 1));
        });

        // ----- المشاهد الخاصة
        mafioso.root.visible = false; doctor.root.visible = false; if (walker) walker.wrap.visible = false; evilLight.intensity = 0; healPts.visible = false; healRing.visible = false; healLight.intensity = 0;
        cage.visible = false; verdictSpot.intensity = 0; confetti.visible = false; fireworks.visible = false; spotBeam.material.opacity = 0; dustRing.material.opacity = 0; phoneScreen.emissiveIntensity = 0;
        let cam = null;   // [px,py,pz, lx,ly,lz, snap]

        if (sh) {
            const s = sh.s, u = sh.u, vt = s.target && chars.get(s.target);
            // كاميرا عامة: إزاحة من نقطة أصل (الساحة/الغرفة/السوق) + اهتزاز يد خفيف
            const hh = (amp) => [Math.sin(u / 310) * amp + Math.sin(u / 170) * amp * 0.6, Math.sin(u / 260) * amp * 0.7, Math.cos(u / 230) * amp * 0.5];
            const camAt = (o, c, l, amp) => { const h = hh(amp == null ? 0.03 : amp); return [o.x + c[0] + h[0], o.y + c[1] + h[1], o.z + c[2] + h[2], o.x + l[0], o.y + l[1], o.z + l[2]]; };
            if (s.k === 'intro') {
                // من القمر تنزل الكاميرا على البلدة النايمة حول النار
                const k = ease(u / s.dur), [R0, H0] = pull(15, 7.5);
                cam = camAt(ORIGIN, [lerp(-7, 0, k), lerp(15, H0, k), lerp(22, R0, k)], [lerp(moon.position.x, 0, k), lerp(moon.position.y, 1, k), lerp(moon.position.z, 0, k)], 0.015);
            } else if (s.k === 'inspect') {
                // غرفة التحقيق: تأسيس ← فوق كتف المحقق ← ضربة الطاولة ← وجه المشتبه ← الجوال يضيء بالنتيجة
                const slamU = 3250, swing = 0.16 + 0.32 * Math.exp(-Math.max(0, u - slamU) / 900) * (u > slamU ? 1 : 0);
                lampPivot.rotation.z = Math.sin(u / 600) * swing;
                const flip = ease(span(u, 1500, 1900)), exam = ease(span(u, 2000, 2700)) * (1 - ease(span(u, 3050, 3200)));
                folder.rotation.z = -flip * 0.5; folder.position.y = 1.08 + flip * 0.04;
                const slam = span(u, slamU - 150, slamU), back = ease(span(u, slamU, slamU + 500));
                detective.armR.rotation.set(-0.9 - exam * 0.8 + Math.sin(u / 400) * 0.06, 0, 0.2);
                detective.armL.rotation.set(u < slamU ? -0.55 - slam * 1.5 : -2.05 + back * 1.5, 0, -0.12);
                detective.body.rotation.x = u > slamU - 100 && u < slamU + 600 ? 0.18 : exam * 0.08;
                detective.head.rotation.set(0.1 + exam * 0.15, Math.sin(u / 900) * 0.2 * (1 - exam), 0);
                susp.head.rotation.set(-0.05, Math.sin(u / 500) * 0.1, 0);
                susp.eyes.forEach((e) => { e.material.emissiveIntensity = u > 3700 && u < 5200 ? 1 + (Math.sin(u / 45) > 0.6 ? 1.6 : 0) : 1; });
                if (u > slamU && u < slamU + 250) shake = 0.18;
                qTag.material.opacity = 0.6 + Math.sin(u / 200) * 0.4;
                secH.rotation.z = -Math.floor(u / 1000) * TAU / 60 - 1.2; minH.rotation.z = -0.9;
                phoneScreen.emissiveIntensity = u > 5300 ? 1.6 + Math.sin(u / 90) * 0.6 : 0;
                hemi.intensity = 0.06; sky.intensity = 0;
                if (u < 1500) { const k = ease(span(u, 0, 1500)); cam = camAt(ROOM, [lerp(3.4, 2.7, k), lerp(3.7, 3.0, k), lerp(3.4, 2.6, k)], [0, 1.2, 0], 0.01); }
                else if (u < slamU) cam = camAt(ROOM, [1.0, 2.45, 3.35], [-0.1, 1.35, -1.35], 0.012);                 // فوق كتف المحقق
                else if (u < 3700) cam = camAt(ROOM, [2.3, 1.45, 0.9], [0, 1.1, 0.1], 0.01);                          // الضربة من الجنب
                else if (u < 5200) { const k = ease(span(u, 3700, 5200)); cam = camAt(ROOM, [lerp(0.9, 0.7, k), 1.8, lerp(0.7, 0.4, k)], [0, 1.5, -1.35], 0.008); }   // وجه المشتبه
                else { const k = ease(span(u, 5200, s.dur)); cam = camAt(ROOM, [lerp(1.2, 2.9, k), lerp(1.8, 3.4, k), lerp(1.4, 3.6, k)], [-0.5, 1.05, 0.2], 0.01); }   // الجوال يضيء
            } else if ((s.k === 'attack' || s.k === 'save') && vt) {
                // كل اللقطة بالسوق: الضحية نسخة واقفة من شخصية اللاعب، وما فيه أسماء فوق أحد
                const w = marketWalker(vt.p.look), Z = STREET_Z;
                w.wrap.visible = true; w.root.position.set(0, 0, 0); w.root.rotation.set(0, 0, 0); standPose(w);
                w.head.rotation.set(0, 0, 0); w.body.position.y = 0; w.body.rotation.set(0, 0, 0); setGrey(w, 0);
                w.eyes.forEach((e) => { e.scale.y = e.userData.sy; e.visible = true; });
                w.wrap.rotation.y = Math.PI / 2;   // وجهه باتجاه +x (اتجاه المشي)
                // حركة كاميرا محمولة خفيفة (مو ثابتة جامدة)
                const hand = (amp) => [Math.sin(u / 310) * amp + Math.sin(u / 170) * amp * 0.6, Math.sin(u / 260) * amp * 0.7, Math.cos(u / 230) * amp * 0.5];
                const shotCam = (c, l, amp) => { const h = hand(amp || 0.03), c0 = mw(c[0] + h[0], c[1] + h[1], c[2] + h[2]), l0 = mw(l[0], l[1], l[2]); return [c0.x, c0.y, c0.z, l0.x, l0.y, l0.z]; };
                dust.material.opacity = 0;
                if (s.k === 'attack') {
                    // ---- الضحية: يمشي ويتلفّت على البسطات، يبطّي، يحس بأحد، يلتفت، الطعنة، تنهار ركبه، يطيح على وجهه
                    const vx = walkX(u), ph = walkPhase(u);
                    w.wrap.position.set(vx, 0, Z);
                    if (u < ATK.walkEnd) {
                        const amp = 0.55 * (1 - span(u, ATK.walkEnd - 900, ATK.walkEnd) * 0.7);
                        walkPose(w, ph, amp); w.root.position.y = Math.abs(Math.sin(ph)) * 0.05;
                        w.body.rotation.z = Math.sin(ph) * 0.035;                                  // تمايل المشي
                        w.head.rotation.y = Math.sin(u / 900) * 0.45 * (1 - span(u, 4800, 5600));  // يتفرج على البسطات
                    }
                    const look = ease(span(u, ATK.walkEnd, ATK.walkEnd + 450)) * (1 - ease(span(u, ATK.strike, ATK.strike + 150)));
                    w.head.rotation.y += -look * 1.05; w.body.rotation.y = -look * 0.25;          // يلتفت ورا
                    const hit = span(u, ATK.strike, ATK.strike + 120), buckle = ease(span(u, ATK.buckle, ATK.fall)), fall = ease(span(u, ATK.fall, ATK.down));
                    if (hit > 0) {
                        w.root.position.x = Math.sin(hit * Math.PI) * 0.08;                        // ارتداد الضربة
                        w.armL.rotation.set(-0.3 - buckle * 0.8, 0, -0.5); w.armR.rotation.set(-0.3 - buckle * 0.8, 0, 0.5);
                        w.head.rotation.x = -0.25 * (1 - buckle) + buckle * 0.3;
                    }
                    if (buckle > 0) {                                                              // الركب تنثني والجسم ينزل
                        const kb = buckle * (1 - fall);
                        w.legs.forEach((l) => { l.hip.rotation.x = -0.6 * kb; l.knee.rotation.x = 1.1 * kb; });
                        w.body.position.y = -0.22 * kb;
                    }
                    if (fall > 0) { w.root.rotation.x = fall * Math.PI / 2 * 0.96; w.armL.rotation.set(-2.6 * fall, 0, -0.3); w.armR.rotation.set(-2.6 * fall, 0, 0.3); }
                    // غبار الطيحة
                    const dk = span(u, ATK.down - 60, ATK.down + 900);
                    if (dk > 0 && dk < 1) {
                        dust.material.opacity = 0.55 * (1 - dk);
                        for (let i = 0; i < DUST; i++) { const d = dustSeed[i]; dustPos[i * 3] = STOP_X + 0.9 + d.dx * dk; dustPos[i * 3 + 1] = 0.05 + d.dy * Math.sin(dk * Math.PI) * 0.6; dustPos[i * 3 + 2] = Z + d.dz * dk; }
                        dustGeo.attributes.position.needsUpdate = true;
                    }

                    // ---- المافيا: عيون بالزقاق ← يطلع ← يلحقه بخطوات هادية ← يرفع السكين ← يطعن ← يتلفّت ← يهرب
                    mafioso.root.visible = u > ATK.eyes && u < ATK.gone;
                    const inAlley = new THREE.Vector3(-6, 0, -6.8), mouth = new THREE.Vector3(-5.4, 0, -3.0), back = new THREE.Vector3(STOP_X - 0.9, 0, Z + 0.35), deep = new THREE.Vector3(-6, 0, -10);
                    const chase = new THREE.Vector3(vx - 1.7, 0, Z + 0.95);   // ورا الضحية ومايل لجهة الكاميرا عشان يبان فوق كتفه
                    let mp, dirV, gait = 0, pace = 120;
                    if (u < ATK.out) { mp = inAlley.clone(); dirV = new THREE.Vector3(0.3, 0, 1); }
                    else if (u < ATK.follow) { const k = ease(span(u, ATK.out, ATK.follow)); mp = inAlley.clone().lerp(mouth, k); dirV = mouth.clone().sub(inAlley); gait = 0.4; pace = 150; }
                    else if (u < ATK.close) { const k = ease(span(u, ATK.follow, ATK.close)); mp = mouth.clone().lerp(chase, k); dirV = new THREE.Vector3(1, 0, 0.15); gait = 0.38; pace = 140; }
                    else if (u < ATK.flee) { const k = ease(span(u, ATK.close, ATK.strike - 80)); mp = chase.clone().lerp(back, k); dirV = new THREE.Vector3(1, 0, 0); gait = k < 1 ? 0.3 : 0; }
                    else { const k = span(u, ATK.flee, ATK.gone); mp = k < 0.45 ? back.clone().lerp(mouth, ease(k / 0.45)) : mouth.clone().lerp(deep, ease((k - 0.45) / 0.55)); dirV = k < 0.45 ? mouth.clone().sub(back) : deep.clone().sub(mouth); gait = 0.85; pace = 65; }
                    mafioso.root.position.copy(mw(mp.x, 0, mp.z));
                    mafioso.root.rotation.set(0, Math.atan2(dirV.x, dirV.z), 0);
                    mafioso.root.scale.setScalar(1.05);
                    standPose(mafioso); mafioso.body.rotation.set(0, 0, 0);
                    if (gait) { walkPose(mafioso, u / pace, gait); mafioso.root.position.y = Math.abs(Math.sin(u / pace)) * (u > ATK.flee ? 0.1 : 0.03); }
                    if (u > ATK.follow && u < ATK.strike) mafioso.body.rotation.x = 0.16;                 // ماشي منحني يتسلل
                    const raise = ease(span(u, ATK.raise, ATK.raise + 500)), strike = ease(span(u, ATK.strike - 50, ATK.strike + 70));
                    if (u > ATK.raise && u < ATK.flee) {
                        mafioso.armR.rotation.set(-0.5 - raise * 2.65 + strike * 2.3, 0, 0.15); mafioso.armL.rotation.set(-0.4 - raise * 0.7 + strike * 0.3, 0, -0.25);
                        mafioso.body.rotation.x = 0.1 - raise * 0.12 + strike * 0.28;
                    }
                    const scan = span(u, ATK.down, ATK.flee);   // بعد الطيحة يتلفّت يمين ويسار
                    mafioso.head.rotation.set(0.15 - raise * 0.2, scan > 0 && scan < 1 ? Math.sin(scan * Math.PI * 2) * 0.7 : 0, 0);
                    const eyeK = u < ATK.out ? ease(span(u, ATK.eyes + 100, ATK.eyes + 600)) : 1;      // العيون تفتح بالظلام
                    mafioso.eyes.forEach((e) => { e.material.emissiveIntensity = (0.2 + eyeK * 1.2) + raise * 1.6; e.scale.y = e.userData.sy * (u < ATK.eyes + 600 ? 0.25 + eyeK * 0.75 : 1); });
                    evilLight.position.copy(mafioso.root.position).add(new THREE.Vector3(0.6, 2.4, 0.8));
                    evilLight.intensity = !mafioso.root.visible ? 0 : u < ATK.out ? 1.5 * eyeK : 4 + raise * 7 + strike * 5;
                    if (u > ATK.strike && u < ATK.strike + 260) shake = 0.28;
                    if (u > ATK.down && u < ATK.down + 180) shake = Math.max(shake, 0.12);

                    // ---- الكاميرا: 6 لقطات
                    if (u < ATK.eyes) {          // 1) تأسيس: كرين ينزل من فوق أسلاك اللمبات للشارع وهو يمشي
                        const k = ease(span(u, 0, ATK.eyes));
                        cam = shotCam([vx + lerp(5.4, 3.3, k), lerp(3.3, 1.85, k), Z + lerp(2.2, 2.6, k)], [vx + 0.7, lerp(0.7, 1.3, k), Z], 0.02);   // تحت أسلاك اللمبات
                    } else if (u < 4400) {       // 2) الزقاق: ظلام وعيون حمرا، دفعة بطيئة لقدّام
                        const k = ease(span(u, ATK.eyes, 4400));
                        cam = shotCam([lerp(-3.0, -3.9, k), 1.45, lerp(0.7, -0.6, k)], [-6.0, 1.35, -6.6], 0.015);
                    } else if (u < ATK.walkEnd) { // 3) قدّام الضحية وهو جاي، والمافيا يتسلل وراه
                        cam = shotCam([vx + 3.6, 1.6, Z + 2.4], [vx - 1.1, 1.2, Z - 0.5], 0.03);
                    } else if (u < ATK.strike) { // 4) لقطة قريبة: وجهه يلتفت والسكين ترتفع وراه
                        const k = ease(span(u, ATK.walkEnd, ATK.strike));
                        cam = shotCam([lerp(1.9, 1.55, k), 1.72, Z + lerp(1.1, 0.95, k)], [-0.55, 1.6, Z + 0.25], 0.012);
                    } else if (u < ATK.flee) {   // 5) زاوية منخفضة: الطعنة والانهيار والطيحة
                        const k = ease(span(u, ATK.strike, ATK.flee));
                        cam = shotCam([lerp(2.1, 2.6, k), lerp(0.55, 0.75, k), Z + lerp(1.7, 2.1, k)], [lerp(-0.4, 0.4, k), lerp(1.05, 0.5, k), Z], 0.02);
                    } else {                     // 6) لقطة واسعة: الجسم طايح والمافيا يختفي بالزقاق
                        const k = ease(span(u, ATK.flee, s.dur));
                        cam = shotCam([6.6 + k * 0.6, 2.9 + k * 0.3, 2.6], [-2.4, 0.4, -1.6], 0.02);
                    }
                } else {
                    // الإنقاذ: الطبيب يركض بالسوق ← يتزحلق على ركبه جنبه ← هالة خضرا ونبض يرجع ← يقوم الاثنين
                    w.wrap.position.set(STOP_X, 0, Z);
                    const fall = 1 - ease(span(u, 4600, 5400));
                    w.root.rotation.x = fall * Math.PI / 2 * 0.96;
                    if (fall > 0) { w.armL.rotation.set(-2.6 * fall, 0, -0.3); w.armR.rotation.set(-2.6 * fall, 0, 0.3); }
                    else { const cheer = span(u, 5400, 6000); w.armL.rotation.set(-0.4 - Math.sin(cheer * Math.PI) * 1.6, 0, -0.3); w.head.rotation.set(-0.15, 0.6, 0); }
                    const p = mw(STOP_X + 0.8, 0, Z);   // مكان جسم المصاب على الأرض
                    doctor.root.visible = true; standPose(doctor); doctor.body.rotation.set(0, 0, 0);
                    const run = ease(span(u, 0, 2000)), docX = lerp(9, STOP_X + 0.8, run);
                    const from = mw(9, 0, Z + 0.9), to = mw(STOP_X + 0.8, 0, Z + 1.2);
                    doctor.root.position.lerpVectors(from, to, run);
                    if (run < 1) { walkPose(doctor, u / 70, 0.85); doctor.root.position.y = Math.abs(Math.sin(u / 70)) * 0.12; doctor.body.rotation.x = 0.12; }
                    else doctor.armR.rotation.set(-1.4 + Math.sin(u / 160) * 0.15, 0, 0.15);
                    doctor.root.lookAt(run < 1 ? to.x : p.x, 0, run < 1 ? to.z : p.z);
                    const kneel = ease(span(u, 2000, 2300)) * (1 - ease(span(u, 5000, 5500)));
                    doctor.root.position.y -= kneel * 0.25; doctor.body.rotation.x += kneel * 0.15;
                    const healK = span(u, 2300, 5000);
                    if (healK > 0 && healK < 1) {
                        healPts.visible = true; healRing.visible = true;
                        healLight.position.set(p.x, 1.2, p.z); healLight.intensity = Math.sin(healK * Math.PI) * 25;
                        for (let i = 0; i < HEAL; i++) { const q = (healK * 2 + i / HEAL) % 1, a = i * 2.4 + u / 500; healPos[i * 3] = p.x + Math.cos(a) * (0.9 - q * 0.6); healPos[i * 3 + 1] = q * 2.6; healPos[i * 3 + 2] = p.z + Math.sin(a) * (0.9 - q * 0.6); }
                        healGeo.attributes.position.needsUpdate = true;
                        healRing.position.set(p.x, 0.05 + healK * 1.8, p.z); healRing.scale.setScalar(1 + healK); healRing.material.opacity = 1 - healK;
                    }
                    if (u < 2000) cam = shotCam([docX - 3.4, 1.05, Z + 2.3], [docX, 1.15, Z + 0.9], 0.04);                       // يركض نحونا
                    else if (u < 4600) { const a = lerp(0.35, 1.5, ease(span(u, 2000, 4600))); cam = shotCam([0.8 + Math.cos(a) * 2.5, 4.3, Z + Math.sin(a) * 2.5], [0.8, 0.35, Z + 0.4], 0.01); }   // من فوق تدور
                    else { const k = ease(span(u, 4600, s.dur)); cam = shotCam([lerp(2.9, 2.4, k), lerp(0.6, 0.8, k), Z - lerp(2.2, 1.8, k)], [0.3, lerp(0.8, 1.35, k), Z + 0.3], 0.02); }   // يقوم: لقطة بطولية من تحت (جهة الزقاق عشان الطبيب ما يغطيه)
                }
            } else if (s.k === 'quiet') {
                // ليلة هادية: المافيا يراقب البلدة النايمة من الظلام، ويقرر ينسحب
                const LR = Math.max(11, outerR + 3.2), a = 2.3, out = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
                mafioso.root.visible = true; standPose(mafioso); mafioso.body.rotation.set(0, 0, 0);
                const creep = ease(span(u, 900, 2600)), turn = ease(span(u, 3600, 4200)), leave = span(u, 4200, s.dur);
                const r = LR + 3 - creep * 3 + leave * 4;
                mafioso.root.position.copy(out).multiplyScalar(r);
                mafioso.root.rotation.set(0, Math.atan2(-out.x, -out.z) + turn * Math.PI, 0);
                if ((u > 900 && u < 2600) || leave > 0) walkPose(mafioso, u / 140, 0.35);
                if (u < 3600) mafioso.body.rotation.x = 0.12;
                const eyeK = ease(span(u, 300, 900)) * (1 - ease(span(u, 4300, s.dur)));
                mafioso.eyes.forEach((e) => { e.material.emissiveIntensity = 0.2 + eyeK * 1.4; e.scale.y = e.userData.sy * (0.25 + ease(span(u, 300, 900)) * 0.75); });
                mafioso.head.rotation.set(0.1, Math.sin(u / 700) * 0.35 * (u > 2600 && u < 3600 ? 1 : 0), 0);
                evilLight.position.copy(mafioso.root.position).add(new THREE.Vector3(0, 2.6, 0)).addScaledVector(out, -1); evilLight.intensity = 10 * eyeK;
                const lift = Math.max(0, outerR - 7.2) * 0.4;
                if (u < 2600) { const cr = Math.max(outerR, 3.4) + 1.4; cam = camAt(ORIGIN, [out.x * cr, 1.7 + lift, out.z * cr], [out.x * LR, 1.5, out.z * LR], 0.02); }   // من ورا النايمين للظلام
                else cam = camAt(ORIGIN, [out.x * (r + 2.6), 2.2 + lift * 0.5, out.z * (r + 2.6) + 0.8], [0, 1.0, 0], 0.015);                                     // من ورا المافيا على النار
            } else if (s.k === 'result') {
                // الشروق: الشمس تطلع ورا السور، ولو فيه ضحية الكاميرا تمشي لمكانه
                const vv = s.victim && chars.get(s.victim), [R1, H1] = pull(15.5, 12);
                if (vv && u > 1600) {
                    const k = ease(span(u, 1600, s.dur)), p = seatWorld(vv, tmp), dir = tmp2.copy(p).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
                    const c = p.clone().addScaledVector(dir, -Math.min(3.6, vv.seat.r - 0.8) + k * 0.6).addScaledVector(side, 1.8);
                    cam = camAt(ORIGIN, [c.x, lerp(3.2, 1.7, k), c.z], [p.x, 0.5, p.z], 0.012);
                } else {
                    const k = ease(u / s.dur);
                    cam = camAt(ORIGIN, [lerp(-2, 2, k), lerp(H1, H1 - 4.5, k), lerp(R1, R1 - 3, k)], [0, lerp(4, 1, k), 0], 0.01);
                }
            }
        }

        if (!cam) {
            const t = T;
            const V = phase === 'verdict' && G && G.verdict;
            if (V && V.id && chars.get(V.id)) {
                // الطرد (12ث): كشاف ← القفص ينزل من السما ← ارتطام وغبار ← كشف الفريق ← القفص يرتفع بالسلسلة ← لقطة واسعة
                const v = chars.get(V.id), u = now - G.phaseAt, p = seatWorld(v, tmp), dir = tmp2.copy(p).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
                const hh2 = (amp) => [Math.sin(u / 310) * amp, Math.sin(u / 260) * amp * 0.7, Math.cos(u / 230) * amp * 0.5];
                const at = (c, l, amp) => { const h = hh2(amp == null ? 0.02 : amp); return [c.x + h[0], c.y + h[1], c.z + h[2], l.x, l.y, l.z]; };
                const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
                cage.visible = true;
                const drop = ease(span(u, 1800, 2700)), lift = ease(span(u, 5400, 8400)), spotK = ease(span(u, 80, 500)) * (1 - ease(span(u, 8400, 10500)));
                cage.position.set(p.x, lerp(16, 0, drop) + lift * 16, p.z);
                if (u > 2700 && u < 2950) shake = 0.24;
                v.group.position.y = lift * 16;
                verdictSpot.position.set(p.x, 12, p.z); verdictSpot.target.position.set(p.x, 0, p.z); verdictSpot.intensity = 220 * spotK;
                spotBeam.position.set(p.x, 6 + lift * 16, p.z); spotBeam.material.opacity = 0.07 * spotK;
                const dk = span(u, 2700, 3700);   // حلقة الغبار
                if (dk > 0 && dk < 1) {
                    dustRing.material.opacity = 0.6 * (1 - dk);
                    for (let i = 0; i < RING; i++) { const d = ringSeed[i], r = 1 + d.s * ease(dk); ringPos[i * 3] = p.x + Math.cos(d.a) * r; ringPos[i * 3 + 1] = d.y * Math.sin(dk * Math.PI); ringPos[i * 3 + 2] = p.z + Math.sin(d.a) * r; }
                    ringGeo.attributes.position.needsUpdate = true;
                }
                // المطرود: خايف ورافع يديه، بعد الارتطام ماسك القضبان، وبالرفع يطالع تحت
                v.c.root.rotation.z = 0; v.c.root.position.set(0, 0, 0); setGrey(v.c, 0); v.c.root.visible = true;
                if (u < 2700) { v.c.armL.rotation.set(-2.6, 0, -0.4); v.c.armR.rotation.set(-2.6, 0, 0.4); v.c.head.rotation.set(-0.35 * drop, Math.sin(u / 120) * 0.15, 0); }
                else { v.c.armL.rotation.set(-1.5, 0, -0.5); v.c.armR.rotation.set(-1.5, 0, 0.5); v.c.head.rotation.set(lift > 0 ? 0.45 : 0, Math.sin(u / 300) * 0.25, 0); }
                v.tag.position.y = 2.45;
                runCues('verdict' + G.phaseAt, u, [{ t: 0, k: 'whoosh', g: 0.6 }, { t: 90, k: 'clunk' }, { t: 1850, k: 'fall' }, { t: 2700, k: 'cage' }, { t: 4200, k: V.team === 'mafia' ? 'revealMafia' : 'revealTown' }, { t: 5400, k: 'chain' }]);
                if (u < 1800) { const a = Math.atan2(-dir.z, -dir.x) + lerp(-0.5, 0.4, ease(span(u, 0, 1800))), c = p.clone().add(V3(Math.cos(a) * 5.5, 3.2, Math.sin(a) * 5.5)); cam = at(c, V3(p.x, 1.3, p.z), 0.02); }
                else if (u < 2700) cam = at(p.clone().addScaledVector(dir, -2.4).add(V3(0, 0.6, 0)), V3(p.x, 9 - drop * 7, p.z), 0.01);          // من تحت: القفص طايح من السما
                else if (u < 4200) cam = at(p.clone().addScaledVector(side, 3.3).addScaledVector(dir, -1.2).add(V3(0, 1.8, 0)), V3(p.x, 1.2, p.z), 0.02);
                else if (u < 5400) { const k = ease(span(u, 4200, 5400)); cam = at(p.clone().addScaledVector(dir, -lerp(2.8, 2.0, k)).addScaledVector(side, 0.5).add(V3(0, 1.7, 0)), V3(p.x, 1.5, p.z), 0.008); }
                else if (u < 8400) cam = at(p.clone().addScaledVector(dir, -Math.min(4, v.seat.r - 1)).addScaledVector(side, 2.5).add(V3(0, 3.2 + lift * 7.7, 0)), V3(p.x, 1.3 + lift * 16, p.z), 0.015);
                else { const k = ease(span(u, 8400, 12000)), [R2, H2] = pull(15, 8); cam = at(V3(Math.sin(0.6) * R2, H2, Math.cos(0.6) * R2), V3(lerp(p.x, 0, k), lerp(14, 1, k), lerp(p.z, 0, k)), 0.01); }
            } else if (V) {
                // تعادل/ما أحد طلع: دوران هادي حول النار
                runCues('verdict' + G.phaseAt, now - G.phaseAt, [{ t: 300, k: 'tie' }]);
                orbit(t, 13, 6, 0.05);
            } else if (phase === 'over') {
                confetti.visible = true;
                for (let i = 0; i < CONF; i++) { const s = confSeed[i], y = 12 - ((t * s.sp + s.off) % 12); confPos[i * 3] = s.x + Math.sin(t * 2 + s.w) * 0.5; confPos[i * 3 + 1] = y; confPos[i * 3 + 2] = s.z + Math.cos(t * 2 + s.w) * 0.5; }
                confGeo.attributes.position.needsUpdate = true;
                // ألعاب نارية بلون الفريق الفائز
                const mafiaWin = G.winner === 'mafia', pal = (mafiaWin ? ['#ff3b30', '#ff7a1a', '#ffd0a0', '#b91c1c'] : ['#ffd34d', '#4dc3ff', '#7dff9a', '#c18cff', '#ff7ab6']).map((c) => new THREE.Color(c));
                fireworks.visible = true;
                const ms = t * 1000, cyc = FW * FW_PERIOD;
                for (let b = 0; b < FW; b++) {
                    const age = ((ms - b * FW_PERIOD) % cyc + cyc) % cyc, launching = age < 700, burst = (age - 700) / 2000;
                    const cx = Math.cos(b * 1.9) * 7, cz = Math.sin(b * 1.9) * 7 - 3, cy = 10 + (b % 3) * 1.5, col = pal[b % pal.length];
                    if (age < fwLast[b]) onCue('firework', { pan: Math.max(-0.8, Math.min(0.8, cx / 10)) });   // انطلاق صاروخ جديد
                    fwLast[b] = age;
                    for (let i = 0; i < FWN; i++) {
                        const j = (b * FWN + i) * 3, d = fwDir[b * FWN + i];
                        let x = cx, y = cy, z = cz, a = 0;
                        if (launching) { const q = age / 700; y = lerp(1, cy, ease(q)); a = i < 6 ? 1 : 0; x += (Math.random() - 0.5) * 0.1; }
                        else if (burst < 1) { const r = ease(burst) * 6; x += d[0] * r; y += d[1] * r - burst * burst * 3; z += d[2] * r; a = 1 - burst; }
                        fwPos[j] = x; fwPos[j + 1] = y; fwPos[j + 2] = z;
                        fwCol[j] = col.r * a * 2; fwCol[j + 1] = col.g * a * 2; fwCol[j + 2] = col.b * a * 2;   // ×2 عشان التوهّج يمسكها
                    }
                }
                fwGeo.attributes.position.needsUpdate = true; fwGeo.attributes.color.needsUpdate = true;
                runCues('over' + G.id, now - (G.endedAt || G.phaseAt), [{ t: 150, k: 'fanfare', mafia: mafiaWin }]);
                { const a = t * 0.12 + 0.6, [R, H] = pull(14, 4.5); setCam(Math.sin(a) * R, H, Math.cos(a) * R, 0, 5.5, 0); }   // تطالع فوق للألعاب النارية
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
        composer.render();
    }
    requestAnimationFrame(frame);

    return {
        shotInfo: () => info,
        /** موضع لاعب على الشاشة (0..1) — لعرض عناصر HTML فوق الشخصية إذا احتجنا */
        screenOf(id) { const v = chars.get(id); if (!v) return null; const p = v.group.position.clone(); p.y += 2.5; p.project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; },
        dispose() { stopped = true; removeEventListener('resize', resize); renderer.dispose(); }
    };
}
