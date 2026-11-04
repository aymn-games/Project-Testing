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
// ألوان العيون (فاتح تحت ← غامق فوق): أزرق · أخضر · عسلي · بني · بنفسجي · رمادي مزرق
const IRIS = [['#a8dcff', '#3f86d6', '#173a74'], ['#b8ecc0', '#3f9a62', '#174a2c'], ['#ffd98a', '#c0812c', '#5e3510'],
    ['#d9a878', '#7a4a26', '#33190a'], ['#e0c4ff', '#8a5ad0', '#3c1f6e'], ['#cfe0ea', '#5f7f96', '#26384a']];
// وجه البنت بأسلوب أنمي: عيون لوزية مسحوبة لفوق بخط رمش سميك ينتهي بطرف مدبب، قزحية بتدرّج ولمعة كبيرة،
// حواجب رفيعة طويلة، خشم خط صغير، وفم صغير. kind: smile · blink · laugh · scared · focus · sad
function girlFaceTex(skin, irisK, kind) {
    const key = skin + irisK + kind; if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 130, sk = new T.Color(skin), line = sk.clone().multiplyScalar(.32).lerp(new T.Color('#2a0f10'), .5).getStyle(), [i0, i1, i2] = IRIS[irisK];
    const scared = kind === 'scared', focus = kind === 'focus', sad = kind === 'sad';
    g.save(); g.translate(cx, cy); g.scale(1.72, 1.58); g.translate(-cx, -cy);
    g.lineCap = 'round'; g.lineJoin = 'round';

    // خدود: حمرة ناعمة، ومع الضحكة/الخجل خطوط صغيرة مايلة (ستايل أنمي)
    for (const sx of [-1, 1]) {
        const bx = cx + sx * 28, byy = cy + 15, gr = g.createRadialGradient(bx, byy, 0, bx, byy, 13);
        gr.addColorStop(0, kind === 'laugh' ? 'rgba(240,110,120,.42)' : 'rgba(240,120,125,.26)'); gr.addColorStop(1, 'rgba(240,120,125,0)'); g.fillStyle = gr; g.fillRect(bx - 14, byy - 14, 28, 28);
        if (kind === 'laugh' || sad) { g.strokeStyle = 'rgba(210,80,95,.55)'; g.lineWidth = 1.1; for (let k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(bx + k * 4 - 1.5, byy + 2); g.lineTo(bx + k * 4 + 1.5, byy - 2); g.stroke(); } }
    }

    // الحواجب: رفيعة وطويلة فوق العين. الخوف لفوق · التركيز الداخل ينزل · الزعل الداخل يرتفع
    g.strokeStyle = line; g.lineWidth = 1.7;
    for (const sx of [-1, 1]) {
        const by = cy + (scared ? -21 : -17), inY = scared ? -2 : focus ? 3.5 : sad ? -4 : 1, outY = scared ? 0 : focus ? -1 : sad ? 3 : 1;
        g.beginPath(); g.moveTo(cx + sx * 9, by + inY); g.quadraticCurveTo(cx + sx * 20, by - 3.5 + (inY + outY) / 3, cx + sx * 33, by + outY + 1.5); g.stroke();
    }

    for (const sx of [-1, 1]) {
        const ex = cx + sx * 20.5, ey = cy + 1;
        // شكل العين اللوزي: الزاوية الداخلية تحت، والخارجية مسحوبة لفوق (كبيرة: نص الوجه تقريباً)
        const inX = ex - sx * 12.5, inY = ey + 3, outX = ex + sx * 14, outY = ey - 2;
        const topH = scared ? 15 : focus ? 8.5 : sad ? 11 : 12.5, botH = scared ? 11.5 : 9.5;
        const upper = () => { g.moveTo(inX, inY); g.bezierCurveTo(inX + sx * 2, ey - topH, outX - sx * 6, ey - topH - 1, outX, outY); };
        if (kind === 'blink' || kind === 'laugh') {
            // مقفلة: قوس لتحت (مبسوطة) أو لفوق مع الضحكة، وخط الرمش ينتهي بطرف
            g.strokeStyle = line; g.lineWidth = 2.8; g.beginPath();
            if (kind === 'laugh') { g.moveTo(inX, ey + 3); g.quadraticCurveTo(ex, ey - 7, outX, ey + 2); }
            else { g.moveTo(inX, ey + 1); g.quadraticCurveTo(ex, ey + 7, outX, ey); }
            g.stroke();
            g.lineWidth = 1.8; g.beginPath(); g.moveTo(outX, kind === 'laugh' ? ey + 2 : ey); g.lineTo(outX + sx * 3.5, kind === 'laugh' ? ey + 3.5 : ey - 2.5); g.stroke();
            continue;
        }
        // بياض العين
        g.save(); g.beginPath(); upper(); g.bezierCurveTo(outX - sx * 4, ey + botH, inX + sx * 4, ey + botH, inX, inY); g.closePath(); g.clip();
        g.fillStyle = '#fbf9f7'; g.fillRect(ex - 18, ey - 18, 36, 36);
        // القزحية: بيضاوية طويلة بتدرّج (غامق فوق، فاتح تحت)
        const ix = ex + sx * .6, iy = ey + 1, irx = scared ? 6 : 8.6, iry = scared ? 7.2 : 10.6;
        const ir = g.createLinearGradient(ix, iy - iry, ix, iy + iry); ir.addColorStop(0, i2); ir.addColorStop(.5, i1); ir.addColorStop(1, i0);
        g.fillStyle = ir; g.beginPath(); g.ellipse(ix, iy, irx, iry, 0, 0, TAU); g.fill();
        g.strokeStyle = i2; g.lineWidth = 1; g.stroke();
        g.fillStyle = i2; g.beginPath(); g.ellipse(ix, iy + .5, irx * .42, iry * .45, 0, 0, TAU); g.fill(); // البؤبؤ
        // ظل الجفن العلوي على العين
        const sh = g.createLinearGradient(0, ey - topH, 0, ey - topH + 6); sh.addColorStop(0, 'rgba(40,20,40,.45)'); sh.addColorStop(1, 'rgba(40,20,40,0)'); g.fillStyle = sh; g.fillRect(ex - 18, ey - 18, 36, 36);
        g.restore();
        // اللمعات: وحدة كبيرة فوق ووحدة صغيرة تحت (نفس الجهة للعينين)
        g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(ix - 3, iy - 4.2, scared ? 2.2 : 3.2, scared ? 2.6 : 3.9, -.4, 0, TAU); g.fill();
        g.globalAlpha = .85; g.beginPath(); g.arc(ix + 3, iy + 5.2, 1.5, 0, TAU); g.fill(); g.globalAlpha = 1;
        // خط الرمش العلوي: سميك، أعرض بالطرف الخارجي، وينتهي بطرف مدبب لبرا
        g.fillStyle = line; g.beginPath(); upper();
        g.lineTo(outX + sx * 5.5, outY - 2.8); g.lineTo(outX + sx * .5, outY + 2);
        g.bezierCurveTo(outX - sx * 6, ey - topH + 1.6, inX + sx * 2.5, ey - topH + 2.4, inX + sx * .6, inY + .4); g.closePath(); g.fill();
        // الرمش السفلي: خط رفيع بالنص الخارجي
        g.strokeStyle = line; g.globalAlpha = .55; g.lineWidth = 1; g.beginPath(); g.moveTo(ex + sx * 1, ey + botH - .8); g.quadraticCurveTo(outX - sx * 3, ey + botH - 1.5, outX - sx * .5, outY + 2); g.stroke(); g.globalAlpha = 1;
        // طيّة الجفن
        g.strokeStyle = sk.clone().multiplyScalar(.72).getStyle(); g.lineWidth = 1; g.beginPath(); g.moveTo(ex - sx * 5, ey - topH - 3); g.quadraticCurveTo(ex + sx * 4, ey - topH - 5, outX - sx * 1, outY - 4.5); g.stroke();
        if (scared) { g.fillStyle = 'rgba(150,200,240,.8)'; if (sx > 0) { g.beginPath(); g.ellipse(cx + 34, cy - 18, 2, 3.2, -.3, 0, TAU); g.fill(); } } // نقطة عرق
        if (sad && sx > 0) { g.fillStyle = 'rgba(160,210,245,.85)'; g.beginPath(); g.ellipse(ex + 3, ey + botH + 3, 1.8, 2.8, 0, 0, TAU); g.fill(); } // دمعة
    }

    // الخشم: خط صغير مايل
    g.strokeStyle = 'rgba(150,80,70,.5)'; g.lineWidth = 1.3; g.beginPath(); g.moveTo(cx + 1, cy + 7); g.lineTo(cx - .5, cy + 10.5); g.stroke();

    // الفم: صغير
    const my = cy + 20;
    g.strokeStyle = line; g.lineWidth = 1.5;
    if (kind === 'laugh') {
        g.fillStyle = '#7a2632'; g.beginPath(); g.moveTo(cx - 7.5, my - 1); g.quadraticCurveTo(cx, my + 1, cx + 7.5, my - 1); g.quadraticCurveTo(cx + 5, my + 10, cx, my + 10.5); g.quadraticCurveTo(cx - 5, my + 10, cx - 7.5, my - 1); g.closePath(); g.fill();
        g.save(); g.clip(); g.fillStyle = '#e8727c'; g.beginPath(); g.ellipse(cx, my + 9, 5, 3.4, 0, 0, TAU); g.fill(); g.fillStyle = '#fbfaf6'; g.fillRect(cx - 7, my - 1.5, 14, 2.2); g.restore();
    } else if (scared) {
        g.fillStyle = '#7a2632'; g.beginPath(); g.ellipse(cx, my + 3, 3.6, 4.4, 0, 0, TAU); g.fill();
        g.fillStyle = '#e8727c'; g.beginPath(); g.ellipse(cx, my + 5.4, 2.2, 1.4, 0, 0, TAU); g.fill();
    } else if (sad) {
        g.beginPath(); g.moveTo(cx - 5, my + 3); g.quadraticCurveTo(cx, my - .5, cx + 5, my + 3); g.stroke();
    } else if (focus) {
        g.beginPath(); g.moveTo(cx - 4.5, my + 1.2); g.quadraticCurveTo(cx + 1, my + 2.4, cx + 5, my); g.stroke();
    } else {
        // ابتسامة صغيرة هادية
        g.lineWidth = 1.6; g.beginPath(); g.moveTo(cx - 5.5, my); g.quadraticCurveTo(cx, my + 4, cx + 5.5, my); g.stroke();
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
function bangsGeo(L, n) {
    if (L.hs === 4 || L.hs === 5) return null; // الكيرلي له كراته
    const list = [];
    // الغرة: خصل رفيعة طويلة متداخلة، وخصلتين رفيعتين تنزلون بين العيون
    const N = 11;
    for (let k = 0; k < N; k++) { const f = k / (N - 1) - .5, th = f * 2.2; list.push(lockGeo(th, Math.PI * .13, Math.PI * (.165 + (k % 3) * .018 - Math.abs(f) * .03), .03, .02)); } // تنتهي فوق الحواجب
    for (const th of [-.06, .1]) list.push(lockGeo(th, Math.PI * .16, Math.PI * .24, .014, .015));
    // خصل على جنب الوجه لين الحنك (أطول للشعر الطويل والذيل الجانبي)
    const long = L.hs === 1 || L.hs === 3 || L.hs === 0;
    for (const s of [1, -1]) { list.push(lockGeo(s * 1.3, Math.PI * .3, Math.PI * (long ? .44 : .3), .036, .07)); list.push(lockGeo(s * 1.02, Math.PI * .24, Math.PI * (long ? .4 : .27), .028, .045)); }
    return list;
}
// الذيل الجانبي (للشعر القصير hs 0): ربطة فوق ورا الأذن، وخصل طويلة تطلع لبرا وتنزل للكتف
function ponytail(side) {
    const hair = [], tie = [], C = new T.Vector3(side * .118, HEAD_C + .1, -.085);
    const out = new T.Vector3(side * .75, .55, -.45).normalize();
    // الربطة (سكرنشي): حلقة منفوخة بتموّج
    const sc = new T.TorusGeometry(.03, .016, 8, 18), p = sc.attributes.position;
    for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), a = Math.atan2(y, x), k = 1 + .14 * Math.sin(a * 9); p.setXYZ(i, x * k, y * k, p.getZ(i) * (1 + .2 * Math.sin(a * 9))); }
    sc.computeVertexNormals(); sc.lookAt(out); sc.translate(C.x + out.x * .012, C.y + out.y * .012, C.z + out.z * .012); tie.push(sc);
    // خصل الذيل: مجموعة سميكة تطلع شوي لفوق ولبرا، وتنزل جنب الراس لين الكتف
    for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU, spread = new T.Vector3(Math.cos(a) * .012, Math.sin(a) * .012, Math.sin(a * 2) * .008);
        const p0 = C.clone().addScaledVector(out, .015).add(spread);
        const p1 = p0.clone().add(new T.Vector3(side * (.045 + (k % 2) * .008), .035, -.035));
        const p2 = p1.clone().add(new T.Vector3(side * (.035 + (k % 3) * .008), -.11, -.025 + (k % 2) * .012));
        const p3 = p2.clone().add(new T.Vector3(side * (.005 + (k % 3) * .012), -.15 - (k % 2) * .025, .015 + (k % 3) * .008));
        const curve = new T.CatmullRomCurve3([p0, p1, p2, p3]), g = new T.TubeGeometry(curve, 14, 1, 6, false), pp = g.attributes.position;
        for (let i = 0; i < pp.count; i++) {
            const f = Math.floor(i / 7) / 14, cp = curve.getPointAt(f), r = (k ? .046 : .052) * Math.sin(Math.min(1, f * 2.5 + .45) * Math.PI / 2) * (1 - f * .88);
            pp.setXYZ(i, cp.x + (pp.getX(i) - cp.x) * r, cp.y + (pp.getY(i) - cp.y) * r, cp.z + (pp.getZ(i) - cp.z) * r * .75);
        }
        g.computeVertexNormals(); hair.push(g);
    }
    return { hair, tie };
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

