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
// kind: smile · blink · laugh · scared · focus (تركيز وقت الاختيار والعد) · sad (خسرت محاولة)
function girlFaceTex(skin, irisK, kind) {
    const key = skin + irisK + kind; if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 130, sk = new T.Color(skin), crease = sk.clone().multiplyScalar(.78).getStyle(), [i0, i1, i2] = IRIS[irisK];
    const scared = kind === 'scared', focus = kind === 'focus', sad = kind === 'sad';
    g.save(); g.translate(cx, cy); g.scale(1.72, 1.58); g.translate(-cx, -cy);

    // خدود وردية (أوضح مع الضحكة)
    const blush = kind === 'laugh' ? .5 : .38;
    for (const sx of [-1, 1]) { const gr = g.createRadialGradient(cx + sx * 31, cy + 17, 0, cx + sx * 31, cy + 17, 15); gr.addColorStop(0, `rgba(242,108,128,${blush})`); gr.addColorStop(1, 'rgba(242,108,128,0)'); g.fillStyle = gr; g.fillRect(cx + sx * 31 - 16, cy + 1, 32, 32); }

    // الحواجب: رفيعة ومقوّسة. الخوف: لفوق · التركيز: الداخل ينزل · الزعل: الداخل يرتفع
    g.strokeStyle = 'rgba(66,36,22,.85)'; g.lineCap = 'round'; g.lineWidth = 2.6;
    for (const sx of [-1, 1]) {
        const by = cy + (scared ? -33 : -28), inY = scared ? -1 : focus ? 4 : sad ? -4 : 2, outY = scared ? 1 : focus ? -1 : sad ? 4 : 2;
        g.beginPath(); g.moveTo(cx + sx * 11, by + inY); g.quadraticCurveTo(cx + sx * 21, by - 4 + (inY + outY) / 4, cx + sx * 31, by + outY); g.stroke();
    }

    // العيون: كبيرة وطولية
    for (const sx of [-1, 1]) {
        const ex = cx + sx * 20, ey = cy - 6;
        if (kind === 'blink' || kind === 'laugh') {
            g.strokeStyle = '#2a140c'; g.lineWidth = 3.4; g.lineCap = 'round'; g.beginPath();
            if (kind === 'laugh') g.arc(ex, ey + 7, 10, Math.PI * 1.15, Math.PI * 1.85); else g.arc(ex, ey - 1, 11, Math.PI * .12, Math.PI * .88);
            g.stroke();
            // رمشين بالطرف
            g.lineWidth = 2;
            for (let k = 0; k < 2; k++) { const tx = ex + sx * (10 - k * 2.5), ty = kind === 'laugh' ? ey + 2.5 + k * 1.5 : ey + 4 + k; g.beginPath(); g.moveTo(tx, ty); g.lineTo(tx + sx * (4 - k), ty + (kind === 'laugh' ? -3 : 2.5)); g.stroke(); }
            continue;
        }
        const big = scared ? 1.08 : 1, rx = 11 * big, ry = (focus ? 11.5 : 13) * big, top = focus ? .25 : sad ? .1 : 0; // التركيز: الجفن نازل شوي
        g.save(); g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.clip();
        g.fillStyle = '#fdfbf8'; g.fillRect(ex - rx, ey - ry, rx * 2, ry * 2);
        const irR = scared ? 6.6 : 9.4, iy = ey + 2;
        const ir = g.createLinearGradient(ex, iy - irR, ex, iy + irR); ir.addColorStop(0, i2); ir.addColorStop(.5, i1); ir.addColorStop(1, i0);
        g.fillStyle = ir; g.beginPath(); g.ellipse(ex, iy, irR, irR * 1.14, 0, 0, TAU); g.fill();
        g.strokeStyle = i2; g.lineWidth = 1.2; g.stroke(); // حافة القزحية
        // ضوء تحت القزحية (يعطي عمق)
        const gl = g.createRadialGradient(ex, iy + irR * .6, 0, ex, iy + irR * .6, irR * .8); gl.addColorStop(0, 'rgba(255,230,190,.45)'); gl.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gl; g.beginPath(); g.ellipse(ex, iy, irR, irR * 1.14, 0, 0, TAU); g.fill();
        const pr = scared ? 2.6 : 4.3;
        g.fillStyle = '#120804'; g.beginPath(); g.ellipse(ex, iy, pr, pr * 1.15, 0, 0, TAU); g.fill();
        // ظل الجفن العلوي على العين، والجفن نفسه للتركيز/الزعل
        g.fillStyle = 'rgba(70,35,22,.22)'; g.fillRect(ex - rx, ey - ry, rx * 2, 5);
        if (top) { g.fillStyle = skin; g.fillRect(ex - rx, ey - ry, rx * 2, ry * 2 * top); }
        g.restore();
        // لمعتين
        g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex - 3.4, ey - 2.5 + top * 10, 3.2, 3.6, -.3, 0, TAU); g.fill();
        g.beginPath(); g.arc(ex + 3.4, ey + 6, 1.5, 0, TAU); g.fill();
        // خط الرمش العلوي سميك وينتهي بثلاث رموش للطرف
        const ly = ey - ry + ry * 2 * top; // مكان الجفن
        g.strokeStyle = '#1c0d06'; g.lineWidth = 3.6; g.lineCap = 'round';
        if (top) { g.beginPath(); g.moveTo(ex - rx, ly + 2); g.quadraticCurveTo(ex, ly - 2, ex + rx, ly + 2); g.stroke(); }
        else { g.beginPath(); g.ellipse(ex, ey, rx + .4, ry + .4, 0, Math.PI * 1.04, Math.PI * 1.96); g.stroke(); }
        g.lineWidth = 2.1;
        for (let k = 0; k < 3; k++) {
            const a = sx > 0 ? -.18 - k * .3 : Math.PI + .18 + k * .3, px = ex + Math.cos(a) * (rx + .4), py = top ? ly + 1 - k * .5 : ey + Math.sin(a) * (ry + .4);
            const qx = top ? ex + sx * (rx - k * 2.5) : px; g.beginPath(); g.moveTo(qx, py); g.lineTo(qx + sx * (4.6 - k * 1.1), py - 3.4 + k * .4); g.stroke();
        }
        // طيّة الجفن فوق العين، وخط تحت خفيف
        g.strokeStyle = crease; g.lineWidth = 1.3; g.beginPath(); g.ellipse(ex, ey - 1.5, rx + 1.8, ry + 2.4, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
        g.strokeStyle = 'rgba(80,40,30,.32)'; g.lineWidth = 1.1; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, Math.PI * .22, Math.PI * .78); g.stroke();
        // دمعة صغيرة للزعل
        if (sad && sx > 0) { g.fillStyle = 'rgba(160,205,240,.85)'; g.beginPath(); g.ellipse(ex + 4, ey + ry + 2.5, 1.8, 2.6, 0, 0, TAU); g.fill(); }
    }

    // الخشم: ظل ناعم صغير ولمعة
    g.strokeStyle = 'rgba(160,86,70,.4)'; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 10, 2.8, Math.PI * .2, Math.PI * .8); g.stroke();
    g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.ellipse(cx - .6, cy + 6.5, 1.2, 2, 0, 0, TAU); g.fill();

    // الفم
    const my = cy + 21;
    if (scared) {
        g.fillStyle = '#6e2433'; g.beginPath(); g.ellipse(cx, my + 2.5, 4.4, 5.6, 0, 0, TAU); g.fill();
        g.fillStyle = '#d06a7a'; g.beginPath(); g.ellipse(cx, my + 5.5, 2.6, 1.6, 0, 0, TAU); g.fill();
    } else if (kind === 'laugh') {
        g.fillStyle = '#86283c'; g.beginPath(); g.moveTo(cx - 13, my - 1); g.quadraticCurveTo(cx, my + 23, cx + 13, my - 1); g.quadraticCurveTo(cx, my + 1.5, cx - 13, my - 1); g.closePath(); g.fill();
        g.save(); g.clip(); g.fillStyle = '#fbfaf6'; g.fillRect(cx - 13, my - 1, 26, 5); g.fillStyle = '#e0707e'; g.beginPath(); g.ellipse(cx, my + 11, 6.5, 4, 0, 0, TAU); g.fill(); g.restore();
    } else if (sad) {
        // مقلوبة لتحت
        g.strokeStyle = '#a8405a'; g.lineWidth = 2.4; g.beginPath(); g.moveTo(cx - 8, my + 5); g.quadraticCurveTo(cx, my - 1, cx + 8, my + 5); g.stroke();
    } else if (focus) {
        // شفايف مضمومة بثقة (ابتسامة جانبية صغيرة)
        g.fillStyle = '#d65d78'; g.beginPath(); g.moveTo(cx - 7, my + 1); g.quadraticCurveTo(cx, my + 5, cx + 8, my - 1); g.quadraticCurveTo(cx, my + 1.5, cx - 7, my + 1); g.closePath(); g.fill();
        g.strokeStyle = '#a8405a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(cx - 8, my + 1); g.quadraticCurveTo(cx, my + 3, cx + 9, my - 1.5); g.stroke();
    } else {
        // ابتسامة بشفايف وردية وأسنان تبين شوي
        g.fillStyle = '#9a3048'; g.beginPath(); g.moveTo(cx - 10.5, my); g.quadraticCurveTo(cx, my + 11, cx + 10.5, my); g.quadraticCurveTo(cx, my + 2.5, cx - 10.5, my); g.closePath(); g.fill();
        g.save(); g.clip(); g.fillStyle = '#fbfaf6'; g.fillRect(cx - 10.5, my, 21, 3.2); g.restore();
        g.strokeStyle = '#c4506c'; g.lineWidth = 1.8; g.beginPath(); g.moveTo(cx - 11.5, my - .5); g.quadraticCurveTo(cx, my + 12.5, cx + 11.5, my - .5); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(cx + 2.5, my + 8.6, 2.4, .9, 0, 0, TAU); g.fill();
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
    for (let k = 0; k < N; k++) { const f = k / (N - 1) - .5, th = f * 2.1; list.push(lockGeo(th, Math.PI * .14, Math.PI * (.155 + (k % 2) * .025 - Math.abs(f) * .03), .036, .02)); } // تنتهي فوق الحواجب
    // خصلتين على جنب الوجه (أطول للشعر الطويل)
    const long = L.hs === 1 || L.hs === 3;
    for (const s of [1, -1]) { list.push(lockGeo(s * 1.32, Math.PI * .3, Math.PI * (long ? .42 : .3), .04, .06)); list.push(lockGeo(s * 1.05, Math.PI * .26, Math.PI * (long ? .36 : .26), .034, .04)); }
    return list;
}
// نضيف الخصل لقطعة الشعر/الإكسسوار نفسها (gear بـ rig3d.js: ألوان بالرؤوس، بدون index) — بدون أمر رسم زيادة
function findGear(head) { return head.children.find(o => o.isMesh && o.material && o.material.vertexColors && o.geometry && !o.geometry.index && o.geometry.attributes.color); }
function addToGear(head, list, hairHex, tint = .06) {
    const gear = findGear(head);
    if (!gear) { list.forEach(x => x.dispose()); return null; }
    const old = gear.geometry, c = new T.Color(hairHex).lerp(new T.Color('#ffffff'), tint);
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
            const kind = mood === 'laugh' || mood === 'scared' || mood === 'blink' ? mood : blinking > 0 ? 'blink' : mood === 'focus' || mood === 'sad' ? mood : 'smile';
            const tex = girlFaceTex(skin, irisK, kind);
            if (headMesh.material.map !== tex) { const first = !headMesh.material.map; headMesh.material.map = tex; if (first) headMesh.material.needsUpdate = true; }
        },
        dispose() {},
    };
}

