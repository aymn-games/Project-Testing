/**
 * «حجرة ورقة مقص» — تطوير شكل الشخصيات (بهاللعبة بس، بدون تعديل ملفات حفلة الميلاد).
 *
 * styleChar(rig, { SKIN, HAIR, OUTFIT }) ← { update(dt, mood), dispose() }
 *   - الأولاد: ملامح rps-face.js (applyBoyFace).
 *   - البنات: ملامح جديدة (عيون كبيرة برموش ولمعتين، حواجب رفيعة، شفايف وردية، خدود)،
 *     وغرة وخصل على الجنبين بدل طاقية الشعر الملساء.
 *   - الكل: ألوان اللبس أغنى شوي (الباستيل الفاتح كان يطلع شبه أبيض تحت إضاءة الساحة).
 *     الثوب والغترة يبقون بيض.
 *   mood: 'smile' · 'laugh' · 'scared' (نفس rps-face.js)
 *
 * pickOutfit(n) ← رقم لون لبس من الألوان الواضحة بس (مشتق من رقم اللاعب، ثابت كل مباراة).
 *
 * خريطة الوجه نفس تقسيم وجه الحفلة: 512×256 تلف الراس كامل، ونص الوجه عند x=128.
 */
import * as THREE from 'three';
import { applyBoyFace } from './rps-face.js';

const T = THREE, TAU = Math.PI * 2;
const HEAD_C = .14, HEAD_R = .17; // نفس مقاسات راس rig3d.js (إحداثيات عظمة الراس)

// ألوان اللبس الواضحة من OUTFIT (crowd-common.js): نشيل الفاتحة جداً (#f6d3e2 · #b5e2f0 · #ffd6a5 · #d9b8e8)
// والخوخي (#f7c59f) لأنه يختلط بلون البشرة
const RICH = [10, 11, 4, 2, 6, 1]; // بنفسجي · فوشي · أزرق · نعناعي · وردي · لافندر
export function pickOutfit(n) { return RICH[(((n >>> 5) ^ Math.imul(n, 31)) >>> 0) % RICH.length]; }

// ================================================================ ألوان أغنى
// لون أغنى: تشبّع أعلى وفاتح أقل (للباستيل)
function rich(c) {
    const h = {}; c.getHSL(h);
    const l = h.l > .5 ? .5 + (h.l - .5) * .5 : h.l;
    return c.clone().setHSL(h.h, Math.min(1, h.s * 1.3 + .08), l);
}
// هل اللون c = خلط لون اللبس مع الأبيض بنسبة t (أو تغميقه بنسبة k)؟ يرجع النسبة أو -1
function mixOf(c, base) {
    const ch = ['r', 'g', 'b'], tol = .025;
    // خلط مع الأبيض: c = base + (1-base)*t
    let t = -1;
    for (const k of ch) { const d = 1 - base[k]; if (d > .08) { t = (c[k] - base[k]) / d; break; } }
    if (t >= -.01 && t <= 1.01 && ch.every(k => Math.abs(base[k] + (1 - base[k]) * t - c[k]) < tol)) return { white: Math.max(0, t) };
    // تغميق: c = base*k
    let m = -1;
    for (const k of ch) if (base[k] > .08) { m = c[k] / base[k]; break; }
    if (m > .3 && m <= 1.01 && ch.every(k => Math.abs(base[k] * m - c[k]) < tol)) return { dark: m };
    return null;
}
function richenColors(rig, OUTFIT) {
    const L = rig.look || {};
    if (!(L.o >= 0)) return;
    const base = new T.Color(OUTFIT[L.o]), deep = rich(base), W = new T.Color('#ffffff'), c = new T.Color();
    const map = (col) => {
        const r = mixOf(col, base); if (!r) return null;
        if (r.white != null) return r.white > .6 ? null : deep.clone().lerp(W, r.white * .8); // الثوب (خلط .8) يبقى أبيض
        return deep.clone().multiplyScalar(r.dark);
    };
    rig.root.traverse(o => {
        if (!o.isMesh || !o.material) return;
        const g = o.geometry, a = g && g.attributes && g.attributes.color;
        if (a && o.material.vertexColors) {
            let hit = false;
            for (let i = 0; i < a.count; i++) { c.setRGB(a.getX(i), a.getY(i), a.getZ(i)); const n = map(c); if (n) { a.setXYZ(i, n.r, n.g, n.b); hit = true; } }
            if (hit) a.needsUpdate = true;
        } else if (!o.material.map && o.material.color) {
            const n = map(o.material.color); if (n) o.material.color.copy(n); // التنورة
        }
    });
}

