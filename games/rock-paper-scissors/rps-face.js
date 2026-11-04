/**
 * «حجرة ورقة مقص» — ملامح الأولاد (بهاللعبة بس، بدون تعديل games/birthday-party/rig3d.js).
 *
 * ملامح كرتونية ناعمة: عيون كبيرة بنية بلمعتين ورمش علوي، حواجب عريضة بلون الشعر،
 * خشم صغير بظل خفيف، ابتسامة عريضة تبين الأسنان، خدود وردية، وأذنين.
 *
 * applyBoyFace(rig, {SKIN, HAIR}) ← { update(dt, mood), dispose() } أو null لو الشخصية بنت.
 *   mood: 'smile' (الافتراضي) · 'laugh' (فوز/رقص) · 'scared' (وقت الإقصاء) · 'focus' (الاختيار والعد) · 'sad' (خسر محاولة)
 *   الوجه يتبدّل كل إطار بعد rig.update (الشخصية نفسها ترسم وجهها القديم وإحنا نغطيه).
 * الخريطة نفس تقسيم وجه الحفلة: 512×256 تلف الراس كامل، ونص الوجه عند x=128.
 */
import * as THREE from 'three';

const T = THREE, TAU = Math.PI * 2;
const cache = new Map();

function faceTex(skin, hair, kind) {
    const key = skin + hair + kind; if (cache.has(key)) return cache.get(key);
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
    const cx = 128, cy = 132, sk = new T.Color(skin), shade = sk.clone().multiplyScalar(.82).getStyle(), brow = new T.Color(hair).multiplyScalar(.85).getStyle();
    // الملامح أكبر بكثير من وجه الحفلة (عيون وحواجب وفم واضحة من بعيد مثل المرجع)
    g.save(); g.translate(cx, cy); g.scale(1.72, 1.58); g.translate(-cx, -cy);

    // خدود وردية ناعمة
    for (const sx of [-1, 1]) { const gr = g.createRadialGradient(cx + sx * 31, cy + 18, 0, cx + sx * 31, cy + 18, 15); gr.addColorStop(0, 'rgba(236,120,110,.32)'); gr.addColorStop(1, 'rgba(236,120,110,0)'); g.fillStyle = gr; g.fillRect(cx + sx * 31 - 16, cy + 2, 32, 32); }

    // الحواجب: عريضة ومقوسة شوي. الخوف: لفوق · التركيز: مقطّبة (الداخل ينزل) · الزعل: الداخل يرتفع
    const focus = kind === 'focus', sad = kind === 'sad';
    const by = kind === 'scared' ? -27 : focus ? -21 : sad ? -24 : -23;
    for (const sx of [-1, 1]) {
        g.save(); g.translate(cx + sx * 21, cy + by); g.scale(sx, 1); g.rotate(kind === 'scared' ? .18 : focus ? -.3 : sad ? .3 : -.06); // + الداخل لفوق، − الداخل لتحت
        g.fillStyle = brow; g.beginPath(); g.moveTo(-11, 2.5); g.quadraticCurveTo(-2, -4.5, 11, -1.5); g.lineTo(11, 2.5); g.quadraticCurveTo(-1, -.5, -11, 5.5); g.closePath(); g.fill();
        g.restore();
    }

    // العيون
    for (const sx of [-1, 1]) {
        const ex = cx + sx * 20, ey = cy - 5;
        if (kind === 'blink' || kind === 'laugh') {
            // مغمضة: قوس (الضحكة قوس لفوق ^^)
            g.strokeStyle = '#2a1810'; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath();
            if (kind === 'laugh') g.arc(ex, ey + 5, 8.5, Math.PI * 1.15, Math.PI * 1.85); else g.arc(ex, ey - 2, 9, Math.PI * .15, Math.PI * .85);
            g.stroke(); continue;
        }
        const big = kind === 'scared' ? 1.12 : 1;
        g.fillStyle = '#fbf8f4'; g.beginPath(); g.ellipse(ex, ey, 9.5 * big, 10.5 * big, 0, 0, TAU); g.fill();
        const ir = g.createRadialGradient(ex - 1, ey - 2, 1, ex, ey + 1, 8.5);
        ir.addColorStop(0, '#8a5634'); ir.addColorStop(.7, '#5a331d'); ir.addColorStop(1, '#3b2112');
        g.fillStyle = ir; g.beginPath(); g.arc(ex, ey + 1, (kind === 'scared' ? 6 : 8) * big, 0, TAU); g.fill();
        g.fillStyle = '#140a05'; g.beginPath(); g.arc(ex, ey + 1, (kind === 'scared' ? 2.6 : 4.2), 0, TAU); g.fill();
        // ضوء تحت القزحية (عمق)
        const gl = g.createRadialGradient(ex, ey + 6, 0, ex, ey + 6, 6); gl.addColorStop(0, 'rgba(255,225,180,.4)'); gl.addColorStop(1, 'rgba(255,225,180,0)'); g.fillStyle = gl; g.beginPath(); g.arc(ex, ey + 1, 8 * big, 0, TAU); g.fill();
        // التركيز/الزعل: الجفن العلوي نازل
        const top = focus ? .3 : sad ? .14 : 0;
        if (top) { g.save(); g.beginPath(); g.ellipse(ex, ey, 9.5, 10.5, 0, 0, TAU); g.clip(); g.fillStyle = skin; g.fillRect(ex - 10, ey - 10.5, 20, 21 * top); g.restore(); }
        // لمعتين
        g.fillStyle = '#ffffff'; g.beginPath(); g.arc(ex - 3, ey - 3 + top * 8, 2.6, 0, TAU); g.fill();
        g.beginPath(); g.arc(ex + 2.6, ey + 3.4, 1.2, 0, TAU); g.fill();
        // الرمش العلوي (خط غامق سميك) وظل الجفن
        g.strokeStyle = '#24140c'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath();
        if (top) { const ly = ey - 10.5 + 21 * top; g.moveTo(ex - 9.5, ly + 1.5); g.quadraticCurveTo(ex, ly - 1.5, ex + 9.5, ly + 1.5); } else g.ellipse(ex, ey, 9.8 * big, 10.8 * big, 0, Math.PI * 1.08, Math.PI * 1.92);
        g.stroke();
        g.strokeStyle = shade; g.lineWidth = 1.4; g.beginPath(); g.ellipse(ex, ey - 2.5, 11 * big, 11.5 * big, 0, Math.PI * 1.2, Math.PI * 1.8); g.stroke();
    }

    // الخشم: ظل ناعم صغير
    g.strokeStyle = 'rgba(150,80,60,.38)'; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy + 9, 3.5, Math.PI * .25, Math.PI * .75); g.stroke();
    g.fillStyle = 'rgba(150,80,60,.12)'; g.beginPath(); g.ellipse(cx + 2.5, cy + 6, 2, 4, 0, 0, TAU); g.fill();

    // الفم
    const my = cy + 21;
    if (kind === 'scared') {
        g.fillStyle = '#6e2630'; g.beginPath(); g.ellipse(cx, my + 3, 5, 6.5, 0, 0, TAU); g.fill();
    } else if (sad) {
        g.strokeStyle = '#7d2c36'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 9, my + 6); g.quadraticCurveTo(cx, my - 1, cx + 9, my + 6); g.stroke();
    } else if (focus) {
        // ابتسامة جانبية واثقة
        g.strokeStyle = '#7d2c36'; g.lineWidth = 2.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - 9, my + 2); g.quadraticCurveTo(cx + 2, my + 6, cx + 11, my - 2); g.stroke();
    } else {
        const w = kind === 'laugh' ? 17 : 15.5, d = kind === 'laugh' ? 13 : 9.5;
        g.fillStyle = '#7d2c36'; g.beginPath(); g.moveTo(cx - w, my); g.quadraticCurveTo(cx, my + d * 1.9, cx + w, my); g.quadraticCurveTo(cx, my + 2, cx - w, my); g.closePath(); g.fill();
        // الأسنان العلوية
        g.save(); g.clip(); g.fillStyle = '#fbfaf6'; g.fillRect(cx - w, my - 1, w * 2, d * .55); g.restore();
        if (kind === 'laugh') { g.fillStyle = '#d9606a'; g.beginPath(); g.ellipse(cx, my + d * .95, w * .45, d * .3, 0, 0, TAU); g.fill(); }
        g.strokeStyle = 'rgba(110,40,40,.55)'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(cx - w - 1.5, my - .5); g.quadraticCurveTo(cx, my + d * 1.9 + 1, cx + w + 1.5, my - .5); g.stroke();
    }

    g.restore();
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; cache.set(key, t); return t;
}

