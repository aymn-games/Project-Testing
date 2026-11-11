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
function wall(track, off, h, every = 1, tile = 4, flipU = false) {
    const N = track.count, pos = [], uv = [], idx = [];
    let vi = 0;
    for (let i = 0; i <= N; i += every) {
        const k = i % N, hd = track.heading[k], lx = Math.cos(hd), lz = -Math.sin(hd);
        const x = track.x[k] + lx * off, z = track.z[k] + lz * off;
        pos.push(x, 0, z, x, h, z);
        // flipU: الجهة الثانية من المضمار تنقرا كتابتها صح من داخل المضمار (بدل ما تطلع معكوسة)
        const v = (flipU ? -1 : 1) * i * track.step / tile; uv.push(v, 0, v, 1);
        if (i) { const p = vi - 2; idx.push(p, vi, p + 1, p + 1, vi, vi + 1); }
        vi += 2;
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
}

// شعار المملكة العربية السعودية: نخلة فوق سيفين عربيين متقاطعين (مرسوم بالكود، بدون نصوص)
function drawSaudiEmblem(ctx, cx, cy, s, color) {
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  ctx.fillStyle = ctx.strokeStyle = color; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // سيفان متقاطعان: المقبض تحت على جنب، والنصل المقوّس يطلع للجهة الثانية
  for (const k of [1, -1]) {
    ctx.save(); ctx.scale(k, 1);
    ctx.beginPath();
    ctx.moveTo(-30, 40);                                  // بداية النصل عند الواقي
    ctx.quadraticCurveTo(10, 22, 50, -6);                 // الحافة الخارجية
    ctx.quadraticCurveTo(46, 2, 40, 6);                   // الرأس المعقوف
    ctx.quadraticCurveTo(6, 30, -26, 46);                 // الحافة الداخلية
    ctx.closePath(); ctx.fill();
    ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(-34, 36); ctx.lineTo(-22, 50); ctx.stroke();   // الواقي
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-29, 44); ctx.quadraticCurveTo(-38, 52, -42, 50); ctx.stroke(); // المقبض
    ctx.beginPath(); ctx.arc(-43, 49, 3.2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }
  // الجذع
  ctx.beginPath(); ctx.moveTo(-4, 30); ctx.quadraticCurveTo(-2.4, 0, -1.8, -26); ctx.lineTo(1.8, -26); ctx.quadraticCurveTo(2.4, 0, 4, 30); ctx.closePath(); ctx.fill();
  // السعف: مروحة متناظرة تنحني أطرافها لتحت
  const leaf = (ang, len, w) => {
    ctx.save(); ctx.translate(0, -28); ctx.rotate(ang);
    ctx.beginPath(); ctx.moveTo(0, -w * 0.4);
    ctx.quadraticCurveTo(len * 0.55, -w * 1.4, len, w * 0.9);
    ctx.quadraticCurveTo(len * 0.5, w * 0.2, 0, w * 0.6); ctx.closePath(); ctx.fill();
    ctx.restore();
  };
  const A = [-0.05, -0.45, -0.9, -1.3];
  for (const a of A) { leaf(a, 32 - Math.abs(a) * 6, 4.5); leaf(Math.PI - a, 32 - Math.abs(a) * 6, -4.5); }
  leaf(-Math.PI / 2, 14, 3);
  ctx.restore();
}

// ---------- سيارة الفورمولا ----------
const SHARED = {};
function sharedCarGeos() {
    if (SHARED.flame) return SHARED;
    // الطول ~5.4م باتجاه +z (المقدمة)
    SHARED.flame = new T.ConeGeometry(0.22, 1.6, 10, 1, true).rotateX(-Math.PI / 2).translate(0, 0, -0.8);
    SHARED.ring = new T.TorusGeometry(1.6, 0.08, 6, 32).rotateX(Math.PI / 2);
    SHARED.dome = new T.SphereGeometry(3.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.75, 0.55, 1);
    return SHARED;
}

/**
 * دبوس اللاعب فوق سيارته: صورته داخل دائرة بلون فريقه + رقم مركزه.
 * يُعاد رسمه فقط لما يتغير المركز (setPos).
 */
function makePin(car) {
    const c = document.createElement('canvas'); c.width = 192; c.height = 224;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    let img = null, pos = 0;
    const draw = () => {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 192, 224);
        // السهم تحت الدائرة
        ctx.fillStyle = car.color;
        ctx.beginPath(); ctx.moveTo(78, 168); ctx.lineTo(114, 168); ctx.lineTo(96, 210); ctx.closePath(); ctx.fill();
        ctx.beginPath(); ctx.arc(96, 100, 76, 0, Math.PI * 2); ctx.fillStyle = car.color; ctx.fill();
        ctx.save(); ctx.beginPath(); ctx.arc(96, 100, 64, 0, Math.PI * 2); ctx.clip();
        if (img) ctx.drawImage(img, 32, 36, 128, 128);
        else {
            ctx.fillStyle = '#16181f'; ctx.fillRect(32, 36, 128, 128);
            ctx.fillStyle = '#fff'; ctx.font = `700 64px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(car.name).trim().charAt(0) || '?', 96, 104);
        }
        ctx.restore();
        if (pos) {
            ctx.beginPath(); ctx.arc(40, 34, 30, 0, Math.PI * 2); ctx.fillStyle = car.color; ctx.fill();
            ctx.lineWidth = 6; ctx.strokeStyle = '#0d0f15'; ctx.stroke();
            ctx.fillStyle = luminance(car.color) > 0.6 ? '#111' : '#fff';
            ctx.font = `800 36px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(String(pos), 40, 37);
        }
        tex.needsUpdate = true;
    };
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    if (car.avatar) {
        const im = new Image(); im.crossOrigin = 'anonymous';
        im.onload = () => { img = im; try { draw(); } catch (e) { img = null; draw(); } };
        im.src = car.avatar;
    }
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.center.set(0.5, 0); s.renderOrder = 10;
    s.userData.setPos = (p) => { if (p !== pos) { pos = p; draw(); } };
    return s;
}

/** كبسولة الاسم — تظهر فوق اللاعب اللي الكاميرا تتابعه. */
function makeNameTag(car) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 112;
    const tex = new T.CanvasTexture(c); tex.colorSpace = T.SRGBColorSpace;
    const draw = () => {
        const ctx = c.getContext('2d');
        ctx.clearRect(0, 0, 512, 112);
        ctx.fillStyle = 'rgba(12,16,26,.9)'; roundRect(ctx, 6, 6, 500, 84, 42); ctx.fill();
        ctx.lineWidth = 6; ctx.strokeStyle = car.color; ctx.stroke();
        ctx.fillStyle = 'rgba(12,16,26,.9)'; ctx.beginPath(); ctx.moveTo(236, 90); ctx.lineTo(276, 90); ctx.lineTo(256, 110); ctx.closePath(); ctx.fill();
        ctx.direction = 'rtl'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff';
        let size = 44; ctx.font = `700 ${size}px ${FONT}`;
        while (ctx.measureText(car.name).width > 440 && size > 22) { size -= 2; ctx.font = `700 ${size}px ${FONT}`; }
        ctx.fillText(car.name, 256, 50);
        tex.needsUpdate = true;
    };
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
    const s = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    s.center.set(0.5, 0); s.renderOrder = 11; s.visible = false;
    return s;
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function luminance(hex) { const c = new T.Color(hex); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; }

/** دمج أشكال بألوان رؤوس (vertex colors) — السيارة كلها بمادة وحدة = draw call واحد. */
function mergeColored(parts) {
    const pos = [], nor = [], col = [];
    for (const [g0, m, c] of parts) {
        const g = g0.index ? g0.toNonIndexed() : g0.clone();
        g.applyMatrix4(m);
        const pa = g.attributes.position.array, na = g.attributes.normal.array;
        for (let k = 0; k < pa.length; k++) { pos.push(pa[k]); nor.push(na[k]); }
        if (typeof c === 'function') { for (let k = 0; k < pa.length; k += 3) { const cc = c(pa[k], pa[k + 1], pa[k + 2]); col.push(cc.r, cc.g, cc.b); } }
        else for (let k = 0; k < pa.length / 3; k++) col.push(c.r, c.g, c.b);
        g.dispose(); g0.dispose();
    }
    const out = new T.BufferGeometry();
    out.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return out;
}

/**
 * «لوفت»: جسم ناعم متصل من مقاطع عرضية على طول z — كل مقطع شكل superellipse
 * {z, w نصف العرض, h نصف الارتفاع, y المركز, x المركز (اختياري), n (2 دائري، أكبر = أقرب للمستطيل)}.
 * فيه نسخدم لهيكل الفورمولا (الأنف/الحوض/غطاء المحرك) والجوانب (sidepods).
 */