// ================================================================ ملامح البنات
const cache = new Map();
const IRIS = [['#9a6a3e', '#6b4022', '#3d230f'], ['#b07d3c', '#7a5020', '#4a2e10'], ['#5d7f9a', '#3e5a74', '#22364a']];
function girlFaceTex(skin, irisK, kind) {
    const key = skin + irisK + kind; if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 132, sk = new T.Color(skin), lid = sk.clone().multiplyScalar(.86).getStyle(), [i0, i1, i2] = IRIS[irisK];
    g.save(); g.translate(cx, cy); g.scale(1.7, 1.56); g.translate(-cx, -cy);

    // خدود وردية أوضح
    for (const sx of [-1, 1]) { const gr = g.createRadialGradient(cx + sx * 31, cy + 16, 0, cx + sx * 31, cy + 16, 16); gr.addColorStop(0, 'rgba(242,108,128,.42)'); gr.addColorStop(1, 'rgba(242,108,128,0)'); g.fillStyle = gr; g.fillRect(cx + sx * 31 - 17, cy - 1, 34, 34); }

    // الحواجب: رفيعة ومقوّسة (ترتفع مع الخوف)
    const by = kind === 'scared' ? -29 : -25;
    g.strokeStyle = 'rgba(70,40,26,.8)'; g.lineCap = 'round'; g.lineWidth = 2.4;
    for (const sx of [-1, 1]) { g.beginPath(); const x0 = cx + sx * 12, x1 = cx + sx * 31; g.moveTo(x0, cy + by + 2 + (kind === 'scared' ? -2 : 0)); g.quadraticCurveTo(cx + sx * 22, cy + by - 4, x1, cy + by + 2 + (kind === 'scared' ? 2 : 0)); g.stroke(); }

    // العيون: كبيرة وطولية
    for (const sx of [-1, 1]) {
        const ex = cx + sx * 20, ey = cy - 4;
        if (kind === 'blink' || kind === 'laugh') {
            g.strokeStyle = '#2a140c'; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath();
            if (kind === 'laugh') g.arc(ex, ey + 6, 9, Math.PI * 1.15, Math.PI * 1.85); else g.arc(ex, ey - 1, 10, Math.PI * .12, Math.PI * .88);
            g.stroke();
            // رمش صغير بالطرف
            const tx = ex + sx * 9.5, ty = kind === 'laugh' ? ey + 2 : ey + 3;
            g.lineWidth = 2; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + sx * 4, ty + (kind === 'laugh' ? -3 : 2)); g.stroke();
            continue;
        }
        const big = kind === 'scared' ? 1.1 : 1, rx = 10 * big, ry = 12 * big;
        g.fillStyle = '#fdfbf8'; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.fill();
        g.save(); g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.clip();
        const ir = g.createLinearGradient(ex, ey - 9, ex, ey + 10); ir.addColorStop(0, i2); ir.addColorStop(.45, i1); ir.addColorStop(1, i0);
        const irR = kind === 'scared' ? 6.2 : 8.6;
        g.fillStyle = ir; g.beginPath(); g.ellipse(ex, ey + 1.5, irR, irR * 1.12, 0, 0, TAU); g.fill();
        g.fillStyle = '#140a06'; g.beginPath(); g.ellipse(ex, ey + 1.5, kind === 'scared' ? 2.4 : 4, (kind === 'scared' ? 2.4 : 4) * 1.15, 0, 0, TAU); g.fill();
        // ظل الجفن العلوي على العين
        g.fillStyle = 'rgba(60,30,20,.18)'; g.fillRect(ex - rx, ey - ry, rx * 2, 4);
        g.restore();
        // لمعتين
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex - 3.2, ey - 3.5, 3, 3.4, -.3, 0, TAU); g.fill();
        g.beginPath(); g.arc(ex + 3, ey + 5, 1.4, 0, TAU); g.fill();
        // خط الرمش العلوي سميك وينتهي برموش للطرف
        g.strokeStyle = '#1e0f08'; g.lineWidth = 3.4; g.lineCap = 'round';
        g.beginPath(); g.ellipse(ex, ey, rx + .4, ry + .4, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
        g.lineWidth = 2.2;
        for (let k = 0; k < 2; k++) { const a = sx > 0 ? -.25 - k * .32 : Math.PI + .25 + k * .32, px = ex + Math.cos(a) * (rx + .4), py = ey + Math.sin(a) * (ry + .4); g.beginPath(); g.moveTo(px, py); g.lineTo(px + sx * (4.2 - k), py - 3 - k); g.stroke(); }
        // خط تحت خفيف
        g.strokeStyle = 'rgba(80,40,30,.35)'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, Math.PI * .2, Math.PI * .8); g.stroke();
        g.strokeStyle = lid; g.lineWidth = 1.4; g.beginPath(); g.ellipse(ex, ey - 2.5, rx + 1.6, ry + 1.2, 0, Math.PI * 1.22, Math.PI * 1.78); g.stroke();
    }

    // الخشم: نقطة ظل صغيرة
    g.strokeStyle = 'rgba(160,86,70,.38)'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 9, 2.6, Math.PI * .25, Math.PI * .75); g.stroke();

    // الفم
    const my = cy + 20;
    if (kind === 'scared') {
        g.fillStyle = '#7a2a3a'; g.beginPath(); g.ellipse(cx, my + 2, 4, 5, 0, 0, TAU); g.fill();
    } else if (kind === 'laugh') {
        g.fillStyle = '#8a2c40'; g.beginPath(); g.moveTo(cx - 12, my - 1); g.quadraticCurveTo(cx, my + 21, cx + 12, my - 1); g.quadraticCurveTo(cx, my + 1.5, cx - 12, my - 1); g.closePath(); g.fill();
        g.save(); g.clip(); g.fillStyle = '#fbfaf6'; g.fillRect(cx - 12, my - 1, 24, 4.5); g.fillStyle = '#e0707e'; g.beginPath(); g.ellipse(cx, my + 10, 6, 3.6, 0, 0, TAU); g.fill(); g.restore();
    } else {
        // ابتسامة بشفايف وردية
        g.fillStyle = '#d95c78'; g.beginPath(); g.moveTo(cx - 9, my); g.quadraticCurveTo(cx, my + 9, cx + 9, my); g.quadraticCurveTo(cx, my + 3.5, cx - 9, my); g.closePath(); g.fill();
        g.strokeStyle = '#a8405a'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 10, my - .5); g.quadraticCurveTo(cx, my + 4, cx + 10, my - .5); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.45)'; g.beginPath(); g.ellipse(cx + 2.5, my + 4.6, 2.2, 1, 0, 0, TAU); g.fill();
    }
    g.restore();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; cache.set(key, t); return t;
}