export function applyBoyFace(rig, { SKIN, HAIR }) {
    const L = rig.look || {};
    if (L.g !== 1) return null;
    const head = rig.bones.Head, headMesh = head.children.find(o => o.isMesh && o.geometry && o.geometry.type === 'SphereGeometry');
    if (!headMesh) return null;
    const skin = SKIN[L.s] || SKIN[1], hair = HAIR[L.h] || HAIR[0];
    // الأذنين (إلا مع الشماغ/الغترة أو السماعات اللي تغطيها)
    let ears = null;
    if (L.acc !== 1 && L.acc !== 2 && L.acc !== 5) {
        ears = new T.Group();
        const m = new T.MeshStandardMaterial({ color: skin, roughness: .6 }), inner = new T.MeshStandardMaterial({ color: new T.Color(skin).multiplyScalar(.85), roughness: .7 });
        for (const sx of [1, -1]) {
            const e = new T.Mesh(new T.SphereGeometry(.042, 16, 12), m); e.scale.set(.42, 1, .78);
            e.position.set(sx * .158, .135, -.005); e.rotation.y = sx * .35; ears.add(e);
            const ein = new T.Mesh(new T.SphereGeometry(.026, 12, 10), inner); ein.scale.set(.3, .9, .7); ein.position.set(sx * .17, .135, .004); ein.rotation.y = sx * .35; ears.add(ein);
        }
        head.add(ears);
    }
    let blinkT = 1.5 + Math.random() * 3, blinking = 0;
    return {
        update(dt, mood) {
            blinkT -= dt; if (blinkT < 0) { blinking = .13; blinkT = 2.6 + Math.random() * 2.6; }
            if (blinking > 0) blinking -= dt;
            const kind = mood === 'laugh' || mood === 'scared' || mood === 'blink' ? mood : blinking > 0 ? 'blink' : mood === 'focus' || mood === 'sad' ? mood : 'smile';
            const tex = faceTex(skin, hair, kind);
            if (headMesh.material.map !== tex) { const first = !headMesh.material.map; headMesh.material.map = tex; if (first) headMesh.material.needsUpdate = true; }
        },
        dispose() { if (ears) { ears.removeFromParent(); ears.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); } },
    };
}