function loft(sections, M2 = 18) {
    const pos = [], idx = [];
    sections.forEach(sc => {
        const n = sc.n || 2.4, x0 = sc.x || 0;
        for (let k = 0; k < M2; k++) {
            const t = k / M2 * Math.PI * 2, c = Math.cos(t), si = Math.sin(t);
            pos.push(x0 + Math.sign(c) * Math.pow(Math.abs(c), 2 / n) * sc.w, sc.y + Math.sign(si) * Math.pow(Math.abs(si), 2 / n) * sc.h, sc.z);
        }
    });
    for (let r = 0; r < sections.length - 1; r++) for (let k = 0; k < M2; k++) {
        const a = r * M2 + k, b = r * M2 + (k + 1) % M2, c2 = a + M2, d = b + M2;
        idx.push(a, c2, b, b, c2, d);
    }
    // أغطية الطرفين
    for (const [r, flip] of [[0, true], [sections.length - 1, false]]) {
        const sc = sections[r], ci = pos.length / 3; pos.push(sc.x || 0, sc.y, sc.z);
        for (let k = 0; k < M2; k++) { const a = r * M2 + k, b = r * M2 + (k + 1) % M2; if (flip) idx.push(ci, b, a); else idx.push(ci, a, b); }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    return g;
}
/** جناح بمقطع إيروفويل (بروفايل مستدير من قدّام ورفيع من ورا) بعرض span، الوتر chord، السماكة th. */
function airfoil(span, chord, th) {
    const sh = new T.Shape();
    sh.moveTo(chord / 2, 0);
    sh.quadraticCurveTo(chord / 2, th, chord * 0.15, th * 0.9);
    sh.quadraticCurveTo(-chord / 2 + 0.01, th * 0.35, -chord / 2, 0);
    sh.quadraticCurveTo(-chord / 4, -th * 0.15, chord / 2, 0);
    const g = new T.ExtrudeGeometry(sh, { depth: span, bevelEnabled: false, curveSegments: 6 });
    g.translate(0, 0, -span / 2); g.rotateY(Math.PI / 2);   // الوتر على z، العرض على x
    return g;
}

/**
 * سيارة فورمولا بأشكال ناعمة: أنف مدبب، جوانب مدوّرة، غطاء محرك ينحف للخلف،
 * أجنحة بألواح ملوّنة، ونقشة (لون الفريق + خطوط فاتحة + أجزاء كربون).
 * الهيكل كله شكل واحد بألوان رؤوس، والعجلات محورين (كل محور يدور كقطعة وحدة).
 */
function buildCar(car) {
    const G = sharedCarGeos();
    const g = new T.Group();
    const main = new T.Color(car.color);
    const hsl = {}; main.getHSL(hsl);
    const accent = hsl.l > 0.75 ? new T.Color(0x1f2937) : new T.Color().setHSL(hsl.h, Math.min(1, hsl.s * 0.6), Math.min(0.95, hsl.l + 0.38));
    const dark = new T.Color().setHSL(hsl.h, hsl.s * 0.8, Math.max(0.08, hsl.l * 0.55));
    const carbon = new T.Color(0x16171c), white = new T.Color(0xf5f5f7), metal = new T.Color(0x9aa3ad);
    const cyl = (rt, rb, h, seg = 14) => new T.CylinderGeometry(rt, rb, h, seg);
    const box = (w, h, l) => new T.BoxGeometry(w, h, l);
    const X = Math.PI / 2, I = M();
    // النقشة: لون الفريق فوق، كربون تحت خط الوسط، وخط فاتح على ظهر الأنف وغطاء المحرك
    const livery = (x, y, z) => {
        if (y < 0.27) return carbon;
        if (Math.abs(x) < 0.06 && y > 0.5 && (z > 0.9 || z < -0.4)) return accent;
        return main;
    };
    const podLivery = (x, y) => (y < 0.3 ? carbon : (y > 0.52 && Math.abs(x) > 0.3 ? accent : main));
    const S = (z, w, h, y, n, x) => ({ z, w, h, y, n: n || 2.6, x: x || 0 });
    // الهيكل: أنف إبرة ← حوض السائق ← غطاء محرك يرتفع لفتحة الهواء ثم ينحف للخلف
    const chassis = loft([
        S(3.3, 0.035, 0.03, 0.27, 2.2), S(3.0, 0.07, 0.06, 0.29), S(2.4, 0.13, 0.1, 0.33), S(1.8, 0.2, 0.15, 0.38),
        S(1.25, 0.28, 0.2, 0.43), S(0.75, 0.34, 0.24, 0.46, 3), S(0.2, 0.37, 0.27, 0.48, 3), S(-0.3, 0.33, 0.32, 0.52, 2.8),
        S(-0.85, 0.27, 0.32, 0.53), S(-1.45, 0.2, 0.25, 0.48), S(-2.0, 0.12, 0.17, 0.42), S(-2.4, 0.05, 0.09, 0.38, 2.2)
    ], 20);
    // فتحة الهواء فوق راس السائق (روول بار) تنزل وتصير زعنفة القرش
    const airbox = loft([
        S(0.12, 0.05, 0.05, 0.86, 2.2), S(-0.02, 0.13, 0.11, 0.88, 3), S(-0.3, 0.11, 0.13, 0.84, 2.8),
        S(-0.8, 0.07, 0.11, 0.76), S(-1.4, 0.035, 0.08, 0.66, 2.2)
    ], 14);
    // الجوانب (sidepods): فتحة قدّام، تنحف وتدخل للداخل للخلف (شكل قارورة الكولا)، والسفلي محفور
    const pod = sx => loft([
        S(0.62, 0.06, 0.05, 0.42, 3, sx * 0.62), S(0.48, 0.2, 0.15, 0.41, 3.4, sx * 0.64), S(0.1, 0.23, 0.17, 0.4, 3.2, sx * 0.62),
        S(-0.45, 0.2, 0.15, 0.38, 3, sx * 0.56), S(-1.05, 0.14, 0.11, 0.35, 2.8, sx * 0.45), S(-1.6, 0.06, 0.06, 0.31, 2.4, sx * 0.33)
    ], 16);
    const parts = [
        [chassis, I, livery], [airbox, I, livery], [pod(1), I, podLivery], [pod(-1), I, podLivery],
        // فتحة التبريد السوداء قدّام الجوانب
        [box(0.3, 0.2, 0.02), M(0.63, 0.42, 0.63), carbon], [box(0.3, 0.2, 0.02), M(-0.63, 0.42, 0.63), carbon],
        // زعنفة القرش + كاميرا T فوق فتحة الهواء
        [box(0.025, 0.36, 1.25), M(0, 0.86, -1.25, 0.06, 0, 0), main],
        [box(0.12, 0.035, 0.06), M(0, 1.02, 0.02), accent],
        // الأرضية: لوح عريض بحافة مرفوعة + المشتت الخلفي
        [box(1.55, 0.04, 3.3), M(0, 0.07, -0.15), carbon],
        [box(0.04, 0.08, 2.4), M(0.78, 0.1, -0.35), carbon], [box(0.04, 0.08, 2.4), M(-0.78, 0.1, -0.35), carbon],
        [box(1.0, 0.03, 0.5), M(0, 0.16, -1.95, 0.35, 0, 0), carbon],
        // الهالة: حلقة فوق الكوكبيت + العمود الوسطي
        [new T.TorusGeometry(0.36, 0.035, 8, 22, Math.PI), M(0, 0.78, 0.5, -X, 0, 0, 1, 1.25, 1), carbon],
        [cyl(0.03, 0.03, 0.36, 8), M(0, 0.7, 0.93, -0.75, 0, 0), carbon],
        // الجناح الأمامي: ثلاث طبقات (كربون + فلابين بلون الفريق) وألواح جانبية + دعامتين للأنف
        [airfoil(2.1, 0.5, 0.05), M(0, 0.1, 3.05), carbon],
        [airfoil(1.9, 0.3, 0.04), M(0, 0.17, 2.88, -0.25, 0, 0), main],
        [airfoil(1.7, 0.22, 0.035), M(0, 0.24, 2.76, -0.45, 0, 0), accent],
        [box(0.035, 0.26, 0.72), M(1.06, 0.2, 2.98), main], [box(0.035, 0.26, 0.72), M(-1.06, 0.2, 2.98), main],
        [box(0.025, 0.2, 0.18), M(0.12, 0.2, 3.0), carbon], [box(0.025, 0.2, 0.18), M(-0.12, 0.2, 3.0), carbon],
        // الجناح الخلفي: لوحين (الأعلى فلاب DRS) + ألواح جانبية مقوسة بلون الفريق + جناح سفلي (beam) + عمود
        [airfoil(1.7, 0.42, 0.05), M(0, 0.98, -2.42, 0.08, 0, 0), carbon],
        [airfoil(1.7, 0.26, 0.04), M(0, 1.13, -2.55, -0.38, 0, 0), main],
        [box(0.035, 0.68, 0.78), M(0.86, 0.9, -2.45), main], [box(0.035, 0.68, 0.78), M(-0.86, 0.9, -2.45), main],
        [box(0.036, 0.14, 0.78), M(0.86, 1.17, -2.45), accent], [box(0.036, 0.14, 0.78), M(-0.86, 1.17, -2.45), accent],
        [airfoil(1.0, 0.22, 0.03), M(0, 0.5, -2.3), carbon],
        [box(0.05, 0.55, 0.12), M(0, 0.72, -2.38), carbon],
        // أذرع التعليق (كربون): أمامية مائلة لمركز العجلة، وخلفية
        [box(0.76, 0.025, 0.05), M(0.6, 0.38, 1.82, 0, 0.18, 0.05), carbon], [box(0.76, 0.025, 0.05), M(-0.6, 0.38, 1.82, 0, -0.18, -0.05), carbon],
        [box(0.76, 0.025, 0.05), M(0.6, 0.3, 1.66, 0, -0.18, -0.03), carbon], [box(0.76, 0.025, 0.05), M(-0.6, 0.3, 1.66, 0, 0.18, 0.03), carbon],
        [box(0.62, 0.025, 0.05), M(0.68, 0.4, -1.4, 0, 0.1, 0.04), carbon], [box(0.62, 0.025, 0.05), M(-0.68, 0.4, -1.4, 0, -0.1, -0.04), carbon],
        [box(0.62, 0.025, 0.05), M(0.68, 0.3, -1.52, 0, -0.1, -0.03), carbon], [box(0.62, 0.025, 0.05), M(-0.68, 0.3, -1.52, 0, 0.1, 0.03), carbon],
        // المرايا على دعامات
        [box(0.15, 0.07, 0.04), M(0.47, 0.72, 0.95), main], [box(0.15, 0.07, 0.04), M(-0.47, 0.72, 0.95), main],
        [box(0.12, 0.02, 0.02), M(0.39, 0.66, 0.95, 0, 0, 0.5), carbon], [box(0.12, 0.02, 0.02), M(-0.39, 0.66, 0.95, 0, 0, -0.5), carbon]
    ];
    const geo = mergeColored(parts);
    const paint = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.3 });
    const body = new T.Mesh(geo, paint); body.castShadow = true; g.add(body);
    // العجلات: إطار عريض أسود بخط ملوّن على الجنب + جنط داكن + برامق تبيّن الدوران
    const stripe = new T.Color(0xfacc15), rim = new T.Color(0x2a2d34);
    const axle = (half, r, w) => {
        const ps = [];
        for (const sx of [1, -1]) {
            ps.push([cyl(r, r, w, 24), M(sx * half, 0, 0, 0, 0, X), carbon]);
            ps.push([new T.TorusGeometry(r * 0.8, 0.012, 6, 28), M(sx * (half + w / 2 + 0.001), 0, 0, 0, X, 0), stripe]);
            ps.push([cyl(r * 0.62, r * 0.62, w + 0.012, 20), M(sx * half, 0, 0, 0, 0, X), rim]);
            for (let k = 0; k < 3; k++) ps.push([box(w + 0.03, r * 1.12, 0.05), M(sx * half, 0, 0, k * Math.PI / 3, 0, 0), metal]);
            ps.push([cyl(r * 0.18, r * 0.18, w + 0.04, 10), M(sx * half, 0, 0, 0, 0, X), main]);
        }
        return new T.Mesh(mergeColored(ps), paint);
    };
    const front = axle(0.94, 0.36, 0.36); front.position.set(0, 0.36, 1.75);
    const rear = axle(0.96, 0.38, 0.46); rear.position.set(0, 0.38, -1.45);
    g.add(front, rear);
    const wheels = [front, rear];
    // الخوذة + الزجاج (تنخفي بلقطة داخل السيارة)
    const helmet = new T.Mesh(mergeColored([
        [new T.SphereGeometry(0.21, 16, 12), M(0, 0, 0), accent.clone().lerp(white, 0.3)],
        [box(0.3, 0.08, 0.12), M(0, 0.01, 0.15), carbon]
    ]), paint);
    helmet.position.set(0, 0.8, 0.36); g.add(helmet);
    // لهب التوربو/النيترو + حلقة الدرع/التوقف + ضوء خلفي
    const flameMat = new T.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.85, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide });
    const flame = new T.Mesh(G.flame, flameMat); flame.position.set(0, 0.55, -2.55); flame.visible = false; g.add(flame);
    const ringMat = new T.MeshBasicMaterial({ color: 0x22c55e, transparent: true, opacity: 0.6, blending: T.AdditiveBlending, depthWrite: false });
    const ring = new T.Mesh(G.ring, ringMat); ring.position.y = 0.08; ring.visible = false; g.add(ring);
    const rain = new T.Mesh(new T.BoxGeometry(0.2, 0.12, 0.05), new T.MeshBasicMaterial({ color: 0xff2020 })); rain.position.set(0, 0.62, -2.62); g.add(rain);
    const dome = new T.Mesh(G.dome, new T.MeshBasicMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.18, blending: T.AdditiveBlending, depthWrite: false }));
    dome.visible = false; g.add(dome);
    const pin = makePin(car); g.add(pin);
    const tag = makeNameTag(car); g.add(tag);
    return { group: g, wheels, flame, flameMat, ring, dome, pin, tag, paint, body, helmet, rain, spin: 0, data: car };
}