// غرة مسنّنة قدام، وخصلتين تأطّر الوجه
function lockGeo(th, ph, len, w, curl) {
    // أصل الخصلة على سطح الراس (بيضاوي بنفس مقاس الراس) واتجاهها لتحت على السطح
    const R = HEAD_R * 1.1, sx = .93, sy = 1.1, sz = .99;
    const surf = (p, t) => new T.Vector3(Math.sin(p) * Math.sin(t) * R * sx, HEAD_C + Math.cos(p) * R * sy, Math.sin(p) * Math.cos(t) * R * sz);
    const pts = [];
    for (let k = 0; k <= 4; k++) { const f = k / 4, p = ph + f * len, q = surf(p, th); q.multiplyScalar(1).add(new T.Vector3(0, 0, 0)); const out = 1 + .05 * f + curl * f * f; q.x *= out; q.z = (q.z) * out; pts.push(q); }
    const curve = new T.CatmullRomCurve3(pts);
    const SEG = 6, RAD = 5, g = new T.TubeGeometry(curve, SEG, 1, RAD, false), p = g.attributes.position, rs = RAD + 1, C = new T.Vector3(0, HEAD_C, 0);
    // تدرّج السماكة من الأصل للطرف، ومفلطحة على سطح الراس
    for (let i = 0; i < p.count; i++) {
        const f = Math.floor(i / rs) / SEG, cpt = curve.getPointAt(f);
        const v = new T.Vector3(p.getX(i), p.getY(i), p.getZ(i)).sub(cpt), r = w * (1 - f * .92);
        const nrm = cpt.clone().sub(C).normalize(), along = v.dot(nrm);
        v.addScaledVector(nrm, -along * .65).multiplyScalar(r);
        p.setXYZ(i, cpt.x + v.x, cpt.y + v.y, cpt.z + v.z);
    }
    g.computeVertexNormals();
    return g;
}
function bangsGeo(L) {
    if (L.hs === 4 || L.hs === 5) return null; // الكيرلي له كراته
    const list = [];
    // الغرة: خصل قصيرة متداخلة على الجبهة
    const N = 9;
    for (let k = 0; k < N; k++) { const f = k / (N - 1) - .5, th = f * 2.1; list.push(lockGeo(th, Math.PI * .16, Math.PI * (.2 + (k % 2) * .03 - Math.abs(f) * .04), .036, .02)); }
    // خصلتين على جنب الوجه (أطول للشعر الطويل)
    const long = L.hs === 1 || L.hs === 3;
    for (const s of [1, -1]) { list.push(lockGeo(s * 1.32, Math.PI * .3, Math.PI * (long ? .42 : .3), .04, .06)); list.push(lockGeo(s * 1.05, Math.PI * .26, Math.PI * (long ? .36 : .26), .034, .04)); }
    return list;
}
// نضيف الخصل لقطعة الشعر/الإكسسوار نفسها (gear بـ rig3d.js: ألوان بالرؤوس، بدون index) — بدون أمر رسم زيادة
function addToGear(head, list, hairHex) {
    const gear = head.children.find(o => o.isMesh && o.material && o.material.vertexColors && o.geometry && !o.geometry.index && o.geometry.attributes.color);
    if (!gear) { list.forEach(x => x.dispose()); return null; }
    const old = gear.geometry, c = new T.Color(hairHex).lerp(new T.Color('#ffffff'), .06);
    const pos = [old.attributes.position.array], nor = [old.attributes.normal.array], col = [old.attributes.color.array];
    for (const g0 of list) {
        const g = g0.toNonIndexed(); g0.dispose();
        pos.push(g.attributes.position.array); nor.push(g.attributes.normal.array);
        const a = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = c.r; a[i + 1] = c.g; a[i + 2] = c.b; } col.push(a);
        g.dispose();
    }
    const cat = arrs => { const n = arrs.reduce((s, a) => s + a.length, 0), out = new Float32Array(n); let o = 0; for (const a of arrs) { out.set(a, o); o += a.length; } return out; };
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.BufferAttribute(cat(pos), 3)); geo.setAttribute('normal', new T.BufferAttribute(cat(nor), 3)); geo.setAttribute('color', new T.BufferAttribute(cat(col), 3));
    gear.geometry = geo; old.dispose();
    return gear;
}