function applyGirlFace(rig, { SKIN, HAIR, OUTFIT }, n) {
    const L = rig.look || {};
    const head = rig.bones.Head, headMesh = head.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry');
    if (!headMesh) return null;
    const skin = SKIN[L.s] || SKIN[1], irisK = (n >>> 3) % IRIS.length, hairC = HAIR[L.h] || HAIR[0];
    const locks = bangsGeo(L, n) || [];
    let tie = null;
    if (L.hs === 0) { const pt = ponytail(n & 1 ? 1 : -1); locks.push(...pt.hair); tie = pt.tie; } // الشعر القصير ← ذيل جانبي
    if (locks.length) addToGear(head, locks, hairC); // الجيومتري الجديدة تنحذف مع rig.dispose()
    if (tie) addToGear(head, tie, OUTFIT[(L.o + 4) % OUTFIT.length] || '#3c5ad0', 0); // لون الربطة من ألوان اللبس
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

// شكل الوجه: بدل الكرة الكاملة، النص التحتي يضيق لحنك (مدبب للبنات بأسلوب أنمي، أعرض شوي للأولاد)،
// والحنك ينزل وينسحب لقدام شوي. نفس الـ UV، فرسمة الوجه تبقى بمكانها
const smooth = (x, a, b) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function shapeHead(rig, girl) {
    const head = rig.bones.Head, m = head.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry');
    if (!m) return;
    const g = m.geometry, p = g.attributes.position, RY = HEAD_R * 1.1, RZ = HEAD_R * .98;
    const A = girl ? .27 : .2, B = girl ? .12 : .08, F = girl ? .014 : .01;
    for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const ny = y / RY, nz = z / RZ, t = smooth(-ny, .18, 1.05), front = Math.max(0, nz);
        const cheek = 1 + .045 * Math.exp(-((ny + .12) ** 2) / .02) * (girl ? 1 : .6); // خدود ممتلئة شوي فوق الحنك
        x *= (1 - A * Math.pow(t, 1.6)) * cheek;
        z *= 1 - .12 * t * (1 - front); // الفك من ورا أنحف
        y *= 1 + B * t * t * (.4 + .6 * front);
        z += F * t * t * front;
        p.setXYZ(i, x, y, z);
    }
    g.computeVertexNormals();
    // درزة الكرة (نقاط مكررة بنفس المكان): نوحّد نورمالاتها عشان ما يبين خط
    const nr = g.attributes.normal, map = new Map();
    for (let i = 0; i < p.count; i++) { const k = p.getX(i).toFixed(5) + ',' + p.getY(i).toFixed(5) + ',' + p.getZ(i).toFixed(5); (map.get(k) || map.set(k, []).get(k)).push(i); }
    const v = new T.Vector3();
    for (const ids of map.values()) { if (ids.length < 2) continue; v.set(0, 0, 0); for (const i of ids) v.x += nr.getX(i), v.y += nr.getY(i), v.z += nr.getZ(i); v.normalize(); for (const i of ids) nr.setXYZ(i, v.x, v.y, v.z); }
    nr.needsUpdate = true; p.needsUpdate = true; g.computeBoundingSphere();
}

export function styleChar(rig, { SKIN, HAIR, OUTFIT }, n = 0) {
    try { shapeHead(rig, (rig.look || {}).g !== 1); } catch (e) { /* يبقى كروي */ }
    try { richenColors(rig, OUTFIT); } catch (e) { /* الألوان الأصلية تبقى */ }
    const L = rig.look || {}, head = rig.bones.Head;
    try {
        // الشماغ والغترة كانت نازلة على العيون: نرفعها شوي عشان الملامح تبين
        if (L.g === 1 && (L.acc === 1 || L.acc === 2)) { const gr = findGear(head); if (gr) gr.geometry.translate(0, -HEAD_C, 0).rotateX(-.3).translate(0, HEAD_C + .02, -.01); } // ميلة لورا على الجبهة
        addToGear(head, [noseGeo()], SKIN[L.s] || SKIN[1], 0);
    } catch (e) { /* بدون الخشم */ }
    return L.g === 1 ? applyBoyFace(rig, { SKIN, HAIR }) : applyGirlFace(rig, { SKIN, HAIR, OUTFIT }, n);
}