// خشم صغير بارز (بنفس مكان ظل الخشم بالرسمة) — يعطي الوجه عمق من الجنب
function noseGeo() {
    const ph = Math.PI * .57, g = new T.SphereGeometry(.017, 12, 8);
    g.scale(.95, .85, .7); g.translate(0, HEAD_C + Math.cos(ph) * HEAD_R * 1.1, Math.sin(ph) * HEAD_R * .98 - .002);
    return g;
}

export function styleChar(rig, { SKIN, HAIR, OUTFIT }, n = 0) {
    try { richenColors(rig, OUTFIT); } catch (e) { /* الألوان الأصلية تبقى */ }
    const L = rig.look || {}, head = rig.bones.Head;
    try {
        // الشماغ والغترة كانت نازلة على العيون: نرفعها شوي عشان الملامح تبين
        if (L.g === 1 && (L.acc === 1 || L.acc === 2)) { const gr = findGear(head); if (gr) gr.geometry.translate(0, -HEAD_C, 0).rotateX(-.3).translate(0, HEAD_C + .02, -.01); } // ميلة لورا على الجبهة
        addToGear(head, [noseGeo()], SKIN[L.s] || SKIN[1], 0);
    } catch (e) { /* بدون الخشم */ }
    return L.g === 1 ? applyBoyFace(rig, { SKIN, HAIR }) : applyGirlFace(rig, { SKIN, HAIR }, n);
}