function applyGirlFace(rig, { SKIN, HAIR }, n) {
    const L = rig.look || {};
    const head = rig.bones.Head, headMesh = head.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry');
    if (!headMesh) return null;
    const skin = SKIN[L.s] || SKIN[1], irisK = (n >>> 3) % IRIS.length;
    const locks = bangsGeo(L); if (locks) addToGear(head, locks, HAIR[L.h] || HAIR[0]); // الجيومتري الجديدة تنحذف مع rig.dispose()
    let blinkT = 1.5 + Math.random() * 3, blinking = 0;
    return {
        update(dt, mood) {
            blinkT -= dt; if (blinkT < 0) { blinking = .13; blinkT = 2.6 + Math.random() * 2.6; }
            if (blinking > 0) blinking -= dt;
            const kind = mood === 'laugh' ? 'laugh' : mood === 'scared' ? 'scared' : blinking > 0 ? 'blink' : 'smile';
            const tex = girlFaceTex(skin, irisK, kind);
            if (headMesh.material.map !== tex) { const first = !headMesh.material.map; headMesh.material.map = tex; if (first) headMesh.material.needsUpdate = true; }
        },
        dispose() {},
    };
}

export function styleChar(rig, { SKIN, HAIR, OUTFIT }, n = 0) {
    try { richenColors(rig, OUTFIT); } catch (e) { /* الألوان الأصلية تبقى */ }
    const L = rig.look || {};
    return L.g === 1 ? applyBoyFace(rig, { SKIN, HAIR }) : applyGirlFace(rig, { SKIN, HAIR }, n);
}