function disposeCar(o) {
    o.paint.dispose(); o.body.geometry.dispose(); o.helmet.geometry.dispose();
    o.wheels.forEach(w => w.geometry.dispose());
    o.flameMat.dispose(); o.ring.material.dispose(); o.dome.material.dispose();
    o.rain.geometry.dispose(); o.rain.material.dispose();
    o.pin.material.map.dispose(); o.pin.material.dispose();
    o.tag.material.map.dispose(); o.tag.material.dispose();
}

// ---------- المشهد ----------
export function mountRace(el, { track, trackPoint, quality = 'balanced' }) {
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
    const SKY = 0xcfe7f7;
    scene.background = canvasTex(4, 256, (ctx, w, h) => {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#3f9bff'); g.addColorStop(0.5, '#9fd3ff'); g.addColorStop(1, '#eaf6ff');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    });
    scene.fog = new T.Fog(SKY, 400, 1500);
    const camera = new T.PerspectiveCamera(55, W() / H(), 0.1, 3200);
    camera.position.set(0, 60, 120);

    scene.add(new T.HemisphereLight(0xeaf6ff, 0x5c8a3a, 1.15));
    const sun = new T.DirectionalLight(0xfff1dc, 2.4);
    sun.position.set(80, 140, 60); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -45, right: 45, top: 45, bottom: -45, near: 10, far: 400 });
    sun.shadow.bias = -0.0005;
    scene.add(sun, sun.target);

    const decor = [];   // أشياء تنخفي بوضع الرسوم الخفيف
    // ---- الأرض (عشب مقصوص بخطوط) ----
    const grassTex = canvasTex(256, 256, (ctx, w, h) => {
        for (let i = 0; i < 8; i++) { ctx.fillStyle = i % 2 ? '#5fbf45' : '#68c94d'; ctx.fillRect(0, i * h / 8, w, h / 8); }
        for (let i = 0; i < 1400; i++) { ctx.fillStyle = `rgba(${40 + Math.random() * 40},${120 + Math.random() * 60},40,.22)`; ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, true);
    grassTex.repeat.set(90, 90);
    // الأرض تحت المضمار بمسافة كافية + polygonOffset عشان ما يطلع العشب فوق الأسفلت من بعيد
    const ground = new T.Mesh(new T.PlaneGeometry(4400, 4400), new T.MeshStandardMaterial({ map: grassTex, roughness: 1, polygonOffset: true, polygonOffsetFactor: 4, polygonOffsetUnits: 8 }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(0, -0.06, -150); ground.receiveShadow = true;
    scene.add(ground);

    const half = track.width / 2;
    // ---- منطقة آمنة (حصى/أسفلت فاتح) ----
    const runoff = new T.Mesh(ribbon(track, -half - 9, half + 9, -0.02), new T.MeshStandardMaterial({ color: 0xb9ad93, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 4 }));
    runoff.receiveShadow = true; scene.add(runoff);
    // ---- الأسفلت (خطوط بيضاء على الأطراف) ----
    const asphaltTex = canvasTex(256, 256, (ctx, w, h) => {
        ctx.fillStyle = '#34363b'; ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 5000; i++) { const v = 40 + Math.random() * 35; ctx.fillStyle = `rgb(${v},${v},${v + 4})`; ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
        ctx.fillStyle = 'rgba(0,0,0,.12)'; ctx.fillRect(w * 0.26, 0, w * 0.12, h); ctx.fillRect(w * 0.62, 0, w * 0.12, h); // خط السباق الداكن
        ctx.fillStyle = '#f2f2f2'; ctx.fillRect(4, 0, 5, h); ctx.fillRect(w - 9, 0, 5, h);
        ctx.fillStyle = 'rgba(245,245,245,.9)'; ctx.fillRect(w / 2 - 3, h * 0.05, 6, h * 0.4); // الخط المتقطع بالنص
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
    // لوحات الحواجز (كل 12م ثلاث لوحات): أخضر سعودي بالشعار · أبيض «ألعاب أيمن» · أحمر «AYMN GAMES»
    const barrierTex = canvasTex(1536, 160, (ctx, w, h) => {
        const P = w / 3;
        const txt = (t, x, y, size, col) => { ctx.fillStyle = col; ctx.font = `800 ${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl'; ctx.fillText(t, x, y); };
        // 1) السعودية
        ctx.fillStyle = '#006c35'; ctx.fillRect(0, 0, P, h);
        drawSaudiEmblem(ctx, 92, 74, 1.12, '#ffffff');
        txt('السعودية', P * 0.62, h * 0.47, 64, '#ffffff');
        // 2) ألعاب أيمن
        ctx.fillStyle = '#f7f7f5'; ctx.fillRect(P, 0, P, h);
        drawSaudiEmblem(ctx, P + 80, 74, 0.95, '#006c35');
        txt('ألعاب أيمن', P + P * 0.6, h * 0.47, 60, '#e10600');
        // 3) AYMN GAMES
        ctx.fillStyle = '#c40500'; ctx.fillRect(P * 2, 0, P, h);
        txt('AYMN GAMES', P * 2.5, h * 0.47, 58, '#ffffff');
        // شريط أخضر تحت كل اللوحات + فواصل
        ctx.fillStyle = '#006c35'; ctx.fillRect(0, h - 14, w, 14);
        ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(P - 2, 0, 4, h); ctx.fillRect(P * 2 - 2, 0, 4, h); ctx.fillRect(w - 4, 0, 4, h);
    }, true);
    const barrierMat = new T.MeshStandardMaterial({ map: barrierTex, roughness: 0.6, side: T.DoubleSide });
    scene.add(new T.Mesh(wall(track, half + 9, 1.25, 2, 12, false), barrierMat), new T.Mesh(wall(track, -half - 9, 1.25, 2, 12, true), barrierMat));
    // سياج فوق الحاجز
    const fenceTex = canvasTex(64, 64, (ctx, w, h) => {
        ctx.clearRect(0, 0, w, h); ctx.strokeStyle = 'rgba(200,205,210,.75)'; ctx.lineWidth = 2;
        for (let i = -w; i < w * 2; i += 12) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke(); }
    }, true);
    const fenceMat = new T.MeshBasicMaterial({ map: fenceTex, transparent: true, side: T.DoubleSide, depthWrite: false, alphaTest: 0.05 });
    const fence = new T.Mesh(wall(track, half + 9.3, 4, 2), fenceMat); fence.position.y = 1.25; fence.geometry.scale(1, 0.7, 1);
    scene.add(fence); decor.push(fence);

    // ---- خط البداية (رقعة شطرنج) + علامات الشبكة ----
    const p0 = trackPoint(0, 0);
    const checker = canvasTex(256, 32, (ctx, w, h) => { for (let x = 0; x < 16; x++) for (let y = 0; y < 2; y++) { ctx.fillStyle = (x + y) % 2 ? '#111' : '#fafafa'; ctx.fillRect(x * 16, y * 16, 16, 16); } });
    const startLine = new T.Mesh(new T.PlaneGeometry(track.width, 1.6), new T.MeshStandardMaterial({ map: checker, roughness: 0.6 }));
    startLine.rotation.set(-Math.PI / 2, 0, p0.heading + Math.PI / 2); startLine.rotation.order = 'YXZ';
    startLine.rotation.set(-Math.PI / 2, p0.heading, 0, 'YXZ');
    startLine.position.set(p0.x, 0.035, p0.z); startLine.receiveShadow = true; scene.add(startLine);
    const gridParts = [];
    for (let i = 0; i < 30; i++) {
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
    [-200, -120, -40, 40, 120].forEach((d, i) => {
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
    // ---- النهر (شريط متعرّج جنوب الحلبة) ----
    const riverZ = x => 175 + Math.sin(x / 260) * 45 + Math.sin(x / 97) * 12;
    {
        const pos = [], idx = [], W2 = 22;
        for (let i = 0, x = -1800; x <= 1800; x += 20, i++) {
            const z = riverZ(x), dz = (riverZ(x + 1) - z), n = Math.hypot(1, dz), nx = -dz / n, nz = 1 / n;
            pos.push(x - nx * W2, 0.02, z - nz * W2, x + nx * W2, 0.02, z + nz * W2);
            if (i) { const p = (i - 1) * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
        }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const water = new T.Mesh(g, new T.MeshStandardMaterial({ color: 0x3aa8e8, roughness: 0.25, metalness: 0.1, emissive: 0x0b4a7a, emissiveIntensity: 0.35, side: T.DoubleSide }));
        scene.add(water);
    }
    // ---- الجبال البعيدة (بدون ضباب عشان تبان) ----
    {
        const green = [], snow = [];
        let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 22; i++) {
            const a = i / 22 * Math.PI * 2 + rnd() * 0.15, R0 = 1350 + rnd() * 350;
            const r = 170 + rnd() * 160, h = 200 + rnd() * 260;
            const x = Math.cos(a) * R0, z = -260 + Math.sin(a) * R0;
            // قمة ثلجية بنفس ميلان الجبل (نفس الدوران ونفس النسبة)
            const ry = rnd() * 3, f = 0.3 + rnd() * 0.12;
            green.push([new T.ConeGeometry(r, h, 7), M(x, h / 2 - 5, z, 0, ry, 0)]);
            snow.push([new T.ConeGeometry(r * f * 1.03, h * f, 7), M(x, h - 5 - h * f / 2 + 0.5, z, 0, ry, 0)]);
        }
        scene.add(new T.Mesh(merge(green), new T.MeshLambertMaterial({ color: 0x8fa8bf, flatShading: true, fog: false })));
        if (snow.length) scene.add(new T.Mesh(merge(snow), new T.MeshLambertMaterial({ color: 0xf4f8fb, flatShading: true, fog: false })));
    }
    // ---- تلال خضراء قريبة (بين المضمار والجبال) ----
    {
        const hills = [];
        let seed = 23; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let i = 0; i < 16; i++) {
            const a = i / 16 * Math.PI * 2 + rnd() * 0.2, R0 = 880 + rnd() * 220, r = 140 + rnd() * 120;
            hills.push([new T.SphereGeometry(r, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(Math.cos(a) * R0, -4, -260 + Math.sin(a) * R0, 0, 0, 0, 1, 0.35 + rnd() * 0.25, 1)]);
        }
        const hm = new T.Mesh(merge(hills), new T.MeshLambertMaterial({ color: 0x6cbf55, flatShading: true }));
        scene.add(hm);
    }
    // ---- الأشجار (Instanced): صنوبر + أشجار مزهرة ملوّنة ----
    {
        const pts = [];
        let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
        for (let tries = 0; pts.length < 420 && tries < 9000; tries++) {
            const x = -900 + rnd() * 1800, z = -850 + rnd() * 1250;
            if (Math.abs(z - riverZ(x)) < 40) continue;
            let near = Infinity;
            for (let k = 0; k < track.count; k += 6) near = Math.min(near, Math.hypot(track.x[k] - x, track.z[k] - z));
            if (near > 48 && !(Math.abs(z) < 70 && x > -320 && x < 360)) pts.push([x, z, 0.7 + rnd() * 0.7, rnd()]);
        }
        const pines = pts.filter(p => p[3] < 0.4), round = pts.filter(p => p[3] >= 0.4);
        const trunks = new T.InstancedMesh(new T.CylinderGeometry(0.4, 0.55, 3, 5), new T.MeshStandardMaterial({ color: 0x6b4426 }), pts.length);
        const tops = new T.InstancedMesh(new T.ConeGeometry(3.4, 9, 7), new T.MeshStandardMaterial({ color: 0x2f8a3a, flatShading: true }), Math.max(1, pines.length));
        // ثلج على رؤوس الصنوبر
        const snowTips = new T.InstancedMesh(new T.ConeGeometry(1.45, 3.0, 7), new T.MeshStandardMaterial({ color: 0xf7fbff, flatShading: true }), Math.max(1, pines.length));
        const crowns = new T.InstancedMesh(new T.IcosahedronGeometry(3.6, 0), new T.MeshStandardMaterial({ color: 0xffffff, flatShading: true }), Math.max(1, round.length));
        const CROWN = [0xf9a8d4, 0xf472b6, 0xfbcfe8, 0x4ade80, 0x22c55e, 0xf9a8d4, 0xfb923c];
        const col = new T.Color();
        pts.forEach(([x, z, s], i) => trunks.setMatrixAt(i, M(x, 1.5 * s, z, 0, 0, 0, s, s, s)));
        pines.forEach(([x, z, s], i) => { tops.setMatrixAt(i, M(x, 7.5 * s, z, 0, i, 0, s, s, s)); snowTips.setMatrixAt(i, M(x, 10.6 * s, z, 0, i, 0, s, s, s)); });
        round.forEach(([x, z, s, r], i) => {
            crowns.setMatrixAt(i, M(x, 5.6 * s, z, 0, i, 0, s, s * 0.9, s));
            crowns.setColorAt(i, col.setHex(CROWN[Math.floor(r * 1000) % CROWN.length]));
        });
        tops.count = snowTips.count = pines.length; crowns.count = round.length;
        scene.add(trunks, tops, snowTips, crowns);
        decor.push(trunks, tops, snowTips, crowns);
    }

    // ---- لقطة «المضمار كامل» ----
    const trackView = (() => {
        let a = Infinity, b = -Infinity, c = Infinity, d = -Infinity;
        for (let i = 0; i < track.count; i++) { a = Math.min(a, track.x[i]); b = Math.max(b, track.x[i]); c = Math.min(c, track.z[i]); d = Math.max(d, track.z[i]); }
        const cx = (a + b) / 2, cz = (c + d) / 2, ext = Math.max(b - a, (d - c) * 1.6) / 2 + 60;
        const fov = 45, h = ext / Math.tan(fov * Math.PI / 360);
        return { pos: new T.Vector3(cx, h * 0.92, cz + h * 0.38), look: new T.Vector3(cx, 0, cz + 20), fov };
    })();

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
    const BURST = { tap: [0xff3b6b, 8], nitro: [0x22d3ee, 16], shield: [0x38bdf8, 22], portal: [0xa855f7, 34], shuttle: [0xf97316, 26], rocket: [0xef4444, 14], lightning: [0xeab308, 14], hit: [0xef4444, 22], win: [0xffd400, 60] };

    // ---- السيارات ----
    const cars = new Map();
    let focusId = null, camMode = 'orbit', phase = 'lobby';
    const camPos = new T.Vector3(0, 60, 120), camLook = new T.Vector3();
    let camFov = 55, orbitT = 0, lastMode = '', lastFocus = null;

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
            // لهب: المكوك برتقالي، النيترو أزرق
            const fire = (fx.shuttle > 0 || fx.nitro > 0) && !(fx.stop > 0);
            o.flame.visible = fire;
            if (fire) {
                o.flameMat.color.set(fx.shuttle > 0 ? 0xff6a00 : 0x38bdf8);
                o.flame.scale.set(1, 1, (fx.shuttle > 0 ? 1.7 : 1.1) * (0.8 + Math.random() * 0.45));
            }
            // حلقة: أحمر = متوقف (صاروخ/صاعقة)، سماوي = درع الحماية
            o.ring.visible = fx.stop > 0 || fx.shield > 0;
            if (o.ring.visible) { o.ring.material.color.set(fx.stop > 0 ? 0xef4444 : 0x38bdf8); o.ring.rotation.y += dt * 2; o.ring.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.06); }
            o.dome.visible = fx.shield > 0;
            if (o.dome.visible) o.dome.material.opacity = 0.16 + Math.sin(performance.now() / 120) * 0.06;
            o.rain.material.color.setScalar(0); o.rain.material.color.r = (Math.floor(performance.now() / 120) % 2 || s.speed < 30) ? 1 : 0.25;
            const inside = camMode === 'onboard' && s.id === focusId;
            o.helmet.visible = !inside;
            // الدبوس يكبر مع بعد الكاميرا عشان يبان باللقطات البعيدة
            o.pin.visible = !inside;
            if (s.pos) o.pin.userData.setPos(s.pos);
            const dist = camera.position.distanceTo(g.position);
            const zoom = Math.tan(camera.fov * Math.PI / 360);   // اللقطة المقرّبة (fov صغير) ما تكبّر الدبوس
            const ps = Math.max(1.1, dist * zoom * (camMode === 'track' ? 0.07 : 0.075));
            o.pin.scale.set(ps, ps * 224 / 192, 1); o.pin.position.y = 1.6 + ps * 0.15;
            const focused = s.id === focusId && !inside && camMode !== 'track' && phase !== 'lobby';
            o.tag.visible = focused;
            if (focused) { o.tag.scale.set(ps * 2.4, ps * 2.4 * 112 / 512, 1); o.tag.position.y = o.pin.position.y + ps * 1.2; }
            g.userData.speed = s.speed; g.userData.d = s.d; g.userData.lane = s.lane || 0;
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
        // تغيير اللقطة أو اللاعب = قطع مباشر (مثل النقل التلفزيوني) بدل ما تنزلق الكاميرا عبر الخريطة
        const jump = lastMode !== camMode || (focusId !== lastFocus && camMode !== 'track' && camMode !== 'orbit');
        lastMode = camMode; lastFocus = focusId;
        let targetPos, targetLook, fov = 55;
        if (camMode === 'track') {
            // المضمار كامل: من فوق بزاوية، كل الحلبة والسيارات
            targetPos = trackView.pos; targetLook = trackView.look; fov = trackView.fov;
        } else if (camMode === 'orbit' || !o) {
            // دوران حول شبكة الانطلاق
            // اللوبي: لقطة مائلة من فوق على شبكة الانطلاق، تتمايل بهدوء
            orbitT += dt * 0.25;
            const n = Math.max(1, cars.size), dc = -14 - (n - 1) * 4.5;
            // من جهة مبنى الصيانة (المدرجات بالجهة الثانية تحجب الرؤية)
            const look = trackPoint(dc, 0), eye = trackPoint(dc + 16 + n * 1.6, 17 + n * 0.7 + Math.sin(orbitT) * 3);
            targetPos = new T.Vector3(eye.x, 13 + n * 0.9 + Math.sin(orbitT * 0.7) * 1.2, eye.z);
            targetLook = new T.Vector3(look.x, 0.5, look.z);
            fov = 48;
            if (phase === 'finish' && o) { targetLook = o.group.position.clone().setY(1); targetPos = o.group.position.clone().add(new T.Vector3(Math.sin(orbitT * 2) * 12, 5, Math.cos(orbitT * 2) * 12)); fov = 45; }
        } else {
            const g = o.group, fwd = new T.Vector3(Math.sin(g.rotation.y), 0, Math.cos(g.rotation.y));
            const spd = g.userData.speed || 0;
            if (camMode === 'tv') {
                // خلف السيارة على مسار المضمار نفسه (ما تطلع الكاميرا برا الحواجز بالمنعطفات)
                const d0 = g.userData.d, ln = g.userData.lane * 0.5;
                if (d0 != null) {
                    const b = trackPoint(d0 - 15 - spd * 0.05, ln), f = trackPoint(d0 + 14, ln);
                    targetPos = new T.Vector3(b.x, 6.2, b.z); targetLook = new T.Vector3(f.x, 1, f.z);
                } else {
                    targetPos = g.position.clone().addScaledVector(fwd, -14).setY(6);
                    targetLook = g.position.clone().addScaledVector(fwd, 12).setY(1);
                }
                fov = 56 + Math.min(12, spd * 0.12);
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
        // لقطة المضمار كامل بعيدة: نشيل الضباب عشان الحلبة كلها تبان
        scene.fog.near = camMode === 'track' ? 3000 : 400; scene.fog.far = camMode === 'track' ? 6000 : fogFar;
        const nearWant = camMode === 'onboard' ? 0.1 : 0.5;
        if (camera.near !== nearWant) { camera.near = nearWant; camera.updateProjectionMatrix(); }
        camera.position.copy(camPos);
        if (camMode === 'onboard' && o) camera.position.y += Math.sin(performance.now() / 30) * 0.008 * Math.min(1, (o.group.userData.speed || 0) / 40);
        camera.lookAt(camLook);
        if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
        // الظل يتبع ما تشوفه الكاميرا
        const focusP = o ? o.group.position : camLook;
        sun.target.position.copy(focusP); sun.position.copy(focusP).add(new T.Vector3(60, 120, 40));
    }

    let fogFar = 1500;
    // ---- وضع الرسوم (خفيف / متوازن / سينمائي) — يتغير وقت السباق بدون إعادة تحميل ----
    function setQuality(q) {
        const Q = {
            light: { pr: 0.75, shadow: false, map: 512, decor: false, fogFar: 1100 },
            balanced: { pr: 1, shadow: true, map: 1024, decor: true, fogFar: 1500 },
            cinematic: { pr: 2, shadow: true, map: 2048, decor: true, fogFar: 2000 }
        }[q] || null;
        if (!Q) return;
        r.setPixelRatio(Math.min(window.devicePixelRatio || 1, Q.pr));
        r.setSize(W(), H(), false);
        sun.castShadow = Q.shadow;
        if (sun.shadow.mapSize.x !== Q.map) { sun.shadow.mapSize.set(Q.map, Q.map); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
        decor.forEach(o => { o.visible = Q.decor; });
        fogFar = Q.fogFar;
    }
    setQuality(quality);


    // =====================================================================
    // مراسم النهاية: الثلاثة الأوائل يستعرضون قدام سياراتهم (15 ثانية)، بعدها
    // تطلع «منصة تتويج ألعاب أيمن» ويمشون لها، ويوقفون عليها بميداليات، والأول
    // يرفع الكاس ويحتفل. الشخصيات = شخصيات الأنمي المشتركة (docs/CHARACTERS.md).
    // لو ما تحمّلت الشخصيات، ceremony() ترجع false واللعبة تعرض منصة HTML العادية.
    // =====================================================================
    let VRM = null, vrmModels = null, vrmAsked = false;
    const logLine = (...a) => { try { const A = window.AymanGamesPlatform; if (A && A.log) A.log(...a); } catch (e) {} };
    function preloadCharacters() {
        if (vrmAsked) return; vrmAsked = true;
        Promise.all([import('../../js/agp-vrm-characters.js'), import('../birthday-party/rig3d.js')]).then(([V, Rg]) => {
            Rg.loadClips(new URL('../birthday-party/anims/', import.meta.url).href).catch(() => null);
            VRM = V;
            const tryLoad = () => V.loadModels().then(m => { if (m) vrmModels = m; else setTimeout(tryLoad, 8000); }).catch(() => setTimeout(tryLoad, 8000));
            tryLoad();
        }).catch(e => logLine('formula-race: characters unavailable', e));
    }
    const hashId = s0 => { let h = 2166136261; const s1 = String(s0); for (let i = 0; i < s1.length; i++) { h ^= s1.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
    const easeIO = x => x < 0 ? 0 : x > 1 ? 1 : x * x * (3 - 2 * x);

    // توجيه عظمة الذراع لاتجاه بإحداثيات الجسم (+Y فوق، +Z قدام، يمين الشخصية -X) — نفس rps-scene.js
    const _qa = new T.Quaternion(), _qb = new T.Quaternion(), _qr = new T.Quaternion(), _v1 = new T.Vector3(), _v2 = new T.Vector3(), _e = new T.Euler();
    const REST_R = new T.Vector3(-1, 0, 0), REST_L = new T.Vector3(1, 0, 0);
    function aimBone(rig, ry, name, dx, dy, dz) {
        const b = rig.bones[name]; if (!b || !b.parent) return;
        _qr.setFromEuler(_e.set(0, ry, 0));
        b.parent.getWorldQuaternion(_qa);
        _v1.copy(name.startsWith('Left') ? REST_L : REST_R).applyQuaternion(_qr);
        _v2.set(dx, dy, dz).normalize().applyQuaternion(_qr);
        _qb.setFromUnitVectors(_v1, _v2).multiply(_qr);
        b.quaternion.copy(_qa.invert()).multiply(_qb);
    }

    // قطعة بين نقطتين (شريط الميدالية)
    function segBox(a, b, w, mat) {
        const va = new T.Vector3(...a), vb = new T.Vector3(...b), len = va.distanceTo(vb);
        const m = new T.Mesh(new T.BoxGeometry(w, len, 0.006), mat);
        m.position.copy(va).add(vb).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new T.Vector3(0, 1, 0), vb.clone().sub(va).normalize());
        return m;
    }
    const MEDAL = [0xf5c542, 0xc9d1dc, 0xcd7f32];
    function makeMedal(i) {
        const g = new T.Group();
        const metal = new T.MeshStandardMaterial({ color: MEDAL[i], metalness: 0.85, roughness: 0.25, emissive: MEDAL[i], emissiveIntensity: 0.12 });
        const ribbon = new T.MeshStandardMaterial({ color: [0xe10600, 0x1d4ed8, 0x16a34a][i], roughness: 0.6 });
        g.add(segBox([0.07, 0.17, 0.05], [0.012, 0.0, 0.135], 0.028, ribbon), segBox([-0.07, 0.17, 0.05], [-0.012, 0.0, 0.135], 0.028, ribbon));
        const disc = new T.Mesh(new T.CylinderGeometry(0.05, 0.05, 0.012, 24), metal);
        disc.rotation.x = Math.PI / 2; disc.position.set(0, -0.04, 0.14); g.add(disc);
        const rim = new T.Mesh(new T.TorusGeometry(0.05, 0.006, 6, 24), metal); rim.position.copy(disc.position); g.add(rim);
        return g;
    }
    function makeTrophy() {
        const gold = new T.MeshStandardMaterial({ color: 0xf5c542, metalness: 0.9, roughness: 0.2, emissive: 0x7a5a00, emissiveIntensity: 0.25 });
        const g = new T.Group();
        const pts = [[0, 0], [0.07, 0], [0.07, 0.025], [0.025, 0.04], [0.02, 0.12], [0.05, 0.15], [0.1, 0.22], [0.115, 0.32], [0.1, 0.32]].map(([x, y]) => new T.Vector2(x, y));
        g.add(new T.Mesh(new T.LatheGeometry(pts, 20), gold));
        for (const sx of [1, -1]) { const h = new T.Mesh(new T.TorusGeometry(0.045, 0.01, 6, 14, Math.PI * 1.2), gold); h.position.set(sx * 0.115, 0.25, 0); h.rotation.z = sx > 0 ? -Math.PI * 0.6 : Math.PI * 1.6; g.add(h); }
        return g;
    }
    // منصة تتويج ألعاب أيمن (مثل منصات الفورمولا): جدار رعاة خلفي بشعار المنصة، لافتة فوقه،
    // ثلاث درجات بألواح ذهبي/فضي/برونزي وسجادة حمراء فوقها، وممر سجاد أحمر قدامها.
    const STEP_H = [1.2, 0.85, 0.6], STEP_LANE = [0, -2.35, 2.35], WALL_Z = -1.65;
    const LOGO_URL = new URL('../../logo.png', import.meta.url).href;
    function buildPodium() {
        const g = new T.Group();
        const white = new T.MeshStandardMaterial({ color: 0xf5f6f8, roughness: 0.45 });
        const carpet = new T.MeshStandardMaterial({ color: 0xb3121b, roughness: 0.95 });
        const goldTrim = new T.MeshStandardMaterial({ color: 0xe8c25a, metalness: 0.8, roughness: 0.3 });
        const dark = new T.MeshStandardMaterial({ color: 0x141821, roughness: 0.6 });
        const base = new T.Mesh(new T.BoxGeometry(8.6, 0.15, 3.6), dark); base.position.set(0, 0.075, 0.05); base.receiveShadow = true; g.add(base);
        const PLATE = [['#fff3c4', '#e8c25a', '#a8811f'], ['#ffffff', '#cfd6df', '#8a95a3'], ['#ffe2c7', '#d08a4f', '#8a4f22']];
        for (let i = 0; i < 3; i++) {
            const h = STEP_H[i], x = STEP_LANE[i];
            const b = new T.Mesh(new T.BoxGeometry(2.3, h, 2.2), white); b.position.set(x, 0.15 + h / 2, 0); b.castShadow = b.receiveShadow = true; g.add(b);
            const top = new T.Mesh(new T.BoxGeometry(2.24, 0.04, 2.14), carpet); top.position.set(x, 0.15 + h + 0.02, 0); top.receiveShadow = true; g.add(top);
            const trim = new T.Mesh(new T.BoxGeometry(2.34, 0.05, 0.06), goldTrim); trim.position.set(x, 0.15 + h, 1.11); g.add(trim);
            const ph = Math.min(0.95, h - 0.12);
            const face = new T.Mesh(new T.PlaneGeometry(1.9, ph), new T.MeshStandardMaterial({ roughness: 0.35, metalness: 0.4, map: canvasTex(320, Math.round(320 * ph / 1.9), (ctx, w, hh) => {
                const gr = ctx.createLinearGradient(0, 0, 0, hh); gr.addColorStop(0, PLATE[i][0]); gr.addColorStop(0.45, PLATE[i][1]); gr.addColorStop(1, PLATE[i][2]);
                ctx.fillStyle = gr; roundRect(ctx, 3, 3, w - 6, hh - 6, 16); ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.font = `800 ${Math.round(hh * 0.62)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(String(i + 1), w / 2, hh * 0.47);
                ctx.font = `700 ${Math.max(14, Math.round(hh * 0.13))}px ${FONT}`; ctx.direction = 'rtl'; ctx.fillStyle = 'rgba(0,0,0,.55)';
                ctx.fillText('ألعاب أيمن', w / 2, hh * 0.86);
            }) }));
            face.position.set(x, 0.15 + h / 2, 1.105); g.add(face);
        }
        // جدار الرعاة بشعار المنصة
        const wallCv = document.createElement('canvas'); wallCv.width = 1024; wallCv.height = 380;
        const wallTex = new T.CanvasTexture(wallCv); wallTex.colorSpace = T.SRGBColorSpace; wallTex.anisotropy = 4;
        const drawWall = (logo) => {
            const ctx = wallCv.getContext('2d'), w = wallCv.width, h = wallCv.height;
            const gr = ctx.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#12070a'); gr.addColorStop(0.5, '#5a0306'); gr.addColorStop(1, '#12070a');
            ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
            ctx.save(); ctx.globalAlpha = 0.16; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
                const x = c * 190 + (r % 2) * 95 + 30, y = r * 82 + 34;
                ctx.font = `700 ${r % 2 ? 26 : 30}px ${FONT}`; ctx.direction = 'rtl';
                ctx.fillText((r + c) % 2 ? 'ألعاب أيمن' : 'AYMN GAMES', x, y);
            }
            ctx.restore();
            // اللوحة الوسطى: الشعار + «منصة التتويج»
            ctx.fillStyle = 'rgba(255,255,255,.95)'; roundRect(ctx, w / 2 - 230, 70, 460, 240, 26); ctx.fill();
            ctx.strokeStyle = '#e8c25a'; ctx.lineWidth = 6; roundRect(ctx, w / 2 - 230, 70, 460, 240, 26); ctx.stroke();
            if (logo) {
                const s0 = Math.min(400 / logo.width, 150 / logo.height);
                ctx.drawImage(logo, w / 2 - logo.width * s0 / 2, 86, logo.width * s0, logo.height * s0);
            } else {
                ctx.fillStyle = '#e10600'; ctx.font = `800 76px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
                ctx.fillText('ألعاب أيمن', w / 2, 160);
            }
            ctx.fillStyle = '#1a1a1a'; ctx.font = `700 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
            ctx.fillText('منصة التتويج', w / 2, 272);
            wallTex.needsUpdate = true;
        };
        drawWall(null);
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => drawWall(null));
        const im = new Image(); im.onload = () => drawWall(im); im.src = LOGO_URL;
        const wallMat = new T.MeshStandardMaterial({ map: wallTex, roughness: 0.6 });
        const wall = new T.Mesh(new T.BoxGeometry(9.2, 3.4, 0.25), [dark, dark, dark, dark, wallMat, dark]);
        wall.position.set(0, 0.15 + 1.7, WALL_Z); wall.castShadow = wall.receiveShadow = true; g.add(wall);
        const frame = new T.Mesh(new T.BoxGeometry(9.4, 0.1, 0.3), goldTrim); frame.position.set(0, 0.15 + 3.42, WALL_Z); g.add(frame);
        // لافتة فوق الجدار
        const bannerTex = canvasTex(1024, 150, (ctx, w, h) => {
            const gr = ctx.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, '#9b0400'); gr.addColorStop(0.5, '#e10600'); gr.addColorStop(1, '#9b0400');
            ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#ffd76a'; ctx.fillRect(0, 0, w, 7); ctx.fillRect(0, h - 7, w, 7);
            ctx.fillStyle = '#fff'; ctx.font = `800 62px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
            ctx.fillText('🏆 منصة تتويج ألعاب أيمن', w / 2, h / 2 + 4);
        });
        const red = new T.MeshStandardMaterial({ color: 0xe10600, roughness: 0.4 });
        const banner = new T.Mesh(new T.BoxGeometry(9.2, 1.25, 0.28), [red, red, red, red, new T.MeshBasicMaterial({ map: bannerTex }), red]);
        banner.position.set(0, 0.15 + 3.4 + 0.75, WALL_Z); banner.castShadow = true; g.add(banner);
        for (const x of [-4.75, 4.75]) { const post = new T.Mesh(new T.BoxGeometry(0.3, 5.1, 0.4), goldTrim); post.position.set(x, 2.55, WALL_Z); g.add(post); }
        // ممر السجاد الأحمر قدام المنصة
        const run = new T.Mesh(new T.PlaneGeometry(2.0, 7), carpet); run.rotation.x = -Math.PI / 2; run.position.set(0, 0.045, 1.8 + 3.5); run.receiveShadow = true; g.add(run);
        return g;
    }

    // قصاصات احتفال (InstancedMesh وحدة)
    const CONF_N = 240;
    let confetti = null;
    function makeConfetti() {
        const m = new T.InstancedMesh(new T.PlaneGeometry(0.09, 0.14), new T.MeshBasicMaterial({ side: T.DoubleSide }), CONF_N);
        const C = [0xe10600, 0xffd76a, 0x22d3ee, 0xf472b6, 0x4ade80, 0xffffff], col = new T.Color();
        const st = [];
        for (let i = 0; i < CONF_N; i++) { m.setColorAt(i, col.setHex(C[i % C.length])); st.push({ x: 0, y: -99, z: 0, vy: 0, rx: 0, ry: 0, s: 0 }); }
        m.frustumCulled = false; m.count = CONF_N;
        return { mesh: m, st };
    }
    const _m4 = new T.Matrix4(), _q4 = new T.Quaternion(), _p4 = new T.Vector3(), _s4 = new T.Vector3(1, 1, 1);
    function tickConfetti(dt, center, on) {
        if (!confetti) return;
        const { mesh, st } = confetti;
        for (let i = 0; i < CONF_N; i++) {
            const c = st[i];
            if (c.y < 0) { if (!on) { c.y = -99; } else { c.x = center.x + (Math.random() - 0.5) * 12; c.z = center.z + (Math.random() - 0.5) * 8; c.y = 7 + Math.random() * 6; c.vy = 1.2 + Math.random() * 1.6; c.s = Math.random() * 6; } }
            if (c.y > -50) { c.y -= c.vy * dt; c.s += dt * 4; }
            _q4.setFromEuler(_e.set(c.s, c.s * 0.7, c.s * 0.3));
            _p4.set(c.x + Math.sin(c.s) * 0.15, c.y, c.z);
            mesh.setMatrixAt(i, _m4.compose(_p4, _q4, _s4));
        }
        mesh.instanceMatrix.needsUpdate = true;
    }


    // ---- بدلة فورمولا للشخصية: نعيد تلوين الملابس بخامة الموديل بلون الفريق ----
    // الموديل جسم واحد بخامة وحدة (الجسم + اللبس + الشعر). نصنّف كل مثلث حسب العظمة اللي تحرّكه:
    // جذع/أذرع/أرجل = البدلة، اليدين = قفازات، القدمين = بوت سباق، الراس والرقبة (والشعر) ما تتغيّر.
    // التنورة (عظام ثانوية تحت الورك/الأرجل) تنشال عشان تصير بدلة كاملة.
    const SUIT_CACHE = {};
    function suitAnalysis(model, mesh) {
        if (SUIT_CACHE[model.kind]) return SUIT_CACHE[model.kind];
        const human = {}; for (const [hb, nm] of Object.entries(model.rawNames)) human[nm] = hb;
        const catOfHuman = hb => /head|neck|eye|jaw/i.test(hb) ? 0 : /Hand|Thumb|Index|Middle|Ring|Little/.test(hb) ? 2 : /Foot|Toes/.test(hb) ? 3 : /UpperLeg|LowerLeg/.test(hb) ? 4 : 1;
        // 0 راس (بدون تغيير) · 1 بدلة · 2 قفاز · 3 بوت · 4 بدلة الأرجل · 5 تنورة (تنشال)
        const boneCat = mesh.skeleton.bones.map(b => {
            let n = b, secondary = !human[b.name];
            while (n && !human[n.name]) n = n.parent;
            if (!n) return 0;
            const hb = human[n.name], c = catOfHuman(hb);
            if (secondary && (hb === 'hips' || /UpperLeg|LowerLeg/.test(hb))) return 5;
            return c;
        });
        const g = mesh.geometry, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, idx = g.index.array;
        const vCat = new Uint8Array(si.count);
        for (let v = 0; v < si.count; v++) {
            let best = 0, bw = -1;
            for (let k = 0; k < 4; k++) { const w = sw.getComponent(v, k); if (w > bw) { bw = w; best = si.getComponent(v, k); } }
            vCat[v] = boneCat[best] || 0;
        }
        const tri = new Uint8Array(idx.length / 3), keep = [];
        for (let t = 0; t < tri.length; t++) {
            const a = vCat[idx[t * 3]], b = vCat[idx[t * 3 + 1]], c = vCat[idx[t * 3 + 2]];
            const cat = (a === b || a === c) ? a : (b === c ? b : a);
            tri[t] = cat;
            if (cat !== 5) keep.push(idx[t * 3], idx[t * 3 + 1], idx[t * 3 + 2]);
        }
        const noSkirt = g.clone(); noSkirt.setIndex(keep);
        // مجموعات المواد (المادة الأساسية + الحدود) تغطي الفهرس كامل: نحدّث عددها بعد شيل التنورة
        if (noSkirt.groups.length) noSkirt.groups.forEach(gr => { gr.start = 0; gr.count = keep.length; });
        return (SUIT_CACHE[model.kind] = { tri, noSkirt, texByColor: {} });
    }
    function suitTexture(an, mesh, srcTex, color) {
        if (an.texByColor[color]) return an.texByColor[color];
        const img = srcTex.image, W = img.width, H = img.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
        // قناع: نرسم مثلثات كل فئة بإحداثيات الخامة
        const mk = document.createElement('canvas'); mk.width = W; mk.height = H;
        const mx = mk.getContext('2d');
        const uv = mesh.geometry.attributes.uv, idx = mesh.geometry.index.array;
        const FILL = ['', '#ff0000', '#00ff00', '#0000ff', '#ffff00'];
        for (let cat = 1; cat <= 4; cat++) {
            mx.fillStyle = mx.strokeStyle = FILL[cat]; mx.lineWidth = 2; mx.beginPath();
            for (let t = 0; t < an.tri.length; t++) {
                if (an.tri[t] !== cat) continue;
                for (let k = 0; k < 3; k++) { const v = idx[t * 3 + k], x = uv.getX(v) * W, y = uv.getY(v) * H; if (k) mx.lineTo(x, y); else mx.moveTo(x, y); }
                mx.closePath();
            }
            mx.fill(); mx.stroke();
        }
        const d = ctx.getImageData(0, 0, W, H), m = mx.getImageData(0, 0, W, H).data, px = d.data;
        const team = new T.Color(color), dark = team.clone().multiplyScalar(0.62), glove = new T.Color(0x22252c), boot = new T.Color(0x15171c);
        // بدلة بلونين: الجذع والأذرع بلون الفريق، والأرجل أغمق (مثل بدل الفورمولا)
        const TINT = [null, team, glove, boot, dark];
        // متوسط الإضاءة بكل فئة (نحافظ على الطيّات والتفاصيل كظل خفيف)
        const sum = [0, 0, 0, 0, 0], cnt = [0, 0, 0, 0, 0], catAt = new Uint8Array(W * H);
        for (let i = 0, p = 0; i < px.length; i += 4, p++) {
            const r = m[i], g2 = m[i + 1], b = m[i + 2]; if (m[i + 3] < 128) continue;
            const c = r > 128 && g2 > 128 ? 4 : r > 128 ? 1 : g2 > 128 ? 2 : b > 128 ? 3 : 0;
            if (!c) continue; catAt[p] = c;
            const L = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255; sum[c] += L; cnt[c]++;
        }
        for (let i = 0, p = 0; i < px.length; i += 4, p++) {
            const c = catAt[p]; if (!c) continue;
            const L = (0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) / 255, avg = cnt[c] ? sum[c] / cnt[c] : 0.5;
            const sh = Math.max(0.68, Math.min(1.12, 0.92 + (L - avg) * 0.55));
            const col = TINT[c];
            px[i] = Math.min(255, col.r ** (1 / 2.2) * 255 * sh); px[i + 1] = Math.min(255, col.g ** (1 / 2.2) * 255 * sh); px[i + 2] = Math.min(255, col.b ** (1 / 2.2) * 255 * sh);
        }
        ctx.putImageData(d, 0, 0);
        const tex = new T.CanvasTexture(cv);
        tex.flipY = srcTex.flipY; tex.colorSpace = srcTex.colorSpace; tex.wrapS = srcTex.wrapS; tex.wrapT = srcTex.wrapT; tex.anisotropy = 4;
        return (an.texByColor[color] = tex);
    }
    let _patchTex = null;
    function patchTexture() {
        return _patchTex || (_patchTex = canvasTex(256, 84, (ctx, w, h) => {
            ctx.fillStyle = '#ffffff'; roundRect(ctx, 2, 2, w - 4, h - 4, 14); ctx.fill();
            ctx.fillStyle = '#e10600'; ctx.font = `800 40px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.direction = 'rtl';
            ctx.fillText('ألعاب أيمن', w / 2, h / 2 + 2);
        }));
    }
    function dressRacingSuit(rig, model, color) {
        try {
            // الجسم ممكن تكون مادته وحدة أو مصفوفة (الولد فيه مادة حدود Outline إضافية)
            let mesh = null;
            rig.root.traverse(o => { if (!mesh && o.isSkinnedMesh && (o.name === 'Body' || [].concat(o.material).some(m => /Body/i.test(m.name || '')))) mesh = o; });
            const mats = mesh ? [].concat(mesh.material) : [];
            const main = mats.find(m => m.map && m.map.image);
            if (!mesh || !main) return false;
            const an = suitAnalysis(model, mesh);
            const tex = suitTexture(an, mesh, main.map, color);
            const cloned = mats.map(m => { const c = m.clone(); if (c.map) c.map = tex; if ('shadeMultiplyTexture' in c && c.shadeMultiplyTexture) c.shadeMultiplyTexture = tex; return c; });
            mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0];
            mesh.geometry = an.noSkirt;
            rig.__suitMats = cloned;
            // رقعة الراعي على الصدر
            const chest = rig.bones.Spine2 || rig.bones.Spine1;
            if (chest) {
                const patch = new T.Mesh(new T.PlaneGeometry(0.17, 0.055), new T.MeshBasicMaterial({ map: patchTexture(), transparent: true }));
                patch.position.set(0, 0.075, 0.13); patch.rotation.x = -0.12; chest.add(patch); rig.__patch = patch;
            }
            return true;
        } catch (e) { logLine('formula-race: racing suit failed', e); return false; }
    }


    let cer = null;
    const D_CAR = 22, D_CHAR = 27, D_POD = 33, CAR_LANE = [0, -4.5, 4.5];
    /** يبدأ المراسم. list: [{id, name, color, character}] بالترتيب (الأول، الثاني، الثالث). */
    function ceremony(list, cb = {}) {
        if (!VRM || !vrmModels || cer) return false;
        const top = list.slice(0, 3).filter(c => cars.has(c.id));
        if (!top.length) return false;
        const group = new T.Group(); scene.add(group);
        const pb = trackPoint(D_POD, 0);
        const podium = buildPodium(); podium.position.set(pb.x, 0, pb.z); podium.rotation.y = pb.heading; podium.scale.set(1, 0.001, 1); podium.visible = false; group.add(podium);
        const ids = new Set(top.map(c => c.id));
        for (const [id, o] of cars) o.group.visible = ids.has(id);
        const chars = top.map((c, i) => {
            const o = cars.get(c.id), cp = trackPoint(D_CAR, CAR_LANE[i]);
            o.group.position.set(cp.x, 0, cp.z); o.group.rotation.y = cp.heading;
            o.pin.visible = o.tag.visible = o.flame.visible = o.ring.visible = o.dome.visible = false; o.helmet.visible = false;
            const kind = c.character === 'boy' ? 'boy' : c.character === 'girl' ? 'girl' : (hashId(c.id) % 2 ? 'boy' : 'girl');
            const rig = VRM.makeVrmRig(vrmModels[kind], { n: i + 1 });
            dressRacingSuit(rig, vrmModels[kind], c.color);
            const p = trackPoint(D_CHAR, CAR_LANE[i]);
            rig.root.position.set(p.x, 0, p.z); rig.root.rotation.y = p.heading;
            rig.root.traverse(m => { if (m.isMesh) m.castShadow = true; });
            group.add(rig.root);
            rig.play(i === 0 ? 'win' : i === 1 ? 9 : 10); rig.mood('laugh');
            const tag = makeNameTag({ name: (i + 1) + ' · ' + c.name, color: c.color }); tag.visible = true; tag.scale.set(1.9, 1.9 * 112 / 512, 1); tag.position.y = 2.0; rig.root.add(tag);
            return { c, rig, i, tag, ry: p.heading, state: 'show', from: null, to: null, walkT: 0, hopT: 0 };
        });
        confetti = confetti || makeConfetti(); group.add(confetti.mesh);
        cer = { t: 0, chars, group, podium, pb, cb, stage: 'show', camSeg: '', landed: 0 };
        if (cb.onStage) cb.onStage('show');
        return true;
    }
    function stopCeremony() {
        if (!cer) return;
        cer.chars.forEach(ch => { ch.tag.material.map.dispose(); ch.tag.material.dispose(); if (ch.rig.__suitMats) ch.rig.__suitMats.forEach(m => m.dispose()); if (ch.rig.__patch) { ch.rig.__patch.geometry.dispose(); ch.rig.__patch.material.dispose(); } ch.rig.dispose(); });
        cer.group.traverse(o => { if (o === confetti?.mesh) return; if (o.isMesh) { o.geometry.dispose(); [].concat(o.material).forEach(m => { if (m.map) m.map.dispose(); m.dispose(); }); } });
        if (confetti) cer.group.remove(confetti.mesh);
        tickConfetti(0, new T.Vector3(), false);
        scene.remove(cer.group);
        for (const [, o] of cars) { o.group.visible = true; o.helmet.visible = true; }
        cer = null;
    }
    function tickCeremony(dt) {
        cer.t += dt;
        const t = cer.t;
        // المنصة تطلع من الأرض بعد الاستعراض
        if (t >= 15 && cer.stage === 'show') {
            cer.stage = 'walk'; cer.podium.visible = true;
            cer.chars.forEach(ch => {
                ch.state = 'wait'; ch.walkT = -ch.i * 0.3;
                // يلفّون من جنب جدار الرعاة ويطلعون الدرجة من قدّام
                const side = ch.i === 2 ? 1 : -1, P0 = (d, lane) => { const q = trackPoint(d, lane); return new T.Vector3(q.x, 0, q.z); };
                ch.path = [P0(D_POD - 3.0, side * 6.0), P0(D_POD + 2.9, side * 6.0), P0(D_POD + 2.0, STEP_LANE[ch.i])];
                ch.to = ch.path[ch.path.length - 1];
                ch.tag.visible = false;
            });
            if (cer.cb.onStage) cer.cb.onStage('walk');
        }
        if (cer.stage !== 'show') { const k = easeIO((t - 15) / 1.2); cer.podium.scale.set(1, Math.max(0.001, k), 1); }
        for (const ch of cer.chars) {
            const { rig } = ch;
            if (ch.state === 'wait' || ch.state === 'walk') {
                ch.walkT += dt;
                if (ch.walkT > 0.9) {
                    if (ch.state === 'wait') { ch.state = 'walk'; rig.play(1); rig.setSpeed(2.5); rig.mood('smile'); }
                    const goal = ch.path[0], dir = goal.clone().sub(rig.root.position); dir.y = 0;
                    const dist = dir.length(), stepLen = 2.5 * dt;
                    if (dist <= stepLen) {
                        rig.root.position.copy(goal); ch.path.shift();
                        if (!ch.path.length) { ch.state = 'hop'; ch.hopT = 0; rig.play(0); }
                    } else {
                        rig.root.position.addScaledVector(dir.normalize(), stepLen);
                        let dh = Math.atan2(dir.x, dir.z) - rig.root.rotation.y; while (dh > Math.PI) dh -= 2 * Math.PI; while (dh < -Math.PI) dh += 2 * Math.PI;
                        rig.root.rotation.y += dh * (1 - Math.exp(-dt * 10));
                    }
                }
            } else if (ch.state === 'hop') {
                // قفزة على درجته
                ch.hopT += dt / 0.5;
                const k = Math.min(1, ch.hopT), top = trackPoint(D_POD, STEP_LANE[ch.i]);
                const y = 0.15 + STEP_H[ch.i];
                rig.root.position.set(ch.to.x + (top.x - ch.to.x) * k, y * k + Math.sin(k * Math.PI) * 0.6, ch.to.z + (top.z - ch.to.z) * k);
                rig.root.rotation.y = ch.ry;
                if (k >= 1) {
                    ch.state = 'podium'; cer.landed++;
                    const chest = rig.bones.Spine2 || rig.bones.Spine1 || rig.bones.Spine;
                    if (chest) { ch.medal = makeMedal(ch.i); chest.add(ch.medal); }
                    if (ch.i === 0 && rig.bones.RightHand) { ch.trophy = makeTrophy(); ch.trophy.rotation.z = Math.PI / 2; ch.trophy.position.set(-0.09, 0, 0.03); rig.bones.RightHand.add(ch.trophy); }
                    rig.play(ch.i === 0 ? 6 : ch.i === 1 ? 4 : 3); rig.mood('laugh');
                    burstAt(rig.root.position.clone().setY(y + 1.6), MEDAL[ch.i], 30);
                    if (cer.landed === cer.chars.length) { cer.stage = 'podium'; cer.podiumAt = t; if (cer.cb.onStage) cer.cb.onStage('podium'); }
                }
            }
            rig.update(dt);
            if (ch.state === 'podium') {
                rig.root.updateMatrixWorld(true);
                if (ch.i === 0) {
                    // الأول يرفع الكاس ويهزّه مع الاحتفال، واليد الثانية قبضة لفوق
                    const pump = Math.sin(t * 5) * 0.12;
                    aimBone(rig, ch.ry, 'RightArm', -0.25, 1, 0.12); rig.root.updateMatrixWorld(true);
                    aimBone(rig, ch.ry, 'RightForeArm', -0.08 + pump * 0.3, 1, 0.12 + pump);
                    aimBone(rig, ch.ry, 'LeftArm', 0.5, 0.75, 0.25); rig.root.updateMatrixWorld(true);
                    aimBone(rig, ch.ry, 'LeftForeArm', 0.15, 1, 0.2);
                    rig.gesture('Left', 'rock');
                }
            }
            rig.sync();
        }
        // ألعاب نارية وقصاصات على المنصة
        if (cer.stage === 'podium') {
            const u = t - cer.podiumAt;
            if (Math.floor(u / 1.1) !== Math.floor((u - dt) / 1.1)) {
                const side = (Math.floor(u / 1.1) % 3) - 1, p = trackPoint(D_POD - 3, side * 4);
                burstAt(new T.Vector3(p.x, 8 + Math.random() * 3, p.z), [0xffd76a, 0xe10600, 0x22d3ee, 0xf472b6][Math.floor(u) % 4], 26);
            }
        }
        tickConfetti(dt, cer.pb, cer.stage === 'podium');
    }
    // الكاميرا: لقطة واسعة ← قريبة على الثالث ← الثاني ← الأول ← واسعة · بعدها المنصة
    function ceremonyCamera(dt) {
        const t = cer.t, P = (d, lane, y) => { const q = trackPoint(d, lane); return new T.Vector3(q.x, y, q.z); };
        let seg, pos, look, fov = 48;
        const headOf = i => { const ch = cer.chars[i] || cer.chars[0]; return ch.rig.root.position.clone().setY(ch.rig.root.position.y + 1.4); };
        if (t < 15) {
            if (t < 4 || !cer.chars[1]) { seg = 'wide'; pos = P(D_CHAR + 11 - t * 0.5, Math.sin(t * 0.4) * 3, 2.6); look = P(D_CHAR - 1, 0, 1.1); }
            else if (t < 7 && cer.chars[2]) { seg = 'c3'; const h = headOf(2); pos = P(D_CHAR + 3.6 - (t - 4) * 0.25, CAR_LANE[2] + 0.8, 1.55); look = h; fov = 40; }
            else if (t < 10 && cer.chars[1]) { seg = 'c2'; const h = headOf(1); pos = P(D_CHAR + 3.6 - (t - 7) * 0.25, CAR_LANE[1] - 0.8, 1.55); look = h; fov = 40; }
            else if (t < 13) { seg = 'c1'; const h = headOf(0); pos = P(D_CHAR + 3.4 - (t - 10) * 0.25, 0.6, 1.5); look = h; fov = 40; }
            else { seg = 'wide2'; pos = P(D_CHAR + 14 + (t - 13) * 1.2, 0, 4 + (t - 13) * 0.4); look = P(D_CHAR - 2, 0, 1.2); }
        } else {
            const u = cer.stage === 'podium' ? t - cer.podiumAt : -1;
            if (u < 0 || u > 11) {
                seg = 'pod'; const a = Math.sin(t * 0.25) * 0.35;
                const c = cer.pb, f = new T.Vector3(Math.sin(c.heading + a), 0, Math.cos(c.heading + a));
                pos = new T.Vector3(c.x, 4.2, c.z).addScaledVector(f, 13); look = new T.Vector3(c.x, 2.2, c.z);
            } else if (u < 5.5) {
                seg = 'pod1'; const h = headOf(0);
                pos = P(D_POD + 4.4, 0.6 + Math.sin(u * 0.5) * 0.4, h.y + 0.4); look = h.clone().setY(h.y + 0.35); fov = 44;
            } else {
                seg = 'podw'; pos = P(D_POD + 9, -2 + (u - 5.5) * 0.7, 3.4); look = P(D_POD, 0, 2.1); fov = 46;
            }
        }
        const cut = seg !== cer.camSeg; cer.camSeg = seg;
        if (cut) { camPos.copy(pos); camLook.copy(look); camFov = fov; }
        else { const k = 1 - Math.exp(-dt * 3); camPos.lerp(pos, k); camLook.lerp(look, k); camFov += (fov - camFov) * k; }
        scene.fog.near = 400; scene.fog.far = fogFar;
        if (camera.near !== 0.1) { camera.near = 0.1; camera.updateProjectionMatrix(); }
        camera.position.copy(camPos); camera.lookAt(camLook);
        if (Math.abs(camera.fov - camFov) > 0.01) { camera.fov = camFov; camera.updateProjectionMatrix(); }
        const c = cer.pb; sun.target.position.set(c.x, 0, c.z); sun.position.set(c.x + 60, 120, c.z + 40);
    }
    function burstAt(pos, color, n) {
        for (let i = 0; i < n; i++) {
            const p = parts[partIdx++ % parts.length];
            p.s.visible = true; p.s.material.color.set(color);
            p.s.position.copy(pos).add(tmp.set((Math.random() - 0.5) * 1.2, Math.random() * 0.6, (Math.random() - 0.5) * 1.2));
            p.v.set((Math.random() - 0.5) * 10, 2 + Math.random() * 7, (Math.random() - 0.5) * 10);
            p.life = 0; p.max = 0.8 + Math.random() * 0.8; p.s.scale.setScalar(1.1);
        }
    }

    // ---- الحلقة ----
    const clock = new T.Clock();
    let raf = 0, running = true;
    function loop() {
        if (!running) return;
        raf = requestAnimationFrame(loop);
        const dt = Math.min(clock.getDelta(), 0.05);
        if (cer) { tickCeremony(dt); tickParts(dt); ceremonyCamera(dt); }
        else { applyStates(dt); tickParts(dt); camera_(dt); }
        r.render(scene, camera);
    }
    loop();
    const ro = new ResizeObserver(() => { r.setSize(W(), H(), false); camera.aspect = W() / H(); camera.updateProjectionMatrix(); });
    ro.observe(el);
    const onVis = () => { if (document.hidden) { running = false; cancelAnimationFrame(raf); } else if (!running) { running = true; clock.getDelta(); loop(); } };
    document.addEventListener('visibilitychange', onVis);

    return {
        setCars, update, burst, setLights, setQuality, ceremony, stopCeremony,
        get ceremonyOn() { return !!cer; },
        setCamera(mode, id) { camMode = phase === 'finish' ? 'orbit' : mode; if (id) focusId = id; },
        setPhase(p) { phase = p; if (p === 'race') preloadCharacters(); },
        stop() {
            stopCeremony();
            running = false; cancelAnimationFrame(raf); ro.disconnect();
            document.removeEventListener('visibilitychange', onVis);
            scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); });
            r.dispose(); r.domElement.remove();
        }
    };
}
