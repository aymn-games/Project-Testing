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
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

// صور بروفايل اللاعبين للافتات (Data URL من الخادم بس، عشان الكانفس ما ينقفل بسبب صور من دومين ثاني)
const PHOTO_IMG = new Map();
function photoImg(src) {
    if (!src || src.slice(0, 5) !== 'data:') return null;
    let im = PHOTO_IMG.get(src);
    if (!im) { im = new Image(); im.onload = () => { im._ok = true; }; im.src = src; PHOTO_IMG.set(src, im); if (PHOTO_IMG.size > 400) PHOTO_IMG.delete(PHOTO_IMG.keys().next().value); }
    return im._ok ? im : null;
}
function drawTag(sp, o) {
    const ph = photoImg(o.photo);
    const key = JSON.stringify([o.name, o.num, o.dead, o.role, o.team, o.ring, ph ? o.photo.length : 0]); if (sp.userData.key === key) return; sp.userData.key = key;
    const { c, tex } = sp.userData, ctx = c.getContext('2d'), W = c.width, H = c.height;
    ctx.clearRect(0, 0, W, H);
    ctx.font = '800 50px ' + FONT; ctx.direction = 'rtl';
    const name = o.name.length > 14 ? o.name.slice(0, 13) + '…' : o.name;
    const PW = ph ? 78 : 0;   // مكان الصورة على يمين الاسم
    const tw = Math.min(330 - PW, ctx.measureText(name).width), bw = tw + 120 + PW, x = (W - bw) / 2, y = 14, h = 72;
    ctx.globalAlpha = o.dead ? 0.6 : 1;
    roundRect(ctx, x, y, bw, h, 36); ctx.fillStyle = 'rgba(20,22,40,.82)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = o.ring || 'rgba(255,255,255,.18)'; ctx.stroke();
    // دائرة الرقم (يسار الاسم مثل لافتات البث)
    ctx.beginPath(); ctx.arc(x + 40, y + h / 2, 26, 0, TAU); ctx.fillStyle = o.dead ? '#555a6b' : '#5b54d6'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '900 32px ' + FONT;
    ctx.fillText(o.dead ? '✕' : String(o.num), x + 40, y + h / 2 + 2);
    ctx.font = '800 46px ' + FONT; ctx.textAlign = 'right'; ctx.fillStyle = '#fff';
    if (ph) {
        const cx = x + bw - 40, cy = y + h / 2, r = 30;
        ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.closePath(); ctx.clip();
        if (o.dead) ctx.filter = 'grayscale(1)';
        ctx.drawImage(ph, cx - r, cy - r, r * 2, r * 2); ctx.restore();
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.stroke();
    }
    ctx.fillText(name, x + bw - 22 - PW, y + h / 2 + 3, tw);
    if (o.role || o.team) {
        // الدور كامل لو مكشوف، وإلا الفريق بس (المطرود حسب القواعد)
        const R = o.role ? L.ROLE[o.role] : o.team === 'mafia' ? { icon: '🔪', n: 'مافيا', c: '#e2483d' } : { icon: '🏠', n: 'مواطن', c: '#2f7de1' };
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
const CHAR_K = 0.55;   // مقياس الشخصية بالساحة (طولها كامل ~3.9 وحدة ← ~2.1 بالساحة)
const SIT_Y = 0.3 - 0.78 * CHAR_K;   // الجسم وهو جالس: الحوض (0.78) يركب على الكرسي (ارتفاعه 0.3) والجزمة على الأرض
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
    stool: new THREE.CylinderGeometry(0.3, 0.26, 0.3, 18)
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
 * الشخصية (تصميم صاحب المنصة — مقاساتها من صورة التصميم، الوحدة = طول الرجل من الحوض للأرض ÷ 0.78):
 *   رأس كبير (نص طول الشخصية تقريباً) مكعّب بحواف مدوّرة جالس على الصدر بدون رقبة، ووجه مسطّح فيه
 *   عيون سودا بيضاوية بلمعة بيضاء فوق يمين، وخدود وردية على حافة الوجه، وفم صغير؛ شعر قطعة وحدة
 *   (طاقية + غُرّة مستقيمة + جوانب سميكة)؛ صدر أسطواني بلون القميص وزر أصفر كبير وياقة صفرا وحاشية أغمق؛
 *   حزام رفيع وتنورة عريضة (تسريحات البنات) أو شورت؛ أكمام بيضاء طويلة بأساور صفرا؛ رجول قصيرة سميكة
 *   بجوارب بيضاء طويلة وجزمة سودا كبيرة مقدمتها ونعلها بيض.
 * opts.outfit = 'doctor'|'detective'|'shadow' للشخصيات الخاصة. opts.lite = الحلقات البعيدة (مثلثات أقل).
 * يرجع {root, body, head, armL, armR, legs, eyes, mats, torso, sit(bool)} — root أصله عند الأرض.
 */
const HEAD_W = 1.86, HEAD_H = 1.88, HEAD_D = 1.5;   // الرأس: بيضاوي مدوّر (أنصاف أقطاره HEAD_*/2)
const HR = { x: HEAD_W / 2, y: HEAD_H / 2, z: HEAD_D / 2 };
/** نقطة على سطح الوجه (x,y من مركز الرأس) — للعيون والخدود والفم على الرأس المدوّر */
/** يدوّر قطعة على الوجه عشان تلصق على سطح الرأس المدوّر (باتجاه العمودي على السطح) */
function onFace(o) { const p = o.position, nx = p.x / HR.x ** 2, ny = p.y / HR.y ** 2, nz = p.z / HR.z ** 2; o.rotation.set(-Math.atan2(ny, nz), Math.atan2(nx, nz), 0, 'YXZ'); return o; }
function faceZ(x, y, out) { const k = 1 - (x / HR.x) ** 2 - (y / HR.y) ** 2; return HR.z * Math.sqrt(Math.max(0.02, k)) + (out || 0); }
const BANG_Y = 0.36;   // خط الغُرّة المستقيم (فوق العيون، من مركز الرأس)
const HAIR_CUT = Math.acos(BANG_Y / (HR.y + 0.08));   // زاوية قص قشرة الشعر عند خط الغُرّة
/** أسطوانة بحواف مدوّرة (بدل الحواف الحادة): مقطع جانبي فيه ربع دائرة عند كل حافة، ملفوف حول المحور */
function roundCyl(rTop, rBot, h, bevel, seg) {
    const b = Math.min(bevel, h / 2 - 0.001, rTop - 0.001, rBot - 0.001), pts = [], Q = 5;
    pts.push(new THREE.Vector2(0.0001, -h / 2));
    for (let i = 0; i <= Q; i++) { const a = -Math.PI / 2 + (i / Q) * Math.PI / 2; pts.push(new THREE.Vector2(rBot - b + Math.cos(a) * b, -h / 2 + b + Math.sin(a) * b)); }
    for (let i = 0; i <= Q; i++) { const a = (i / Q) * Math.PI / 2; pts.push(new THREE.Vector2(rTop - b + Math.cos(a) * b, h / 2 - b + Math.sin(a) * b)); }
    pts.push(new THREE.Vector2(0.0001, h / 2));
    return new THREE.LatheGeometry(pts, seg || 24);
}
const CHAR_GEO = {};
function charGeo(lo) {
    const k = lo ? 'lo' : 'hi';
    if (CHAR_GEO[k]) return CHAR_GEO[k];
    const s = lo ? 1 : 3, r = lo ? 8 : 18;
    CHAR_GEO[k] = {
        head: new THREE.SphereGeometry(1, r * 2, r + 4),
        eye: new THREE.SphereGeometry(0.145, r + 8, r + 4),
        shine: new THREE.SphereGeometry(0.045, 12, 10),
        cheek: new THREE.SphereGeometry(0.1, r + 8, r + 4),
        hairTop: new RoundedBoxGeometry(HEAD_W + 0.5, 0.78, HEAD_D + 0.14, s + 2, 0.3),
        // الشعر قشرة بيضاوية فوق الرأس: الجزء اللي فوق خط الغُرّة كامل، والخلف ينزل تحت
        hairCap: new THREE.SphereGeometry(1, lo ? 16 : 30, lo ? 8 : 14, 0, TAU, 0, HAIR_CUT),
        hairBack: (to) => new THREE.SphereGeometry(1, r * 2, r + 4, Math.PI, Math.PI, HAIR_CUT - 0.02, to - HAIR_CUT + 0.02),
        bangs: new RoundedBoxGeometry(HEAD_W + 0.08, 0.55, 0.12, s, 0.05),
        side: (h) => new RoundedBoxGeometry(0.4, h, HEAD_D * 0.78, s + 1, 0.18),
        back: (h) => new RoundedBoxGeometry(HEAD_W + 0.2, h, 0.3, s, 0.12),
        torso: roundCyl(0.42, 0.43, 0.71, 0.1, r + 8),
        hem: roundCyl(0.445, 0.445, 0.1, 0.045, r + 8),
        band: roundCyl(0.45, 0.45, 0.2, 0.06, r + 8),
        ruff: roundCyl(0.33, 0.39, 0.1, 0.045, r + 8),
        bow: new RoundedBoxGeometry(0.2, 0.07, 0.05, 1, 0.02),
        puff: new THREE.SphereGeometry(0.2, r, r - 4),
        forearm: roundCyl(0.12, 0.13, 0.5, 0.06, r),
        collar: new THREE.TorusGeometry(0.32, 0.055, 6, r + 6),
        button: new THREE.SphereGeometry(0.14, r, r - 4),
        belt: roundCyl(0.445, 0.445, 0.08, 0.035, r + 8),
        skirt: roundCyl(0.43, 0.65, 0.47, 0.07, r + 8),
        shorts: roundCyl(0.43, 0.46, 0.3, 0.07, r + 8),
        shoulder: new THREE.SphereGeometry(0.16, r - 4, r - 6),
        sleeve: new THREE.CylinderGeometry(0.16, 0.16, 0.8, r - 4),
        cuff: roundCyl(0.19, 0.19, 0.11, 0.045, r),
        hand: new THREE.SphereGeometry(0.145, r - 4, r - 6),
        thigh: roundCyl(0.16, 0.16, 0.36, 0.06, r),
        sock: roundCyl(0.165, 0.165, 0.3, 0.05, r),
        rim: roundCyl(0.18, 0.18, 0.08, 0.035, r),
        shoe: new RoundedBoxGeometry(0.42, 0.26, 0.52, s, 0.12),
        sole: new RoundedBoxGeometry(0.43, 0.06, 0.55, s, 0.03),
        toe: new RoundedBoxGeometry(0.38, 0.13, 0.17, s, 0.06),
        tail: new THREE.CapsuleGeometry(0.2, 1.1, 3, r - 4),
        tie: new THREE.SphereGeometry(0.13, r - 4, r - 6),
        bun: new THREE.SphereGeometry(0.3, r, r - 4),
        blob: new THREE.SphereGeometry(0.27, r - 4, r - 6),
        visor: new RoundedBoxGeometry(1.2, 0.07, 0.55, 1, 0.03),
        // اللبس (look.outfit)
        robe: roundCyl(0.445, 0.53, 1.22, 0.08, r + 8),
        collar2: roundCyl(0.3, 0.32, 0.1, 0.04, r + 8),
        placket: new RoundedBoxGeometry(0.09, 0.36, 0.03, 1, 0.012),
        stud: new THREE.SphereGeometry(0.022, 8, 6),
        pocket: new RoundedBoxGeometry(0.46, 0.2, 0.06, s, 0.03),
        hoodRoll: new THREE.TorusGeometry(0.3, 0.1, 10, r + 6),
        string: roundCyl(0.016, 0.016, 0.2, 0.008, 6),
        shirtFront: new RoundedBoxGeometry(0.28, 0.68, 0.08, s, 0.035),
        lapel: new RoundedBoxGeometry(0.09, 0.34, 0.03, 1, 0.012),
        flap: new RoundedBoxGeometry(0.18, 0.05, 0.04, 1, 0.015)
    };
    CHAR_GEO[k].skirtF = folded(CHAR_GEO[k].skirt, 10, 0.06, 0.2, -0.235);   // تنورة بطيّات
    CHAR_GEO[k].robeF = folded(CHAR_GEO[k].robe, 12, 0.03, 0.2, -0.61);    // ثوب بطيّات تحت
    return CHAR_GEO[k];
}
// ---------------------------------------------------------------- القماش (طيّات + حركة)
/** طيّات ثابتة على قطعة ملفوفة (تنورة/ثوب): تموّج حول المحور يزيد لتحت (من yTop لين yBot)، والظل يطلع من الشكل نفسه */
function folded(geo, freq, amp, yTop, yBot) {
    const g = geo.clone(), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), r = Math.hypot(x, z);
        if (r < 1e-4) continue;
        const w = Math.max(0, Math.min(1, (yTop - y) / (yTop - yBot))), f = 1 + Math.sin(Math.atan2(x, z) * freq) * amp * w * w;
        P.setXYZ(i, x * f, y, z * f);
    }
    g.computeVertexNormals(); return g;
}
/** ملمس نسيج خفيف (bump) مشترك لكل الأقمشة */
let WEAVE = null;
function weave() {
    if (WEAVE) return WEAVE;
    WEAVE = canvasTex(64, 64, (ctx) => {
        ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 64, 64);
        for (let y = 0; y < 64; y += 2) for (let x = 0; x < 64; x += 2) { const v = 118 + (((x >> 1) + (y >> 1)) % 2 ? 22 : -22) + ((x * 7 + y * 13) % 9) - 4; ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(x, y, 2, 2); }
    });
    WEAVE.wrapS = WEAVE.wrapT = THREE.RepeatWrapping; WEAVE.repeat.set(6, 6);
    return WEAVE;
}
/**
 * قماش يتحرك (بالـGPU، بدون نسخ للمجسم): كل نقطة تحت yTop تتمرجح بوزن يزيد لين yBot (المربوط بالخصر ثابت والطرف حر):
 * تموّج حول القطعة (نسيم/حركة)، ومرجحة عكس اتجاه الحركة (يتأخر ورا الجسم)، وانفراد لما الشخصية تنزل من نطّة.
 * k = تصحيح المقاس (لو القطعة مكبّرة). swayHair() يحرّك القيم كل فريم.
 */
function clothify(m, yTop, yBot, k) {
    const u = { uT: { value: 0 }, uTop: { value: yTop }, uBot: { value: yBot }, uRip: { value: 0 }, uFlare: { value: 0 }, uSway: { value: new THREE.Vector3() } };
    m.onBeforeCompile = (sh) => {
        Object.assign(sh.uniforms, u);
        sh.vertexShader = 'uniform float uT, uTop, uBot, uRip, uFlare; uniform vec3 uSway;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
            float cw = clamp((uTop - transformed.y) / (uTop - uBot), 0.0, 1.0); cw *= cw;
            float cph = atan(transformed.x, transformed.z);
            float crip = sin(cph * 7.0 + uT * 2.3) * 0.6 + sin(cph * 10.0 - uT * 1.7 + 1.3) * 0.4;
            transformed.xz += transformed.xz * cw * (crip * uRip + uFlare);
            transformed += uSway * cw;`);
    };
    m.customProgramCacheKey = () => 'agp-cloth';
    u.k = k || 1;
    return u;
}
const GIRL_STYLES = [1, 2, 3];   // التسريحات اللي تلبس تنورة (ضفاير، طويل، كعكتين)

function buildChar(look, opts) {
    opts = opts || {};
    const G = charGeo(!!opts.lite);
    const C = L.colors(look);
    const shadow = opts.outfit === 'shadow';
    const S = (c, o) => mat(c, Object.assign({ roughness: 0.6 }, o || {}));
    const outfitC = opts.outfit === 'doctor' ? '#f4f6f8' : opts.outfit === 'detective' ? '#8a6a45' : shadow ? '#0b0b10' : C.shirt;
    const skinM = shadow ? S('#0b0b10', { roughness: 1 }) : S(C.skin, { roughness: 0.75 });
    const outfitM = S(outfitC), hemM = S(new THREE.Color(outfitC).multiplyScalar(0.72).getStyle());
    const lowC = shadow ? '#0b0b10' : opts.outfit === 'doctor' ? '#2c8f86' : opts.outfit === 'detective' ? '#4a3a2a' : C.pants;
    const lowM = S(lowC), beltM = S(new THREE.Color(lowC).multiplyScalar(0.78).getStyle());
    const sleeveM = S(shadow ? '#0b0b10' : opts.outfit ? outfitC : '#f6f3ec');
    const goldM = S(shadow ? '#0b0b10' : '#f2c230', { roughness: 0.45 });
    const sockM = S(shadow ? '#0b0b10' : '#f8fafc'), shoeM = S(shadow ? '#000' : '#18181f', { roughness: 0.4 }), toeM = S(shadow ? '#000' : '#f8fafc');
    const hairM = S(C.hair, { roughness: 0.48, side: THREE.DoubleSide });   // لمعة خفيفة مثل الشعر
    const mats = [skinM, outfitM, hemM, lowM, beltM, sleeveM, goldM, sockM, shoeM, toeM, hairM];
    const cloth = [];   // القطع اللي تتحرك (clothify)
    // قماش يتحرك: نسخة من المادة بحركة على مقاس القطعة (عشان باقي القطع بنفس اللون تبقى ثابتة)
    const flow = (m, yTop, yBot, k) => { if (opts.lite) return m; const c2 = m.clone(); cloth.push(clothify(c2, yTop, yBot, k)); mats.push(c2); return c2; };
    const add = (geo, m, x, y, z, par) => { const o = mesh(geo, m, x, y, z); par.add(o); return o; };

    const root = new THREE.Group(), body = new THREE.Group(); body.scale.setScalar(CHAR_K); root.add(body);
    const style = opts.outfit ? (opts.outfit === 'detective' ? 'fedora' : opts.outfit === 'doctor' ? 'surgeon' : 'hood') : C.style;
    const girl = !opts.outfit && GIRL_STYLES.indexOf(style) >= 0;

    // نوع اللبس (look.outfit — MafiaLooks.OUTFITS): 0 بلوزة · 1 ثوب · 2 هودي · 3 جاكيت · 4 فستان. الشخصيات الخاصة (opts.outfit) لها لبسها
    const wear = opts.outfit ? -1 : C.outfit;
    const whiteM = shadow ? outfitM : S('#f3efe6', { roughness: 0.7 }), creamM = shadow ? outfitM : S('#dcd6c8', { roughness: 0.7 });
    const accM = shadow ? outfitM : opts.outfit ? outfitM : S(outfitC, { roughness: 0.6 });
    mats.push(whiteM, creamM, accM);
    // ملمس نسيج خفيف على كل الأقمشة (مو على البشرة والشعر والجزمة)
    if (!opts.lite && !shadow) [outfitM, hemM, lowM, beltM, sleeveM, whiteM, creamM, accM].forEach((m) => { m.bumpMap = weave(); m.bumpScale = 0.35; m.roughness = Math.max(m.roughness, 0.78); });
    // الرجول: الفخذ من الحوض، والركبة محور للساق (جلوس = فخذ للأمام وساق للأسفل).
    // الثوب يغطيها بلونه (لو جلس يبان القماش على حضنه)، والهودي والجاكيت ببنطلون طويل، والباقي رجول وجوارب بيض
    const legM = wear === 1 ? outfitM : (wear === 2 || wear === 3) ? lowM : skinM;
    const sockLegM = wear === 1 ? outfitM : (wear === 2 || wear === 3) ? lowM : sockM;
    const legs = [-0.19, 0.19].map((x) => {
        const hip = new THREE.Group(); hip.position.set(x, 0.78, 0); body.add(hip);
        add(G.thigh, legM, 0, -0.16, 0, hip);
        const knee = new THREE.Group(); knee.position.y = -0.31; hip.add(knee);
        add(G.sock, sockLegM, 0, -0.13, 0, knee);
        add(G.rim, (wear === 2 || wear === 3) ? beltM : sockLegM, 0, -0.02, 0, knee);
        add(G.shoe, shoeM, 0, -0.36, 0.06, knee);
        add(G.toe, toeM, 0, -0.39, 0.27, knee);
        add(G.sole, toeM, 0, -0.47, 0.06, knee);
        return { hip, knee };
    });
    let torso, robe = null;
    const extraSway = [];
    // الكم: قصير منفوخ بسوار ملوّن وتحته الذراع (sleeve=false)، أو طويل لين الرسغ بلون اللبس (sleeve=true)
    const arm = (s, long, sleeveCol, cuffCol) => {
        const g = new THREE.Group(); g.position.set(s * 0.5, 1.97, 0); body.add(g);
        if (long) {
            add(G.puff, sleeveCol, 0, -0.22, 0, g).scale.set(0.8, 1.5, 0.8);
            add(G.forearm, sleeveCol, 0, -0.66, 0, g).scale.set(1.12, 0.85, 1.12);
            add(G.cuff, cuffCol, 0, -0.84, 0, g).scale.set(0.82, 0.8, 0.82);
        } else {
            add(G.puff, sleeveCol, 0, -0.22, 0, g).scale.set(0.85, 1.55, 0.85);
            add(G.cuff, cuffCol, 0, -0.5, 0, g);
            add(G.forearm, opts.outfit ? sleeveM : skinM, 0, -0.72, 0, g).scale.set(1, 0.6, 1);
        }
        add(G.hand, skinM, 0, -0.92, 0, g);
        g.rotation.z = s * 0.06; return g;
    };
    let armL, armR;
    if (wear === 1) {
        // الثوب: قطعة وحدة بلون اللبس لين الكعب، ياقة قايمة صغيرة، وسحّاب أزرار قدّام، وأكمام طويلة بكبك
        torso = add(G.torso, outfitM, 0, 1.68, 0, body);
        robe = add(G.robeF, flow(outfitM, 0.15, -0.61), 0, 0.82, 0, body);
        add(G.collar2, outfitM, 0, 2.05, 0, body);
        add(G.placket, hemM, 0, 1.84, 0.425, body);
        [1.92, 1.8].forEach((y) => add(G.stud, goldM, 0, y, 0.45, body));
        armL = arm(-1, true, outfitM, outfitM); armR = arm(1, true, outfitM, outfitM);
    } else if (wear === 2) {
        // الهودي: بلون اللبس وحافة مضلّعة أغمق، جيب كنغر قدّام، قبعة الهودي ملفوفة ورا الرقبة، وخيطين؛ وبنطلون طويل
        torso = add(G.torso, outfitM, 0, 1.68, 0, body);
        add(G.hem, hemM, 0, 1.33, 0, body).scale.set(1.04, 1.4, 1.04);
        add(G.pocket, hemM, 0, 1.5, 0.405, body);
        const hood = add(G.hoodRoll, outfitM, 0, 2.02, -0.1, body); hood.rotation.x = Math.PI / 2 + 0.25; hood.scale.set(1, 1.05, 0.8);
        [-1, 1].forEach((s2) => { const pv = new THREE.Group(); pv.position.set(s2 * 0.09, 1.96, 0.43); body.add(pv); add(G.string, whiteM, 0, -0.1, 0, pv); extraSway.push({ g: pv, amp: 0.12, ph: s2 * 1.7, sp: 1.6 }); });   // الخيطين يتمرجحون
        add(G.shorts, lowM, 0, 1.08, 0, body);
        armL = arm(-1, true, outfitM, hemM); armR = arm(1, true, outfitM, hemM);
    } else if (wear === 3) {
        // قميص وجاكيت: جاكيت مفتوح بلون اللبس، وتحته قميص أبيض يبان قدّام بياقته، وطيّتين للجاكيت؛ وبنطلون بحزام
        torso = add(G.torso, outfitM, 0, 1.68, 0, body);
        add(G.hem, hemM, 0, 1.33, 0, body).scale.set(1.04, 1.1, 1.04);
        add(G.shirtFront, whiteM, 0, 1.68, 0.385, body);
        add(G.ruff, whiteM, 0, 2.03, 0, body).scale.set(0.95, 1, 0.95);
        [-1, 1].forEach((s2) => { const lp = add(G.lapel, hemM, s2 * 0.13, 1.84, 0.425, body); lp.rotation.set(-0.12, 0, s2 * 0.32); });
        add(G.shorts, lowM, 0, 1.08, 0, body);
        add(G.belt, beltM, 0, 1.25, 0, body);
        [1.74, 1.56].forEach((y) => add(G.stud, shoeM, 0.17, y, 0.43, body).scale.setScalar(1.6));   // أزرار الجاكيت
        [-1, 1].forEach((s2) => { const fl = add(G.flap, hemM, s2 * 0.25, 1.45, 0.385, body); fl.rotation.y = s2 * 0.5; });   // غطا الجيبين
        armL = arm(-1, true, outfitM, whiteM); armR = arm(1, true, outfitM, whiteM);
    } else if (wear === 4) {
        // الفستان: قطعة وحدة بلون اللبس بتنورة واسعة، ياقة وفيونكة وشريطة خصر بيضاء، وأكمام منفوخة
        torso = add(G.torso, outfitM, 0, 1.68, 0, body);
        add(G.ruff, whiteM, 0, 2.03, 0, body);
        [-1, 1].forEach((s2) => { const bw = add(G.bow, whiteM, s2 * 0.1, 1.93, 0.42, body); bw.rotation.set(0.1, 0, -s2 * 0.5); });
        add(G.belt, whiteM, 0, 1.31, 0, body).scale.set(1.01, 1.4, 1.01);
        add(G.skirtF, flow(outfitM, 0.2, -0.235), 0, 0.98, 0, body).scale.set(1.1, 1.15, 1.1);
        add(G.hem, flow(whiteM, 10, 9, 1.1 / 1.62), 0, 0.72, 0, body).scale.set(1.62, 0.6, 1.62);   // الحافة تمشي مع طرف التنورة
        armL = arm(-1, false, outfitM, whiteM); armR = arm(1, false, outfitM, whiteM);
    } else {
        // البلوزة (تصميم صاحب المنصة): بيضاء، وعليها حزام عريض بلون قميص اللاعب، وياقة مكشكشة وفيونكة
        // بنفس اللون، وشريط أوف وايت تحت، والتنورة أو الشورت. الكم قصير منفوخ بسوار ملوّن، وتحته الذراع والكف
        torso = add(G.torso, opts.outfit ? outfitM : whiteM, 0, 1.68, 0, body);
        add(G.band, accM, 0, 1.66, 0, body);
        add(G.hem, creamM, 0, 1.33, 0, body).scale.set(1.04, 1.4, 1.04);
        add(G.ruff, accM, 0, 2.03, 0, body);
        if (!opts.outfit) [-1, 1].forEach((s2) => { const bw = add(G.bow, accM, s2 * 0.1, 1.93, 0.42, body); bw.rotation.set(0.1, 0, -s2 * 0.5); });
        add(G.belt, beltM, 0, 1.27, 0, body);
        if (girl) add(G.skirtF, flow(lowM, 0.2, -0.235), 0, 0.98, 0, body);
        else add(G.shorts, lowM, 0, 1.08, 0, body);
        armL = arm(-1, false, opts.outfit ? sleeveM : whiteM, accM); armR = arm(1, false, opts.outfit ? sleeveM : whiteM, accM);
    }

    // الرأس: يدور من الذقن (head) والمحتوى فوقه (hc = مركز الرأس)
    const head = new THREE.Group(); head.position.y = 2.04; body.add(head);
    const hc = new THREE.Group(); hc.position.y = HEAD_H / 2 + 0.02; head.add(hc);   // الرأس مرفوع شوي عن الياقة
    add(G.head, skinM, 0, 0, 0, hc).scale.set(HR.x, HR.y, HR.z);
    const eyeM = shadow ? mat('#ff0000', { emissive: '#ff0000', emissiveIntensity: 1 }) : S('#2a2130', { roughness: 0.35 });
    const shineM = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const cheekM = S('#f2a19c', { roughness: 0.8 });   // خدود وردية بيضاوية
    if (!shadow) mats.push(cheekM);
    const eyes = [];
    [-1, 1].forEach((s) => {
        const e = onFace(add(G.eye, eyeM, s * 0.33, -0.17, faceZ(s * 0.33, -0.17, -0.02), hc)); e.scale.set(1, 1.25, 0.3); e.userData.sy = 1.25; eyes.push(e);
        if (shadow || opts.lite) return;
        const sh = new THREE.Mesh(G.shine, shineM); sh.position.set(s * 0.33 + 0.05, -0.11, faceZ(s * 0.33 + 0.05, -0.11, 0.02)); hc.add(sh); sh.userData.sy = 1; eyes.push(sh);
        const ck = onFace(add(G.cheek, cheekM, s * 0.55, -0.35, faceZ(s * 0.55, -0.35, -0.02), hc)); ck.scale.set(1.3, 0.75, 0.2); ck.castShadow = false;
    });
    if (!shadow) onFace(add(G.cheek, S('#e0704f', { roughness: 0.5 }), 0, -0.46, faceZ(0, -0.46, -0.006), hc)).scale.set(0.85, 0.32, 0.18);   // فم صغير ناعم

    const hairSway = buildHair(hc, style, hairM, mats, G, shadow ? '#0b0b10' : C.shirt, opts, flow).concat(extraSway);
    // زينة الشعر: كل اللي مفعّلة بلونها. مع الكاب والشماغ النظارة بس (الباقي فوق الرأس)
    if (!opts.outfit) hairSway.push(...hairAcc(hc, C.accs.filter((a) => a.k === 7 || (style !== 5 && style !== 6)), style, mats, !!opts.lite));

    // الشخصية ترمي ظلها على الأرض بس، وما تستقبل ظل من نفسها: ظل الشعر كان يغمّق الوجه (رمادي)
    // ويطلع خطوط كثيفة على الشعر (shadow acne). الحلقات البعيدة (فوق 25 لاعب): بدون ظلال أبداً عشان الأداء
    root.traverse((o) => { o.receiveShadow = false; if (opts.lite) o.castShadow = false; });
    root.userData.base = mats.map((m) => m.color.clone());
    const c = { root, body, head, armL, armR, legs, eyes, mats, torso, sitY: SIT_Y, hairSway, cloth };
    c.sit = (on) => {
        c.sitY = on ? SIT_Y : 0; body.position.y = c.sitY;
        legs.forEach((l) => { l.hip.rotation.x = on ? -Math.PI / 2 : 0; l.knee.rotation.x = on ? Math.PI / 2 : 0; });
        // الثوب: وهو جالس ينتهي عند الحضن (والفخذين بلونه) بدل ما يخترق الكرسي لين الأرض
        if (robe) { robe.scale.y = on ? 0.56 : 1; robe.position.y = on ? 1.09 : 0.82; }
    };
    c.sit(true);
    return c;
}

/** حركة الشعر: كل خصلة (والذيلين) تتمرجح بهدوء من جذرها، وأقوى لما الشخصية تتحرك (k = شدة إضافية) */
const _q = new THREE.Quaternion(), _v = new THREE.Vector3();
function swayHair(c, T, k) {
    if (!c.hairSway) return;
    const m = 1 + (k || 0);
    if (c.cloth && c.cloth.length) swayCloth(c, T, k || 0, m);
    c.hairSway.forEach((h) => {
        const a = h.amp * m, t = T * h.sp + h.ph;
        h.g.rotation.set(Math.sin(t) * a * 0.6, 0, Math.sin(t * 0.83 + 1.1) * a + (h.side ? h.side * a * 0.3 : 0));
    });
}

/**
 * حركة القماش: سرعة الشخصية من موقعها بآخر فريمين (matrixWorld) بإحداثيات الجسم، فالقماش يتأخر ورا الحركة،
 * وينفرد لما تنزل من نطّة، ويتبع خطوات الرجول، ونسيم خفيف دايم. m = 0 يوقّف كل شي (زر «حركة الشعر» بالاستوديو).
 */
function swayCloth(c, T, k, m) {
    const e = c.root.matrixWorld.elements, st = c._cl || (c._cl = { x: e[12], y: e[13], z: e[14], t: T, v: new THREE.Vector3() });
    const dt = T - st.t;
    if (dt > 1e-4 && dt < 0.5) {
        _v.set((e[12] - st.x) / dt, (e[13] - st.y) / dt, (e[14] - st.z) / dt);
        st.v.lerp(_v, Math.min(1, dt * 8));
    } else if (dt >= 0.5) st.v.set(0, 0, 0);
    st.x = e[12]; st.y = e[13]; st.z = e[14]; st.t = T;
    c.body.getWorldQuaternion(_q).invert(); _v.copy(st.v).applyQuaternion(_q);
    const cl = (a, lo, hi) => Math.max(lo, Math.min(hi, a)), L0 = c.legs[0].hip.rotation.x, L1 = c.legs[1].hip.rotation.x;
    const step = c.sitY ? 0 : (L0 - L1) * 0.5;   // مرجحة الرجول بالمشي (الجالس لا)
    c.cloth.forEach((u) => {
        u.uT.value = T * (1 + Math.max(0, k) * 0.5);
        u.uRip.value = m * (0.018 + Math.max(0, k) * 0.012);
        u.uFlare.value = m * cl(-_v.y * 0.05, -0.04, 0.16);
        u.uSway.value.set(cl(-_v.x * 0.06, -0.12, 0.12) * u.k, cl(-_v.y * 0.03, -0.06, 0.06), (cl(-_v.z * 0.06, -0.12, 0.12) - step * 0.16) * u.k).multiplyScalar(m);
    });
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

function buildHair(head, style, hairM, mats, G, accent, opts, flow) {
    opts = opts || {};
    // head = مركز الرأس. الرأس بيضاوي بأنصاف أقطار HR، والشعر قشرة أكبر منه شوي (HX/HY/HZ)
    const HX = HR.x + 0.1, HY = HR.y + 0.08, HZ = HR.z + 0.08, TOP = HR.y, FZ = HR.z, BANG = BANG_Y;
    const SX = HR.x + 0.02, TAILX = HR.x + 0.12;
    const shell = (g) => { const o = mesh(g, hairM, 0, 0, 0); o.scale.set(HX, HY, HZ); head.add(o); return o; };
    // فوق: قشرة مدوّرة حافتها القدّامية خط الغُرّة المستقيم
    const top = () => { const c = shell(G.hairCap); c.scale.set(HR.x + 0.06, HR.y + 0.06, HR.z + 0.04); return c; };   // قشرة رفيعة لاصقة بالرأس   // نفس مقاس الشعر النازل عشان ينضمون بدون عتبة
    // الشعر النازل (نفس صورة التصميم): قطعة وحدة تلف الرأس من الجنبين والخلف وتترك الوجه مكشوف.
    // مقطعها حلقة بيضاوية مقصوصة من قدّام (وجهها الأمامي المسطّح = الجوانب اللي تبان جنب الوجه)، ممدودة لتحت لين bottom.
    // فوق خط الغُرّة تنضم على شكل الرأس (تصغر مع القبة)، وتحت تتوسّع شوي لين طرفها.
    const drape = (bottom, mt) => {
        const ox = HR.x + 0.06, oz = HR.z + 0.04, ix = HR.x - 0.04, iz = HR.z - 0.06;   // سماكة رفيعة (~0.1)
        const gap = Math.asin(0.8), N = 44, sh = new THREE.Shape();   // الوجه مكشوف بعرض الغُرّة، والخصل الجانبية تبدأ عند طرفه
        const pt = (rx, rz, t) => [Math.sin(t) * rx, Math.cos(t) * rz];
        for (let i = 0; i <= N; i++) { const t = gap + (TAU - 2 * gap) * i / N, q = pt(ox, oz, t); i ? sh.lineTo(q[0], q[1]) : sh.moveTo(q[0], q[1]); }
        for (let i = N; i >= 0; i--) { const t = gap + (TAU - 2 * gap) * i / N, q = pt(ix, iz, t); sh.lineTo(q[0], q[1]); }
        const topY = BANG + 0.04, len = topY - bottom;   // تبدأ عند حافة القبة بالضبط (بدون عتبة فوق)
        const g = new THREE.ExtrudeGeometry(sh, { depth: len, steps: Math.max(6, Math.round(len * 10)), curveSegments: 8, bevelEnabled: false });
        g.rotateX(Math.PI / 2); g.translate(0, topY, 0);
        const P = g.attributes.position;
        for (let i = 0; i < P.count; i++) {
            const y = P.getY(i);
            const f = y > 0 ? Math.sqrt(Math.max(0.05, 1 - (y / (HR.y + 0.06)) ** 2)) : 1 + Math.min(0.08, -y * 0.05);   // ينضم مع القبة فوق ويتوسّع تحت
            P.setX(i, P.getX(i) * f); P.setZ(i, P.getZ(i) * (y > 0 ? f : 1));
        }
        g.computeVertexNormals();
        const o = mesh(g, mt || hairM, 0, 0, 0); head.add(o); return o;
    };
    const sides = (bottom) => drape(bottom);
    // غُرّة مسنّنة (تصميم الضفاير): شريط على سطح الجبهة، حافته التحتية زقزاق (أسنان مثلّثة)
    const FR_DROP = 0.15;   // الغُرّة المسنّنة تنزل أكثر على الجبهة
    const fringe = (teeth, depth) => {
        // غُرّة لها سماكة: طبقة برا وطبقة جوا، وحافة تحتية بأسنان ناعمة (رؤوس مدوّرة) تقفل بينهم بانحناءة
        const t0 = Math.asin(0.84), SUB = 6, cols = teeth * SUB, pos = [], idx = [];
        const at = (k, t, y) => { const rx = HR.x + k, ry = HR.y + k, rz = HR.z + k, c = Math.sqrt(Math.max(0.02, 1 - (y / ry) ** 2)); return [Math.sin(t) * rx * c, y, Math.cos(t) * rz * c]; };
        const OUT = 0.13, IN = 0.01, RIM = 4, W = 2 + RIM + 1;
        for (let i = 0; i <= cols; i++) {
            const t = -t0 + 2 * t0 * i / cols, ph = (i % SUB) / SUB;   // مكانها داخل السن
            const tri = 1 - Math.abs(2 * ph - 1), tooth = tri * tri * (3 - 2 * tri);   // سن مثلّث رأسه ناعم (مثل التصميم)
            const edgeK = Math.min(i, cols - i) / SUB < 0.5 ? 0.06 : 0;
            const yb = BANG - 0.06 - FR_DROP - depth * tooth - edgeK;
            pos.push(...at(0.065, t, BANG + 0.12));   // فوق برا (تنضم مع القبة)
            // الحافة: نص دائرة من برا (yb) لجوا، منتفخة لتحت
            for (let r = 0; r <= RIM; r++) { const a = r / RIM * Math.PI, k = OUT + (IN - OUT) * (1 - Math.cos(a)) / 2; pos.push(...at(k, t, yb - Math.sin(a) * 0.035 + (r / RIM) * 0.02)); }
            pos.push(...at(IN, t, BANG + 0.12));   // فوق جوا
            if (i) { const a = (i - 1) * W, c = i * W; for (let f = 0; f < W - 1; f++) idx.push(a + f, a + f + 1, c + f, a + f + 1, c + f + 1, c + f); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        head.add(mesh(g, hairM, 0, 0, 0));
    };
    // خصل مدوّرة لاصقة بالرأس (تصميم الضفاير): قشرة الشعر نفسها تكمل لتحت على الجنبين والخلف وتترك فتحة الوجه،
    // وطرفها التحتي ينزل أكثر عند حافة الوجه (رأس الخصلة)
    const sideShell = (bottom, faceHalf) => {
        // قشرة لها سماكة (برا + جوا) وحافة مدوّرة تقفل بينهم على أطراف الخصل وتحتها — بدون حواف حادة
        const g = Math.asin(faceHalf), th0 = HAIR_CUT - 0.03, ry0 = HR.y + 0.06, th1 = Math.acos(Math.max(-0.99, bottom / ry0));
        const W = 40, H = 14, T = 0.1, RIM = 4;   // RIM = تقسيمات نص الدائرة على الحافة
        const P0 = Math.PI / 2 + g, PL = TAU - 2 * g;
        const surf = (u, v, k) => {   // u على العرض (0..1)، v على الطول (0..1)، k = 0 برا .. 1 جوا
            const phi = P0 + PL * u, th = th0 + (th1 - th0) * v, rr = 0.06 - T * k;
            const rx = HR.x + rr, ry = HR.y + rr, rz = HR.z + rr - 0.02;
            let x = -Math.cos(phi) * Math.sin(th) * rx, y = Math.cos(th) * ry, z = Math.sin(phi) * Math.sin(th) * rz;
            const dFront = Math.min(u, 1 - u) * PL;   // بُعدها عن حافة الوجه
            y += v * v * Math.max(0, 1 - dFront / 0.28) * 0.16;   // الخصلة أقصر عند حافة الوجه، والشعر يكمل لتحت ورا (يغطي جنب الرأس لين الفك)
            return [x, y, z];
        };
        // شبكة: صفوف (v) × أعمدة؛ كل عمود فيه برا، ثم الحافة المدوّرة، ثم جوا — مقطع على شكل U مقلوب حول طرف الخصلة
        const pos = [], idx = [], ring = [];
        const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
        // مسار الحافة: الحافة اليسار (u=0) من فوق لتحت، ثم التحت (v=1)، ثم اليمين (u=1) من تحت لفوق
        const edge = []; for (let i = 0; i <= H; i++) edge.push([0, i / H]); for (let i = 1; i <= W; i++) edge.push([i / W, 1]); for (let i = H - 1; i >= 0; i--) edge.push([1, i / H]);
        // الوجه البراني والجواني كشبكتين
        const grid = (k, flip) => {
            const base = pos.length / 3;
            for (let i = 0; i <= H; i++) for (let j = 0; j <= W; j++) pos.push(...surf(j / W, i / H, k));
            for (let i = 0; i < H; i++) for (let j = 0; j < W; j++) { const a = base + i * (W + 1) + j, b2 = a + W + 1; if (flip) idx.push(a, a + 1, b2, a + 1, b2 + 1, b2); else idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
        };
        grid(0, false); grid(1, true);
        // الحافة المدوّرة: لكل نقطة على المسار، نص دائرة من برا لجوا تنتفخ للخارج (بعيد عن الشعر)
        const base = pos.length / 3;
        edge.forEach(([u, v]) => {
            const o = surf(u, v, 0), n = surf(u, v, 1), du = u === 0 ? -1 : u === 1 ? 1 : 0, dv = v === 1 ? 1 : 0;
            const o2 = surf(Math.min(1, Math.max(0, u - du * 0.01)), Math.min(1, v - dv * 0.01), 0);
            const out = [o[0] - o2[0], o[1] - o2[1], o[2] - o2[2]], L = Math.hypot(out[0], out[1], out[2]) || 1;
            for (let r = 0; r <= RIM; r++) {
                const a = r / RIM * Math.PI, m = lerp3(o, n, (1 - Math.cos(a)) / 2), bulge = Math.sin(a) * T * 0.5 / L;
                pos.push(m[0] + out[0] * bulge, m[1] + out[1] * bulge, m[2] + out[2] * bulge);
            }
        });
        for (let e = 0; e < edge.length - 1; e++) for (let r = 0; r < RIM; r++) { const a = base + e * (RIM + 1) + r, b2 = a + RIM + 1; idx.push(a, b2, a + 1, a + 1, b2, b2 + 1); }
        const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
        geo.computeVertexNormals();
        const m = mesh(geo, hairM, 0, 0, 0); head.add(m);
    };
    // ذيل ضفيرة: أنبوب مستدق على منحنى (يطلع لبرا وفوق شوي ثم ينزل لتحت)، بربطة مضلّعة عند الرأس
    const tieM = mat('#f0646a', { roughness: 0.6 });
    const pigtail = (s) => {
        // الذيل: مقطع دائري يمشي على منحنى بمستوى الوجه (بدون لف): من الربطة يطلع لبرا وفوق لين مستوى أعلى الرأس،
        // يدور من فوق، وينزل لتحت على الجنب ويستدق لين طرفه
        const P = (x, y, z) => new THREE.Vector3(s * x, y, z), pg = new THREE.Group();
        const curve = new THREE.CatmullRomCurve3([P(HR.x - 0.02, 0.5, -0.14), P(HR.x + 0.2, 0.52, -0.18), P(HR.x + 0.38, 0.38, -0.2), P(HR.x + 0.44, 0.0, -0.2), P(HR.x + 0.4, -0.5, -0.17), P(HR.x + 0.3, -1.0, -0.12)]);
        const SEG = 44, RAD = 14, radius = (u) => u < 0.15 ? 0.17 + u / 0.15 * 0.07 : 0.24 - (u - 0.15) / 0.85 * 0.15;
        const pos = [], idx = [], B = new THREE.Vector3(0, 0, 1);
        for (let i = 0; i <= SEG; i++) {
            const u = i / SEG, c = curve.getPointAt(u), T = curve.getTangentAt(u), N = new THREE.Vector3().crossVectors(B, T).normalize(), r = radius(u);
            for (let j = 0; j <= RAD; j++) { const a = j / RAD * TAU, v = new THREE.Vector3().addScaledVector(N, Math.cos(a) * r).addScaledVector(B, Math.sin(a) * r * 0.9); pos.push(c.x + v.x, c.y + v.y, c.z + v.z); }
            if (i) for (let j = 0; j < RAD; j++) { const a = (i - 1) * (RAD + 1) + j, b2 = i * (RAD + 1) + j; idx.push(a, b2, a + 1, b2, b2 + 1, a + 1); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        pg.add(mesh(g, hairM, 0, 0, 0));
        [0, 1].forEach((u) => { const c = curve.getPointAt(u), b = mesh(new THREE.SphereGeometry(radius(u) * 0.98, 18, 12), hairM, c.x, c.y, c.z); b.scale.z = 0.9; pg.add(b); });   // الأطراف مقفولة ومدوّرة
        // الربطة: أسطوانة قصيرة مدوّرة الحواف باتجاه الذيل
        const t0 = curve.getTangentAt(0.0), c0 = curve.getPointAt(0.0);
        const tie = mesh(new THREE.SphereGeometry(0.16, 18, 12), tieM, c0.x - s * 0.05, c0.y - 0.03, c0.z); tie.scale.set(1, 0.78, 1);
        tie.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t0.clone().normalize()); pg.add(tie);
        // الذيل كامل يتمرجح من عند الربطة
        const c0p = curve.getPointAt(0), pivot = new THREE.Group(); pivot.position.copy(c0p); pg.position.copy(c0p).multiplyScalar(-1); pivot.add(pg); head.add(pivot);
        sway.push({ g: pivot, amp: 0.1, ph: s * 1.3, sp: 1.1, side: s });
    };

    // ---------------------------------------------------------------- خصل الشعر (بدل القطع المربعة)
    // كل خصلة شريط مدوّر مستدق: مقطعه بيضاوي مسطّح (عريض على سطح الرأس ورقيق بالسماكة)، يمشي على مسار
    // لاصق بالرأس ثم يتدلّى، ورأسه مدبّب ناعم. كل خصلة بمجموعة محورها عند جذرها عشان تتحرك (sway).
    const sway = [];
    const SEGL = 30, RADL = 18;   // تقسيمات كثيرة = خصل ناعمة
    const surf = (phi, y, off) => {   // نقطة على سطح الرأس (phi = 0 قدّام) مع إزاحة للخارج
        const rx = HR.x + off, ry = HR.y + off, rz = HR.z + off, yy = Math.max(-ry * 0.999, Math.min(ry * 0.999, y)), c = Math.sqrt(1 - (yy / ry) ** 2);
        return new THREE.Vector3(Math.sin(phi) * rx * c, yy, Math.cos(phi) * rz * c);
    };
    // مسار خصلة: من الجذر (y0) لين الطرف (y1)، لاصقة بالرأس لين HANG ثم تنزل مستقيمة تحت مع انفراج بسيط
    const lockPath = (phi, y0, y1, off, flare) => {
        const HANG = -HR.y * 0.55, pts = [], n = 8;
        for (let i = 0; i <= n; i++) {
            const y = y0 + (y1 - y0) * i / n;
            if (y >= HANG) pts.push(surf(phi, y, off));
            else { const b = surf(phi, HANG, off), k = (HANG - y); pts.push(new THREE.Vector3(b.x * (1 + k * (flare || 0.05)), y, b.z * (1 + k * (flare || 0.05)) - k * 0.04)); }
        }
        return new THREE.CatmullRomCurve3(pts);
    };
    const lock = (curve, w, t, amp, tipW) => {
        const pos = [], idx = [], root = curve.getPointAt(0), up = new THREE.Vector3(0, 1, 0);
        for (let i = 0; i <= SEGL; i++) {
            const u = i / SEGL, c = curve.getPointAt(u), T = curve.getTangentAt(u);
            // اتجاه "للخارج" = بعيد عن مركز الرأس (أفقياً)، والعرض عمودي عليه
            const out = new THREE.Vector3(c.x, Math.max(-0.2, Math.min(0.6, c.y * 0.3)), c.z).normalize();
            const N = new THREE.Vector3().crossVectors(T, out).normalize(), B = new THREE.Vector3().crossVectors(N, T).normalize();
            const tu = Math.max(0, (u - 0.55) / 0.45), taper = 1 - (tu * tu * (3 - 2 * tu)) * (1 - (tipW || 0.12));   // يستدق بنعومة لين رأس مدوّر
            const ww = w * taper * (0.92 + 0.08 * Math.sin(u * Math.PI)) * (u < 0.08 ? 0.75 + u / 0.08 * 0.25 : 1), tt = t * (0.55 + 0.45 * taper);
            for (let j = 0; j <= RADL; j++) {
                const a = j / RADL * TAU, ca = Math.cos(a), sa = Math.sin(a), v = new THREE.Vector3().addScaledVector(N, Math.sign(ca) * Math.pow(Math.abs(ca), 0.8) * ww).addScaledVector(B, sa * tt);
                pos.push(c.x + v.x - root.x, c.y + v.y - root.y, c.z + v.z - root.z);
            }
            if (i) for (let j = 0; j < RADL; j++) { const a2 = (i - 1) * (RADL + 1) + j, b2 = i * (RADL + 1) + j; idx.push(a2, b2, a2 + 1, b2, b2 + 1, a2 + 1); }
        }
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
        const grp = new THREE.Group(); grp.position.copy(root); grp.add(mesh(g, hairM, 0, 0, 0)); head.add(grp);
        sway.push({ g: grp, amp: amp || 0.03, ph: Math.random() * TAU, sp: 0.8 + Math.random() * 0.5 });
        return grp;
    };
    // غُرّة من خصل: كل خصلة من قرب أعلى الرأس تنزل على الجبهة، وأطرافها بأطوال مختلفة شوي (حافة طبيعية)
    const bangs = (n, spread, tipY) => {
        for (let i = 0; i < n; i++) {
            // خصل عريضة قليلة متداخلة شوي (مو عشر خصل رفيعة فوق بعض)، والطول يقصر بنعومة للأطراف مع فرق بسيط بين الجيران
            const k = n === 1 ? 0 : i / (n - 1) * 2 - 1, phi = k * spread, len = (i % 2 ? 0.05 : 0) + k * k * 0.1;
            lock(lockPath(phi, HR.y * 0.78, tipY - len, 0.065, 0), 0.22 - k * k * 0.03, 0.1, 0.02, 0.38);
        }
    };
    const sideLocks = (bottom, cnt, rootY) => {
        [-1, 1].forEach((s) => { for (let i = 0; i < cnt; i++) { const phi = s * (1.02 + i * 0.3); lock(lockPath(phi, rootY != null ? rootY : HR.y * 0.45, bottom - i * 0.04, 0.05, 0.03), 0.25, 0.1, 0.05, 0.4); } });
    };
    const backLocks = (bottom, cnt, rootY) => {
        for (let i = 0; i < cnt; i++) { const phi = Math.PI - 1.7 + 3.4 * i / (cnt - 1); lock(lockPath(phi, rootY != null ? rootY : HR.y * 0.7, bottom - (i % 2) * 0.05, 0.05, 0.035), 0.34, 0.1, 0.06, 0.45); }
    };
    // قشرة الرأس: ناعمة وفيها خطوط خصل خفيفة من التاج (مو مضلّعة)
    const cap = () => {
        const geo = new THREE.SphereGeometry(1, 64, 28, 0, TAU, 0, HAIR_CUT + 0.25), pa = geo.attributes.position;
        for (let i = 0; i < pa.count; i++) {
            let x = pa.getX(i), y = pa.getY(i), z = pa.getZ(i); const phi = Math.atan2(x, z);
            const front = Math.max(0, Math.cos(phi)), yMin = Math.cos(HAIR_CUT + 0.25), lift = front * front * Math.max(0, (0.62 - y)) ;   // قدّام: القشرة تطلع فوق خلف الغرة (ما تبان حافتها على الجبهة)
            if (lift > 0) { y = Math.min(1, y + lift * 0.9); const k = Math.sqrt(Math.max(0, 1 - y * y) / Math.max(1e-4, x * x + z * z)); x *= k; z *= k; }
            const groove = 1 + 0.006 * Math.cos(phi * 22) * (1 - Math.max(0, y));
            pa.setXYZ(i, x * (HR.x + 0.05) * groove, y * (HR.y + 0.06), z * (HR.z + 0.04) * groove);
        }
        geo.computeVertexNormals(); head.add(mesh(geo, hairM, 0, 0, 0));
    };
    // الشماغ والقبعات القديمة مصممة على رأس كروي صغير (0.45) فنكبّرها للرأس الكبير
    const big = new THREE.Group(); big.scale.setScalar(2.05); big.position.y = 0.05; head.add(big);
    switch (style) {
        case 0: cap(); bangs(7, 0.92, BANG_Y - 0.22); sideLocks(-0.35, 2); backLocks(-0.62, 9); break;   // قصير
        case 1:                                                                    // ضفاير: غرة خصل، خصل جنب الوجه لين الذقن، وذيلين
            cap(); bangs(7, 0.92, BANG_Y - 0.2); sideLocks(-0.55, 2); backLocks(-0.7, 9); [-1, 1].forEach(pigtail);
            break;
        case 2: cap(); drape(-1.75); bangs(7, 0.92, BANG_Y - 0.22); sideLocks(-1.85, 2); backLocks(-1.95, 11); break;   // طويل (لين الخصر): صفحة وحدة ناعمة وفوقها خصل
        case 3: cap(); bangs(7, 0.92, BANG_Y - 0.22); sideLocks(-0.35, 2); backLocks(-0.62, 9);              // كعكتين
            [-1, 1].forEach((s) => head.add(mesh(G.bun, hairM, s * 0.5, TOP + 0.12, -0.12))); break;
        case 4: {                                                                  // كيرلي: غيمة كرات شعر ناعمة بأحجام مختلفة (والوجه مكشوف)
            cap();
            const N = opts.lite ? 40 : 76;
            for (let i = 0; i < N; i++) {
                const ph2 = Math.acos(1 - (i + 0.5) / N * 1.6), th = i * 2.399;
                const x = Math.sin(ph2) * Math.sin(th), y = Math.cos(ph2), z = Math.sin(ph2) * Math.cos(th);
                if (z > 0.3 && y < 0.5) continue;   // الوجه مكشوف
                const r = 0.62 + 0.22 * ((i * 7) % 5) / 4, o = mesh(G.blob, hairM, x * (HR.x + 0.02), y * (HR.y + 0.02) + 0.02, z * (HR.z + 0.02));
                o.scale.set(r, r * 0.9, r); head.add(o);
            }
            // حافة الغرة: كرات أصغر على خط الجبهة
            for (let i = 0; i < 7; i++) { const k = i / 6 * 2 - 1, ph = k * 0.95, p = surf(ph, BANG_Y + 0.06 - k * k * 0.12, 0.06); const o = mesh(G.blob, hairM, p.x, p.y, p.z); o.scale.setScalar(0.5 + (i % 2) * 0.08); head.add(o); }
            break;
        }
        case 5: {                                                                  // كاب: طاقية بلون اللبس وحافة قدّام وزر فوق، والشعر يطلع من تحتها
            cap(); sideLocks(-0.3, 2, 0.2); backLocks(-0.55, 9, 0.22);   // الخصل تطلع من تحت حافة الطاقية
            const capM = mat(accent || '#e2483d', { roughness: 0.6 }); mats.push(capM);
            const crown = mesh(new THREE.SphereGeometry(1, 48, 20, 0, TAU, 0, 1.2), capM, 0, 0, 0); crown.scale.set(HR.x + 0.19, HR.y + 0.12, HR.z + 0.19); head.add(crown);
            const brimG = new THREE.CylinderGeometry(1, 1, 0.09, 40, 1, false, -Math.PI / 2, Math.PI);
            const brimM = mat(new THREE.Color(accent || '#e2483d').multiplyScalar(0.78).getStyle(), { roughness: 0.6 }); mats.push(brimM);
            const brim = mesh(brimG, brimM, 0, (HR.y + 0.12) * Math.cos(1.2) + 0.03, 0.05); brim.scale.set(HR.x * 0.86, 1, (HR.z + 0.19) * 1.45); brim.rotation.x = 0.22; head.add(brim);
            const btn = mesh(G.tie, capM, 0, HR.y + 0.13, 0); btn.scale.set(0.6, 0.4, 0.6); head.add(btn);
            break;
        }
        case 6: {                                                                  // شماغ وعقال
            const ghutraM = new THREE.MeshStandardMaterial({ roughness: 0.9, side: THREE.DoubleSide, map: canvasTex(64, 64, (ctx) => {
                // نقشة الشماغ: أرضية بيضاء وشبكة حمرا رفيعة بمعيّنات صغيرة عند التقاطعات
                ctx.fillStyle = '#f6f3ec'; ctx.fillRect(0, 0, 64, 64); ctx.fillStyle = '#c4302b';
                ctx.fillRect(0, 30, 64, 4); ctx.fillRect(30, 0, 4, 64);
                [[0, 0], [64, 0], [0, 64], [64, 64]].forEach(([cx, cy]) => { ctx.beginPath(); ctx.moveTo(cx, cy - 12); ctx.lineTo(cx + 12, cy); ctx.lineTo(cx, cy + 12); ctx.lineTo(cx - 12, cy); ctx.fill(); });
            }) });
            ghutraM.map.wrapS = ghutraM.map.wrapT = THREE.RepeatWrapping; 
            mats.push(ghutraM);
            // قماش واحد: فوق يلبس الرأس، وتحت خط الأذن ينزل مستقيم لين الكتوف (يتوسّع شوي مع طيّات)، ومفتوح من قدّام عند الوجه
            const clothG = new THREE.SphereGeometry(1, 72, 40, Math.PI / 2 + 0.7, TAU - 1.4, 0, Math.PI * 0.94), pc = clothG.attributes.position;
            for (let i = 0; i < pc.count; i++) {
                let x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i); const ph2 = Math.atan2(x, z), down = Math.max(0, -y);
                if (y < 0) { const r = Math.hypot(x, z) || 1; x /= r; z /= r; }   // تحت: جدار مستقيم بدل ما ينضم (شكل البيضة)
                const flare = 1 + down * down * 0.12, fold = 1 + 0.025 * down * Math.sin(ph2 * 11);
                const yy = y > 0 ? y * (HR.y + 0.09) : -down * 1.15;
                pc.setXYZ(i, x * (HR.x + 0.07) * flare * fold, yy, z * (HR.z + 0.07) * flare * fold);
            }
            clothG.computeVertexNormals();
            // النقشة بمقاس ثابت على القماش (مو ممطوطة): u حول الرأس، v على طول القماش من فوق
            const uv = clothG.attributes.uv;
            for (let i = 0; i < pc.count; i++) { const x = pc.getX(i), y = pc.getY(i), z = pc.getZ(i), r = Math.hypot(x, z); if (y > HR.y * 0.62) uv.setXY(i, x * 6, z * 6); else uv.setXY(i, Math.atan2(x, z) * 6.4, (y > 0 ? (Math.PI / 2 - Math.atan2(y, r)) * 1.1 : 1.6 - y) * 6); }   // فوق العقال: إسقاط من فوق (بدون تجمّع عند القمة)
            head.add(mesh(clothG, flow ? flow(ghutraM, -0.1, -1.15) : ghutraM, 0, 0, 0));   // الطرف النازل يتمرجح
            // فوق الرأس مقفول (القماش مفتوح من قدّام بس عند الوجه)
            const topG = new THREE.SphereGeometry(1, 48, 12, 0, TAU, 0, 1.05), pt = topG.attributes.position, tu = topG.attributes.uv;
            for (let i = 0; i < pt.count; i++) { pt.setXYZ(i, pt.getX(i) * (HR.x + 0.075), pt.getY(i) * (HR.y + 0.095), pt.getZ(i) * (HR.z + 0.075)); tu.setXY(i, pt.getX(i) * 6, pt.getZ(i) * 6); }
            topG.computeVertexNormals(); head.add(mesh(topG, ghutraM, 0, 0, 0));
            const iqalM = mat('#141414', { roughness: 0.5 });
            [0, 0.12].forEach((dy) => { const y0 = HR.y * 0.55 + dy, k = Math.sqrt(1 - (y0 / (HR.y + 0.09)) ** 2); const iq = mesh(new THREE.TorusGeometry(1, 0.055, 12, 48), iqalM, 0, y0, 0); iq.rotation.x = Math.PI / 2; iq.scale.set((HR.x + 0.11) * k, (HR.z + 0.11) * k, 1); head.add(iq); });   // العقال لاصق على الشماغ
            break;
        }
        case 'fedora': {
            const fm = mat('#3a2c22');
            big.add(mesh(new THREE.CylinderGeometry(0.72, 0.72, 0.04, 28), fm, 0, 0.3, 0));
            big.add(mesh(new THREE.CylinderGeometry(0.36, 0.42, 0.36, 24), fm, 0, 0.48, 0));
            big.add(mesh(new THREE.CylinderGeometry(0.425, 0.425, 0.08, 24), mat('#16110d'), 0, 0.36, 0));
            break;
        }
        case 'surgeon': { const sd = mesh(G.hairCap, mat('#3fb7a8', { side: THREE.DoubleSide }), 0, 0, 0); sd.scale.set(HX, HY, HZ); head.add(sd); break; }
        case 'hood': {
            // مفتوح من قدّام عشان تبان العيون الحمر
            const hood = mesh(new THREE.SphereGeometry(0.56, 24, 18, Math.PI / 2 + 0.75, TAU - 1.5, 0, 2.2), mat('#09090d', { roughness: 1, side: THREE.DoubleSide }), 0, 0.04, -0.06);
            hood.rotation.x = -0.2; big.add(hood);
            break;
        }
    }
    return sway;
}

/**
 * زينة الشعر (look.accs/accC — MafiaLooks.ACCS): list = [{k, col}] كل اللي مفعّلة بلونها، ويقدر يلبس أكثر من وحدة.
 * k: 1 طوق · 2 فيونكة · 3 وردة · 4 تاج · 5 بنسات · 6 آذان قطة · 7 نظارة · 8 تاج ورد. head = مركز الرأس.
 * ترجع قطع تتمرجح بهدوء (نفس نظام الشعر).
 */
function hairAcc(head, list, style, mats, lite) {
    const sway = [];
    if (!list || !list.length) return sway;
    const seg = lite ? 8 : 18;
    const S = (c, o) => { const m = mat(c, Object.assign({ roughness: 0.5 }, o || {})); mats.push(m); return m; };
    const gold = S('#f2c230', { roughness: 0.3, metalness: 0.6 }), pink = S('#ff8fb8', { roughness: 0.4 });
    // نقطة فوق سطح الشعر (phi = 0 قدّام، y من مركز الرأس) والاتجاه العمودي عليه — عشان القطعة تلصق على الرأس المدوّر
    const RX = HR.x + 0.13, RY = HR.y + 0.11, RZ = HR.z + 0.13;
    const at = (phi, y, off) => { const k = off || 0, c = Math.sqrt(Math.max(0.02, 1 - (y / RY) ** 2)); return new THREE.Vector3(Math.sin(phi) * (RX + k) * c, y + (k * y / RY), Math.cos(phi) * (RZ + k) * c); };
    const nrm = (p) => new THREE.Vector3(p.x / RX ** 2, p.y / RY ** 2, p.z / RZ ** 2).normalize();
    const place = (g, phi, y, off, spin) => {   // يلصق مجموعة على الرأس: z المحلي للخارج، وy المحلي لفوق
        const p = at(phi, y, off), n = nrm(p); g.position.copy(p);
        const m4 = new THREE.Matrix4().lookAt(new THREE.Vector3(), n, new THREE.Vector3(0, 1, 0)); g.quaternion.setFromRotationMatrix(m4);
        g.rotateZ(spin || 0); g.rotateY(Math.PI); head.add(g); return g;
    };
    const sph = (r, m, x, y, z, sx, sy, sz, par) => { const o = mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 6)), m, x, y, z); o.scale.set(sx || 1, sy || 1, sz || 1); par.add(o); return o; };
    const bob = (g, amp, ph) => sway.push({ g, amp, ph, sp: 1.2 });
    list.forEach(({ k: acc, col }) => {
    const before = head.children.length;
    const main = S(col), light = S(new THREE.Color(col).lerp(new THREE.Color('#ffffff'), 0.45).getStyle()), dark = S(new THREE.Color(col).multiplyScalar(0.75).getStyle());
    const shiny = S(col, { roughness: 0.3, metalness: 0.6 });
    switch (acc) {
        case 1: {   // طوق: شريط مدوّر فوق الرأس من أذن لأذن، مايل لقدّام شوي، وعليه نقاط فاتحة
            const pts = []; for (let i = 0; i <= 24; i++) { const t = -1.3 + 2.6 * i / 24; pts.push(new THREE.Vector3(Math.sin(t) * (HR.x + 0.1), Math.cos(t) * (HR.y + 0.09), 0)); }
            const band = new THREE.Group(); band.rotation.x = 0.36; head.add(band);
            band.add(mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.07, lite ? 6 : 12, false), main, 0, 0, 0));
            [-1, 1].forEach((s) => { const e = pts[s < 0 ? 0 : 24]; band.add(mesh(new THREE.SphereGeometry(0.075, 12, 8), main, e.x, e.y, e.z)); });
            if (!lite) [-0.7, -0.35, 0, 0.35, 0.7].forEach((t) => sph(0.035, light, Math.sin(t) * (HR.x + 0.16), Math.cos(t) * (HR.y + 0.15), 0.02, 1, 1, 0.6, band));
            break;
        }
        case 2: {   // فيونكة كبيرة فوق جنب الرأس: جناحين منفوخين وعقدة بالنص وطرفين نازلين
            const g = place(new THREE.Group(), 0.62, 0.72, 0.1, -0.35); g.scale.setScalar(1.35);
            [-1, 1].forEach((s) => { const w = sph(0.2, main, s * 0.2, 0.02, 0, 1.15, 0.8, 0.45, g); w.rotation.z = s * 0.25; sph(0.1, light, s * 0.24, 0.04, 0.05, 1, 0.6, 0.3, g); });
            sph(0.09, dark, 0, 0, 0.04, 1, 1, 0.8, g);
            [-1, 1].forEach((s) => { const t = sph(0.08, main, s * 0.08, -0.17, -0.02, 0.7, 1.9, 0.35, g); t.rotation.z = s * 0.35; });
            bob(g, 0.05, 0.4);
            break;
        }
        case 3: {   // وردة فوق الأذن: خمس بتلات مدوّرة ونص أصفر وورقة خضرا
            const g = place(new THREE.Group(), -0.95, 0.42, 0.07, 0.3); g.scale.setScalar(1.45);
            for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; sph(0.11, i % 2 ? main : light, Math.cos(a) * 0.12, Math.sin(a) * 0.12, 0, 1, 1, 0.45, g); }
            sph(0.075, gold, 0, 0, 0.04, 1, 1, 0.7, g);
            const leaf = sph(0.09, S('#5cbf6a'), 0.12, -0.2, -0.03, 0.6, 1.4, 0.3, g); leaf.rotation.z = 0.7;
            bob(g, 0.03, 1.1);
            break;
        }
        case 4: {   // تاج صغير ذهبي فوق الرأس: حلقة وأسنان مدوّرة الرؤوس وجواهر وردية
            const g = new THREE.Group(); g.position.set(0, HR.y + 0.06, 0.08); g.rotation.x = 0.25; head.add(g);
            const R = style === 3 ? 0.26 : 0.34;   // أصغر بين الكعكتين
            const ring = mesh(new THREE.TorusGeometry(R, 0.045, 8, lite ? 16 : 32), shiny, 0, 0.02, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
            for (let i = 0; i < 5; i++) {
                const a = (i / 5) * TAU + Math.PI / 2, x = Math.cos(a) * R, z = Math.sin(a) * R, h = i === 0 ? 0.26 : 0.18;
                const sp = mesh(new THREE.ConeGeometry(0.07, h, lite ? 6 : 12), shiny, x, 0.04 + h / 2, z); g.add(sp);
                sph(0.04, i === 0 ? pink : shiny, x, 0.06 + h, z, 1, 1, 1, g);
                if (i === 0) sph(0.05, pink, x, 0.06, z + 0.04, 1, 1, 0.6, g);
            }
            break;
        }
        case 5: {   // بنسات: ثلاث بنسات ملوّنة على جنب الغرة، ونجمة صغيرة على وحدة
            [[0.78, 0.5, 0.55, main], [0.92, 0.36, 0.65, S('#ffd84a')], [1.04, 0.22, 0.75, light]].forEach(([phi, y, spin, m]) => {
                const g = place(new THREE.Group(), phi, y, 0.06, spin);
                g.add(mesh(new RoundedBoxGeometry(0.4, 0.09, 0.06, 2, 0.03), m, 0, 0, 0));
            });
            const st = place(new THREE.Group(), 0.74, 0.56, 0.11, 0);   // نجمة على أول بنسة
            for (let i = 0; i < 5; i++) { const a = i / 5 * TAU + Math.PI / 2; sph(0.06, pink, Math.cos(a) * 0.07, Math.sin(a) * 0.07, 0, 1, 1, 0.5, st); }
            sph(0.06, pink, 0, 0, 0, 1, 1, 0.5, st);
            break;
        }
        case 6: {   // آذان قطة: مثلّثات مدوّرة بلون الشعر وداخلها وردي
            const hm = main;
            [-1, 1].forEach((s) => {
                const g = new THREE.Group(); g.position.set(s * 0.5, HR.y * 0.78, -0.05); g.rotation.set(-0.1, 0, -s * 0.38); head.add(g);   // على جنب أعلى الرأس، مايلة لبرا
                const outer = mesh(new THREE.ConeGeometry(0.27, 0.55, lite ? 6 : 14, 1), hm, 0, 0.22, 0); outer.scale.z = 0.5; g.add(outer);
                const inner = mesh(new THREE.ConeGeometry(0.16, 0.36, lite ? 6 : 14, 1), pink, 0, 0.19, 0.1); inner.scale.z = 0.25; g.add(inner);
                bob(g, 0.04, s);
            });
            break;
        }
        case 7: {   // نظارة دايرية على العيون: إطارين وجسر، وعدسة شفافة خفيفة، وذراعين لين جنب الرأس
            const lensM = new THREE.MeshStandardMaterial({ color: '#dff3ff', transparent: true, opacity: 0.18, roughness: 0.05, depthWrite: false }); mats.push(lensM);
            const EY = -0.17, R = 0.2;
            [-1, 1].forEach((s) => {
                const x = s * 0.33, z = faceZ(x, EY, 0.07);
                const fr = onFace(mesh(new THREE.TorusGeometry(R, 0.028, 8, lite ? 16 : 32), main, x, EY, z)); head.add(fr);
                const ln = onFace(mesh(new THREE.CircleGeometry(R, lite ? 12 : 24), lensM, x, EY, z - 0.005)); ln.castShadow = false; head.add(ln);
                // الذراع: من طرف الإطار لين فوق الأذن على سطح الرأس
                const a = new THREE.Vector3(s * (0.33 + R), EY + 0.03, faceZ(s * (0.33 + R), EY + 0.03, 0.05)), b = new THREE.Vector3(s * (HR.x + 0.03), EY + 0.1, 0.05);
                head.add(mesh(new THREE.TubeGeometry(new THREE.LineCurve3(a, b), 1, 0.022, 6, false), main, 0, 0, 0));
            });
            const br = new THREE.Vector3(-0.13, EY + 0.04, faceZ(-0.13, EY + 0.04, 0.08)), br2 = new THREE.Vector3(0.13, EY + 0.04, faceZ(0.13, EY + 0.04, 0.08));
            head.add(mesh(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(br, new THREE.Vector3(0, EY + 0.09, faceZ(0, EY + 0.09, 0.09)), br2), 8, 0.024, 6, false), main, 0, 0, 0));
            break;
        }
        case 8: {   // تاج ورد: حلقة ورود صغيرة حوالين أعلى الرأس، بلونها وأبيض بالتناوب، ونص أصفر، وأوراق خضرا بينها
            const g = new THREE.Group(); g.position.set(0, HR.y * 0.6, -0.04); g.rotation.x = 0.3; head.add(g);
            const RX2 = HR.x * 0.86 + 0.24, RZ2 = HR.z * 0.86 + 0.26, N = lite ? 8 : 11, white = S('#fbf7f0'), leafM = S('#5cbf6a');
            for (let i = 0; i < N; i++) {
                const a = i / N * TAU, f = new THREE.Group(); f.position.set(Math.sin(a) * RX2, 0, Math.cos(a) * RZ2);
                f.lookAt(f.position.clone().multiplyScalar(2)); g.add(f);   // الوردة وجهها للخارج
                const pm = i % 2 ? white : main;
                for (let j = 0; j < 5; j++) { const b = j / 5 * TAU; sph(0.1, pm, Math.cos(b) * 0.1, Math.sin(b) * 0.1, 0, 1, 1, 0.5, f); }
                sph(0.06, gold, 0, 0, 0.04, 1, 1, 0.6, f);
                const lf = sph(0.08, leafM, Math.sin(a + 0.29) * RX2 * 0.97, -0.07, Math.cos(a + 0.29) * RZ2 * 0.97, 0.6, 0.35, 1.3, g); lf.rotation.y = a;
            }
            break;
        }
    }
    // كل زينة: نجمع قطعها بمجسم واحد لكل مادة (تاج الورد ~90 قطعة ← 4) عشان ما تثقل الرسم بالرومات الكبيرة
    const added = head.children.slice(before), loose = added.filter((o) => o.isMesh);
    if (loose.length) { const gl = new THREE.Group(); loose.forEach((o) => { head.remove(o); gl.add(o); }); head.add(gl); mergeByMat(gl); }
    added.filter((o) => !o.isMesh).forEach(mergeByMat);
    });
    return sway;
}

/** يدمج كل القطع داخل المجموعة بمجسم واحد لكل مادة (بإحداثيات المجموعة)، فتتحرك المجموعة كلها مثل قبل */
function mergeByMat(g) {
    g.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), byMat = new Map(), m4 = new THREE.Matrix4();
    g.traverse((o) => {
        if (!o.isMesh) return;
        let geo = o.geometry.clone().applyMatrix4(m4.multiplyMatrices(inv, o.matrixWorld));
        if (geo.index) geo = geo.toNonIndexed();
        Object.keys(geo.attributes).forEach((k) => { if (k !== 'position' && k !== 'normal') geo.deleteAttribute(k); });
        (byMat.get(o.material) || byMat.set(o.material, []).get(o.material)).push(geo);
    });
    [...g.children].forEach((c) => g.remove(c));
    byMat.forEach((geos, m) => {
        const merged = mergeGeometries(geos, false); geos.forEach((x) => x.dispose());
        const o = new THREE.Mesh(merged, m); o.castShadow = !m.transparent; g.add(o);
    });
}

// ---------------------------------------------------------------- المسرح
/**
 * opts.onCue(k, data)   مؤثر صوتي لحظي بتوقيت اللقطة (mafia-sfx.js)
 * opts.onAmbience(mode) جو المكان الحالي: 'plaza-night' | 'plaza-day' | 'market' | 'room'
 */
export { buildChar, swayHair };   // لعارض الشخصيات
export function createStage(container, getFrame, opts) {
    opts = opts || {};
    const onCue = opts.onCue || (() => {}), onAmbience = opts.onAmbience || (() => {});
    // خفة: بدون antialias (الصورة تمر على composer فما كان له أثر أصلاً)، دقة أقل شوي، وظلال PCF عادية بدل الناعمة
    const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
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
    sky.shadow.mapSize.set(1024, 1024); Object.assign(sky.shadow.camera, { left: -18, right: 18, top: 18, bottom: -18, near: 1, far: 70 }); sky.shadow.bias = -0.0005;
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
    for (let i = 0; i < 450; i++) { const a = Math.random() * TAU, e = 0.12 + Math.random() * 1.3, r = 90; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
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
    const SPARKS = 50, sparkGeo = new THREE.BufferGeometry(), sparkPos = new Float32Array(SPARKS * 3), sparkSeed = [];
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
    // لمبة غرفة التحقيق: حمرا وهادية (توهّج خفيف بدل الإشعاع القوي)
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), new THREE.MeshBasicMaterial({ color: '#c8382e' })); bulb.position.y = -2.85; lampPivot.add(bulb);
    const spot = new THREE.SpotLight('#ff3b30', 40, 10, 0.62, 0.85, 1.1); spot.position.set(0, -2.8, 0); spot.castShadow = true; spot.shadow.mapSize.set(512, 512);
    const beam = new THREE.Mesh(new THREE.ConeGeometry(2.1, 2.9, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#ff3b30', transparent: true, opacity: 0.012, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    beam.position.y = -4.3; lampPivot.add(beam);
    const roomFill = new THREE.PointLight('#ffb36b', 6, 12, 1.4); roomFill.position.set(3, 3.5, 3); room.add(roomFill);
    const roomRim = new THREE.PointLight('#5f7bff', 5, 10, 1.4); roomRim.position.set(-3.5, 3, -3.5); room.add(roomRim);
    lampPivot.add(spot); const spotTarget = new THREE.Object3D(); spotTarget.position.set(0, -6, 0); lampPivot.add(spotTarget); spot.target = spotTarget;
    const detective = buildChar({ skin: 1 }, { outfit: 'detective' }); detective.root.position.set(0, 0, 1.35); detective.root.rotation.y = Math.PI; room.add(detective.root);
    const susp = buildChar({}, { outfit: 'shadow' }); susp.root.position.set(0, 0, -1.35); room.add(susp.root);
    [detective, susp].forEach((c) => c.root.add(mesh(GEO.stool, mat('#3a281c'), 0, 0.15, 0)));
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
    // مافيا ثاني وطبيب ثاني لمشهد الهدفين (لو المافيا اختلفوا وهاجموا شخصين)
    function makeMafioso() {
        const m = buildChar({}, { outfit: 'shadow' }); scene.add(m.root); m.root.visible = false;
        standUp(m);
        m.body.add(mesh(new THREE.ConeGeometry(0.78, 1.65, 20, 1, true), mat('#09090d', { side: THREE.DoubleSide, roughness: 1 }), 0, 0.82, 0));   // العباية
        const knife = new THREE.Group();
        knife.add(mesh(new THREE.BoxGeometry(0.05, 0.42, 0.11), mat('#d7dde6', { metalness: 0.9, roughness: 0.2 }), 0, -0.3, 0));
        knife.add(mesh(new THREE.BoxGeometry(0.07, 0.18, 0.07), mat('#2a1a10'), 0, 0, 0));
        knife.position.set(0, -0.56, 0); knife.scale.setScalar(1.3); m.armR.add(knife);
        return m;
    }
    const mafioso = makeMafioso(), mafioso2 = makeMafioso();
    const evilLight = new THREE.PointLight('#ff2a2a', 0, 7, 1.3); scene.add(evilLight);
    const doctor = buildChar({ skin: 2 }, { outfit: 'doctor' }); scene.add(doctor.root); doctor.root.visible = false; standUp(doctor);
    const doctor2 = buildChar({ skin: 0 }, { outfit: 'doctor' }); scene.add(doctor2.root); doctor2.root.visible = false; standUp(doctor2);

    // ---------------------------------------------------------------- العيادة (الطبيب يحمي لاعب ما انهاجم)
    const CLINIC = new THREE.Vector3(-80, 0, 0);
    const clinic = new THREE.Group(); clinic.position.copy(CLINIC); scene.add(clinic); clinic.visible = false;
    const clinicBox = new THREE.Mesh(new THREE.BoxGeometry(10, 5.5, 10), new THREE.MeshStandardMaterial({ color: '#cfe7e4', roughness: 1, side: THREE.BackSide, map: canvasTex(256, 256, (ctx) => { ctx.fillStyle = '#d8ecea'; ctx.fillRect(0, 0, 256, 256); ctx.fillStyle = '#9fcfca'; ctx.fillRect(0, 150, 256, 106); ctx.fillStyle = '#7fbab4'; ctx.fillRect(0, 146, 256, 8); }) }));
    clinicBox.position.y = 2.75; clinicBox.receiveShadow = true; clinic.add(clinicBox);
    const tiles = mesh(new THREE.PlaneGeometry(9.9, 9.9), new THREE.MeshStandardMaterial({ color: '#e9f1f0', roughness: 0.6, map: canvasTex(256, 256, (ctx) => { ctx.fillStyle = '#eef5f4'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = '#c7d9d7'; ctx.lineWidth = 3; for (let i = 0; i <= 256; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); } }) }), 0, 0.01, 0);
    tiles.rotation.x = -Math.PI / 2; tiles.material.map.wrapS = tiles.material.map.wrapT = THREE.RepeatWrapping; tiles.material.map.repeat.set(3, 3); clinic.add(tiles);
    // السرير
    const bed = new THREE.Group(); bed.position.set(0, 0, -0.6); clinic.add(bed);
    bed.add(mesh(new THREE.BoxGeometry(1.5, 0.12, 3.0), mat('#9aa7b0', { metalness: 0.5, roughness: 0.4 }), 0, 0.75, 0));
    bed.add(mesh(new THREE.BoxGeometry(1.4, 0.22, 2.9), mat('#ffffff'), 0, 0.92, 0));
    bed.add(mesh(new THREE.BoxGeometry(1.42, 0.1, 1.9), mat('#5fb3a8'), 0, 1.32, 0.55));   // البطانية فوق المريض
    bed.add(mesh(new THREE.BoxGeometry(0.9, 0.18, 0.45), mat('#f4f6f8'), 0, 1.1, -1.2));    // المخدة
    bed.add(mesh(new THREE.BoxGeometry(1.5, 0.9, 0.08), mat('#8d9aa3', { metalness: 0.5 }), 0, 1.1, -1.5));
    [[-0.65, -1.35], [0.65, -1.35], [-0.65, 1.35], [0.65, 1.35]].forEach(([x, z]) => bed.add(mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.75, 8), mat('#8d9aa3', { metalness: 0.6 }), x, 0.37, z)));
    // المريض (مجهول: رمادي بدون اسم)
    const patient = buildChar({ skin: 2, hair: 0, hairC: 0, shirt: 0, pants: 0 }, {}); bed.add(patient.root);
    patient.root.position.set(0, 1.05, 0.1); patient.root.rotation.set(-Math.PI / 2, 0, 0);
    // جهاز نبض القلب + مغذي + خزانة بصليب أحمر
    const monitor = new THREE.Group(); monitor.position.set(1.4, 0, -1.6); clinic.add(monitor);
    monitor.add(mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 8), mat('#6b7780', { metalness: 0.6 }), 0, 0.8, 0));
    monitor.add(mesh(new THREE.BoxGeometry(0.85, 0.6, 0.12), mat('#20262b'), 0, 1.85, 0));
    const ecgCanvas = document.createElement('canvas'); ecgCanvas.width = 256; ecgCanvas.height = 160;
    const ecgTex = new THREE.CanvasTexture(ecgCanvas); ecgTex.colorSpace = THREE.SRGBColorSpace;
    const ecgScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.72, 0.46), new THREE.MeshBasicMaterial({ map: ecgTex })); ecgScreen.position.set(0, 1.85, 0.07); monitor.add(ecgScreen);
    monitor.rotation.y = -0.6;
    function drawEcg(u, strong) {
        const c = ecgCanvas.getContext('2d'); c.fillStyle = '#04120c'; c.fillRect(0, 0, 256, 160);
        c.strokeStyle = strong ? '#5dff9a' : '#2fb36a'; c.lineWidth = 4; c.beginPath();
        for (let x = 0; x <= 256; x += 2) { const ph = ((x + u / 6) % 128) / 128, beat = ph > 0.45 && ph < 0.55 ? Math.sin((ph - 0.45) / 0.1 * Math.PI * 2) * (strong ? 60 : 30) : 0; const y = 80 - beat; x ? c.lineTo(x, y) : c.moveTo(x, y); }
        c.stroke(); c.fillStyle = strong ? '#5dff9a' : '#2fb36a'; c.font = 'bold 28px sans-serif'; c.fillText(strong ? '♥ 82' : '♥ 41', 150, 40); ecgTex.needsUpdate = true;
    }
    const iv = new THREE.Group(); iv.position.set(-1.3, 0, -1.4); clinic.add(iv);
    iv.add(mesh(new THREE.CylinderGeometry(0.03, 0.03, 2.2, 8), mat('#9aa7b0', { metalness: 0.6 }), 0, 1.1, 0));
    iv.add(mesh(new THREE.BoxGeometry(0.22, 0.32, 0.08), mat('#cfeaff', { transparent: true, opacity: 0.8 }), 0.12, 2.05, 0));
    const cabinet = mesh(new THREE.BoxGeometry(1.4, 2.0, 0.6), mat('#f2f5f6'), -3.2, 1.0, -4.4); clinic.add(cabinet);
    cabinet.add(mesh(new THREE.BoxGeometry(0.5, 0.14, 0.02), mat('#e2483d'), 0, 0.5, 0.31)); cabinet.add(mesh(new THREE.BoxGeometry(0.14, 0.5, 0.02), mat('#e2483d'), 0, 0.5, 0.31));
    const clinicLight = new THREE.PointLight('#fff6e8', 14, 14, 1.3); clinicLight.position.set(0.5, 4.6, 1.5); clinic.add(clinicLight);
    const clinicFill = new THREE.PointLight('#a8fff0', 5, 10, 1.4); clinicFill.position.set(-3, 3, 3); clinic.add(clinicFill);
    clinic.add(mesh(new THREE.BoxGeometry(2.4, 0.08, 0.5), new THREE.MeshBasicMaterial({ color: '#ffffff' }), 0.5, 5.45, 1.5));   // لمبة السقف
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
    marketKey.position.set(6, 16, 9); marketKey.castShadow = true; marketKey.shadow.mapSize.set(512, 512); marketKey.shadow.bias = -0.0004;
    market.add(marketKey); market.add(marketKey.target); marketKey.target.position.set(-2, 0, 0);
    // غبار وفراشات ليل تسبح بضوء الفوانيس
    const MOTES = 80, moteGeo = new THREE.BufferGeometry(), motePos = new Float32Array(MOTES * 3), moteSeed = [];
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
    // الضحية بالسوق: نسخة واقفة من شخصية اللاعب (بدون اسم) — خانتين لو الهدف شخصين
    const walkers = [null, null], walkerKeys = ['', ''];
    function marketWalker(look, i) {
        i = i || 0;
        const key = JSON.stringify(look || {});
        if (walkers[i] && walkerKeys[i] === key) return walkers[i];
        if (walkers[i]) market.remove(walkers[i].wrap);
        const w = buildChar(look); w.sit(false); walkerKeys[i] = key; walkers[i] = w;
        w.wrap = new THREE.Group(); w.wrap.add(w.root); market.add(w.wrap);
        w.root.userData.base = w.mats.map((m) => m.color.clone());
        return w;
    }
    function walkPose(c, t, amp) {
        const w = Math.sin(t);
        c.legs[0].hip.rotation.x = w * amp; c.legs[1].hip.rotation.x = -w * amp;
        c.legs[0].knee.rotation.x = Math.max(0, -w) * amp; c.legs[1].knee.rotation.x = Math.max(0, w) * amp;
        c.armL.rotation.set(-w * amp * 0.8, 0, -0.2); c.armR.rotation.set(w * amp * 0.8, 0, 0.2);
        swayHair(c, performance.now() / 1000, amp * 1.5);   // الشعر واللبس يتحركون مع المشي
    }
    function standPose(c) { c.legs.forEach((l) => { l.hip.rotation.x = 0; l.knee.rotation.x = 0; }); swayHair(c, performance.now() / 1000, 0); }
    const mw = (x, y, z) => new THREE.Vector3(MARKET.x + x, MARKET.y + y, MARKET.z + z);   // من إحداثيات السوق للعالم

    // ---------- توقيتات مشهد الهجوم (ms من بداية اللقطة — مدتها SHOT.attack=10000 بالخادم)
    // 0 تأسيس: الضحية تمشي بالسوق · 3200 الزقاق: عيون حمرا · 4400 المافيا يلحقه · 6000 يحس فيه ويلتفت
    // · 6650 الطعنة · 7300–7900 يطيح · 8200 المافيا يهرب للزقاق
    const ATK = { walkEnd: 6000, eyes: 3200, out: 4000, follow: 4700, close: 6200, raise: 6000, strike: 6650, buckle: 6750, fall: 7300, down: 7900, flee: 8200, gone: 9800 };
    const WALK_FROM = -12, STOP_X = 0, STREET_Z = 0.6;
    const PAIR_DZ = 1.25, PAIR_DU = 320;   // الهدف الثاني: حارة ورا الأول بـ1.25م ومتأخر عنه 0.32ث
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
        // العلاج: خطوات الطبيب، ووقت العلاج نبض يقوى
        const heal = [{ t: 0, k: 'whoosh', g: 0.5 }];
        for (let t = 100; t < 1900; t += 260) heal.push({ t, k: 'step', g: 0.35, pan: 0.2 });
        heal.push({ t: 2100, k: 'heal' }, { t: 2700, k: 'heart', g: 0.35 }, { t: 3400, k: 'heart', g: 0.5 }, { t: 4300, k: 'rise' });
        return {
            heal, noheal: [{ t: 0, k: 'whoosh', g: 0.4 }, { t: 600, k: 'owl' }],
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
    const CONF = 160, confGeo = new THREE.BufferGeometry(), confPos = new Float32Array(CONF * 3), confCol = new Float32Array(CONF * 3), confSeed = [];
    const confPal = ['#ffd34d', '#ff5a7a', '#4dc3ff', '#7dff9a', '#c18cff'].map((c) => new THREE.Color(c));
    for (let i = 0; i < CONF; i++) { confSeed.push({ x: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16, sp: 1 + Math.random() * 1.5, off: Math.random() * 10, w: Math.random() * TAU }); const c = confPal[i % confPal.length]; confCol.set([c.r, c.g, c.b], i * 3); }
    confGeo.setAttribute('position', new THREE.BufferAttribute(confPos, 3)); confGeo.setAttribute('color', new THREE.BufferAttribute(confCol, 3));
    const confetti = new THREE.Points(confGeo, new THREE.PointsMaterial({ size: 0.18, vertexColors: true })); confetti.visible = false; scene.add(confetti);
    // ألعاب نارية: 6 انفجارات، كل واحد 60 شرارة (مواقعها وتوقيتها ثابتة من رقم الانفجار)
    const FW = 6, FWN = 60, fwGeo = new THREE.BufferGeometry(), fwPos = new Float32Array(FW * FWN * 3), fwCol = new Float32Array(FW * FWN * 3), fwDir = [];
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
                const stool = mesh(GEO.stool, mat('#4a3020'), 0, 0.15, 0); if (lite) stool.castShadow = false;
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
    function pull(r, h) { const extra = Math.max(0, outerR - 7.2); return [Math.max(r, outerR + 7) * 1.6, (h + extra * 1.1) * 1.65]; }   // الكاميرا أبعد وأعلى عشان كل اللاعبين يبانون بالبث
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
    const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.3, 0.35, 0.98);   // عتبة عالية: يتوهج اللي يطلع ضوء بس (لمبات، نار، عيون)
    composer.addPass(bloom);
    composer.addPass(new OutputPass());

    // إزاحة الصورة أفقياً (نسبة من العرض) عشان لوحات البث الجانبية ما تغطي اللاعبين — تتحرك بنعومة
    let viewW = 1, viewH = 1, viewShift = 0, viewShiftTarget = 0;
    function applyViewShift() {
        viewShift += (viewShiftTarget - viewShift) * 0.08;
        if (Math.abs(viewShift) < 0.0005 && viewShiftTarget === 0) { viewShift = 0; if (camera.view && camera.view.enabled) camera.clearViewOffset(); return; }
        camera.setViewOffset(viewW, viewH, viewShift * viewW, 0, viewW, viewH);
    }
    function resize() {
        const w = container.clientWidth || innerWidth, h = container.clientHeight || innerHeight;
        viewW = w; viewH = h;
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
        clinic.visible = !!(sh && sh.s.k === 'heal');
        const away = market.visible || room.visible || clinic.visible;
        info = { shot: sh ? sh.s.k : null, u: sh ? sh.u : 0, s: sh ? sh.s : null };
        if (sh && CUES[sh.s.k]) runCues('shot' + G.phaseAt + ':' + sh.s.at, sh.u, sh.s.k === 'result' && sh.s.victim ? CUES.resultVictim : CUES[sh.s.k]);
        onAmbience(market.visible ? 'market' : room.visible || clinic.visible ? 'room' : dayK > 0.5 ? 'plaza-day' : 'plaza-night');

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
            swayHair(c, T, speakers[id] ? 1.2 : 0);   // الشعر يتحرك (أكثر لما يتكلم)
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
            if (v.tag.visible) drawTag(v.tag, { photo: opts.photoOf ? opts.photoOf(id) : null, name: p.name, num: v.num, dead: revealDead && !isVerdict, role: shown ? p.role : null, team: shown ? p.team : null, ring: speakers[id] ? '#ffd34d' : null });
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
        mafioso.root.visible = false; mafioso2.root.visible = false; doctor.root.visible = false; doctor2.root.visible = false; walkers.forEach((w) => { if (w) w.wrap.visible = false; }); evilLight.intensity = 0; healPts.visible = false; healRing.visible = false; healLight.intensity = 0;
        cage.visible = false; verdictSpot.intensity = 0; confetti.visible = false; fireworks.visible = false; spotBeam.material.opacity = 0; dustRing.material.opacity = 0; phoneScreen.emissiveIntensity = 0;
        let cam = null;   // [px,py,pz, lx,ly,lz, snap]

        if (sh) {
            const s = sh.s, u = sh.u, vt = s.target && chars.get(s.target);
            // كاميرا عامة: إزاحة من نقطة أصل (الساحة/الغرفة/السوق) + اهتزاز يد خفيف
            const hh = (amp) => [Math.sin(u / 310) * amp + Math.sin(u / 170) * amp * 0.6, Math.sin(u / 260) * amp * 0.7, Math.cos(u / 230) * amp * 0.5];
            const camAt = (o, c, l, amp) => { const h = hh(amp == null ? 0.03 : amp); return [o.x + c[0] + h[0], o.y + c[1] + h[1], o.z + c[2] + h[2], o.x + l[0], o.y + l[1], o.z + l[2]]; };
            if (s.k === 'intro') {
                // نزول هادي على البلدة النايمة حول النار (حركة قليلة، بدون اهتزاز)
                const k = ease(u / s.dur), [R0, H0] = pull(15, 7.5);
                cam = camAt(ORIGIN, [lerp(-1.5, 0, k), lerp(H0 + 2.5, H0, k), lerp(R0 + 2.5, R0, k)], [0, lerp(3, 1, k), 0], 0);
            } else if (s.k === 'inspect') {
                // تصوير أبعد شوي: نبعّد الكاميرا عن نقطة النظر ×1.25 (وتبقى داخل الغرفة)
                const camRoom = (c, l, amp) => { const f = 1.25, x = Math.max(-4.5, Math.min(4.5, l[0] + (c[0] - l[0]) * f)), y = Math.min(5.4, l[1] + (c[1] - l[1]) * f), z = Math.max(-4.5, Math.min(4.5, l[2] + (c[2] - l[2]) * f)); return camAt(ROOM, [x, y, z], l, amp); };
                // غرفة التحقيق: تأسيس ← فوق كتف المحقق ← ضربة الطاولة ← وجه المشتبه ← الجوال يضيء بالنتيجة
                const slamU = 3250, swing = 0.1 + 0.18 * Math.exp(-Math.max(0, u - slamU) / 900) * (u > slamU ? 1 : 0);
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
                if (u > slamU && u < slamU + 220) shake = 0.1;
                qTag.material.opacity = 0.6 + Math.sin(u / 200) * 0.4;
                secH.rotation.z = -Math.floor(u / 1000) * TAU / 60 - 1.2; minH.rotation.z = -0.9;
                phoneScreen.emissiveIntensity = u > 5300 ? 1.6 + Math.sin(u / 90) * 0.6 : 0;
                hemi.intensity = 0.06; sky.intensity = 0;
                if (u < 1500) { const k = ease(span(u, 0, 1500)); cam = camRoom( [lerp(3.1, 2.8, k), lerp(3.4, 3.1, k), lerp(3.0, 2.7, k)], [0, 1.2, 0], 0.004); }
                else if (u < slamU) cam = camRoom( [1.0, 2.45, 3.35], [-0.1, 1.35, -1.35], 0.004);                 // فوق كتف المحقق
                else if (u < 3700) cam = camRoom( [2.3, 1.45, 0.9], [0, 1.1, 0.1], 0.004);                          // الضربة من الجنب
                else if (u < 5200) { const k = ease(span(u, 3700, 5200)); cam = camRoom( [lerp(0.85, 0.75, k), 1.8, lerp(0.65, 0.5, k)], [0, 1.5, -1.35], 0.003); }   // وجه المشتبه
                else { const k = ease(span(u, 5200, s.dur)); cam = camRoom( [lerp(1.8, 2.5, k), lerp(2.3, 2.9, k), lerp(2.2, 3.0, k)], [-0.5, 1.05, 0.2], 0.004); }   // الجوال يضيء
            } else if ((s.k === 'attack' || s.k === 'save') && vt) {
                // كل اللقطة بالسوق: الضحية نسخة واقفة من شخصية اللاعب، وما فيه أسماء فوق أحد
                // لو المافيا اختلفوا وهاجموا شخصين (target2): الثاني يمشي بحارة ورا الأول ومعه مافيا ثاني، والكاميرا تبعد شوي عشان يبانون الاثنين
                const vt2 = s.target2 && chars.get(s.target2), pair = !!vt2, Z = STREET_Z;
                const slots = [{ w: marketWalker(vt.p.look, 0), z: Z, du: 0, m: mafioso, id: s.target }];
                if (pair) slots.push({ w: marketWalker(vt2.p.look, 1), z: Z - PAIR_DZ, du: PAIR_DU, m: mafioso2, id: s.target2 });
                slots.forEach((sl) => {
                    const w = sl.w;
                    w.wrap.visible = true; w.root.position.set(0, 0, 0); w.root.rotation.set(0, 0, 0); standPose(w);
                    w.head.rotation.set(0, 0, 0); w.body.position.y = 0; w.body.rotation.set(0, 0, 0); setGrey(w, 0);
                    w.eyes.forEach((e) => { e.scale.y = e.userData.sy; e.visible = true; });
                    w.wrap.rotation.y = Math.PI / 2;   // وجهه باتجاه +x (اتجاه المشي)
                });
                // حركة كاميرا محمولة خفيفة (مو ثابتة جامدة)
                const hand = (amp) => [Math.sin(u / 310) * amp + Math.sin(u / 170) * amp * 0.6, Math.sin(u / 260) * amp * 0.7, Math.cos(u / 230) * amp * 0.5];
                const shotCam = (c, l, amp) => { const h = hand(amp || 0.03), c0 = mw(c[0] + h[0], c[1] + h[1], c[2] + h[2]), l0 = mw(l[0], l[1], l[2]); return [c0.x, c0.y, c0.z, l0.x, l0.y, l0.z]; };
                // تكبير الإطار لشخصين: الكاميرا ترجع لورا من نقطة النظر وتتوسّط بين الحارتين
                const fit = (c, zMid, k) => { if (!c || (!zMid && k === 1)) return c; return [c[3] + (c[0] - c[3]) * k, c[4] + (c[1] - c[4]) * Math.min(k, 1.15), c[5] + zMid + (c[2] - c[5]) * k, c[3], c[4], c[5] + zMid]; };
                dust.material.opacity = 0;
                if (s.k === 'attack') {
                    function attackSlot(w, m, Z, u, primary) {
                        // ---- الضحية: يمشي ويتلفّت على البسطات، يبطّي، يحس بأحد، يلتفت، الطعنة، تنهار ركبه، يطيح على وجهه
                        const vx = walkX(u), ph = walkPhase(u);   // u هنا وقت الخانة (الثاني متأخر شوي)
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
                        if (primary && dk > 0 && dk < 1) {
                            dust.material.opacity = 0.55 * (1 - dk);
                            for (let i = 0; i < DUST; i++) { const d = dustSeed[i]; dustPos[i * 3] = STOP_X + 0.9 + d.dx * dk; dustPos[i * 3 + 1] = 0.05 + d.dy * Math.sin(dk * Math.PI) * 0.6; dustPos[i * 3 + 2] = Z + d.dz * dk; }
                            dustGeo.attributes.position.needsUpdate = true;
                        }

                        // ---- المافيا: عيون بالزقاق ← يطلع ← يلحقه بخطوات هادية ← يرفع السكين ← يطعن ← يتلفّت ← يهرب
                        m.root.visible = u > ATK.eyes && u < ATK.gone;
                        const dzA = Z - STREET_Z, inAlley = new THREE.Vector3(-6, 0, -6.8 + dzA), mouth = new THREE.Vector3(-5.4, 0, -3.0 + dzA), back = new THREE.Vector3(STOP_X - 0.9, 0, Z + 0.35), deep = new THREE.Vector3(-6, 0, -10 + dzA);
                        const chase = new THREE.Vector3(vx - 1.7, 0, Z + 0.95);   // ورا الضحية ومايل لجهة الكاميرا عشان يبان فوق كتفه
                        let mp, dirV, gait = 0, pace = 120;
                        if (u < ATK.out) { mp = inAlley.clone(); dirV = new THREE.Vector3(0.3, 0, 1); }
                        else if (u < ATK.follow) { const k = ease(span(u, ATK.out, ATK.follow)); mp = inAlley.clone().lerp(mouth, k); dirV = mouth.clone().sub(inAlley); gait = 0.4; pace = 150; }
                        else if (u < ATK.close) { const k = ease(span(u, ATK.follow, ATK.close)); mp = mouth.clone().lerp(chase, k); dirV = new THREE.Vector3(1, 0, 0.15); gait = 0.38; pace = 140; }
                        else if (u < ATK.flee) { const k = ease(span(u, ATK.close, ATK.strike - 80)); mp = chase.clone().lerp(back, k); dirV = new THREE.Vector3(1, 0, 0); gait = k < 1 ? 0.3 : 0; }
                        else { const k = span(u, ATK.flee, ATK.gone); mp = k < 0.45 ? back.clone().lerp(mouth, ease(k / 0.45)) : mouth.clone().lerp(deep, ease((k - 0.45) / 0.55)); dirV = k < 0.45 ? mouth.clone().sub(back) : deep.clone().sub(mouth); gait = 0.85; pace = 65; }
                        m.root.position.copy(mw(mp.x, 0, mp.z));
                        m.root.rotation.set(0, Math.atan2(dirV.x, dirV.z), 0);
                        m.root.scale.setScalar(1.05);
                        standPose(mafioso); m.body.rotation.set(0, 0, 0);
                        if (gait) { walkPose(mafioso, u / pace, gait); m.root.position.y = Math.abs(Math.sin(u / pace)) * (u > ATK.flee ? 0.1 : 0.03); }
                        if (u > ATK.follow && u < ATK.strike) m.body.rotation.x = 0.16;                 // ماشي منحني يتسلل
                        const raise = ease(span(u, ATK.raise, ATK.raise + 500)), strike = ease(span(u, ATK.strike - 50, ATK.strike + 70));
                        if (u > ATK.raise && u < ATK.flee) {
                            m.armR.rotation.set(-0.5 - raise * 2.65 + strike * 2.3, 0, 0.15); m.armL.rotation.set(-0.4 - raise * 0.7 + strike * 0.3, 0, -0.25);
                            m.body.rotation.x = 0.1 - raise * 0.12 + strike * 0.28;
                        }
                        const scan = span(u, ATK.down, ATK.flee);   // بعد الطيحة يتلفّت يمين ويسار
                        m.head.rotation.set(0.15 - raise * 0.2, scan > 0 && scan < 1 ? Math.sin(scan * Math.PI * 2) * 0.7 : 0, 0);
                        const eyeK = u < ATK.out ? ease(span(u, ATK.eyes + 100, ATK.eyes + 600)) : 1;      // العيون تفتح بالظلام
                        m.eyes.forEach((e) => { e.material.emissiveIntensity = (0.2 + eyeK * 1.2) + raise * 1.6; e.scale.y = e.userData.sy * (u < ATK.eyes + 600 ? 0.25 + eyeK * 0.75 : 1); });
                        if (primary) evilLight.position.copy(m.root.position).add(new THREE.Vector3(0.6, 2.4, 0.8));
                        if (primary) evilLight.intensity = !m.root.visible ? 0 : u < ATK.out ? 1.5 * eyeK : 4 + raise * 7 + strike * 5;
                        if (u > ATK.strike && u < ATK.strike + 260) shake = Math.max(shake, 0.28);
                        if (u > ATK.down && u < ATK.down + 180) shake = Math.max(shake, 0.12);
                        return vx;

                    }
                    const vx = attackSlot(slots[0].w, mafioso, Z, u, true);
                    if (pair) attackSlot(slots[1].w, mafioso2, slots[1].z, u - PAIR_DU, false);

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
                    if (pair) cam = fit(cam, -PAIR_DZ / 2, 1.35);
                } else {
                    // الإنقاذ: الطبيب يركض بالسوق ← يتزحلق على ركبه جنبه ← هالة خضرا ونبض يرجع ← يقوم
                    // لو هدفين: اللي انحمى يجيه طبيب (ولو الاثنين انحموا يجون طبيبين مع بعض)، واللي ما انحمى يبقى طايح
                    const rescue = s.rescue || [s.target];
                    const saved = slots.filter((sl) => rescue.indexOf(sl.id) >= 0);
                    slots.forEach((sl) => {
                        const w = sl.w, ok = rescue.indexOf(sl.id) >= 0;
                        w.wrap.position.set(STOP_X, 0, sl.z);
                        const fall = ok ? 1 - ease(span(u, 4600, 5400)) : 1;
                        w.root.rotation.x = fall * Math.PI / 2 * 0.96;
                        if (fall > 0) { w.armL.rotation.set(-2.6 * fall, 0, -0.3); w.armR.rotation.set(-2.6 * fall, 0, 0.3); }
                        else { const cheer = span(u, 5400, 6000); w.armL.rotation.set(-0.4 - Math.sin(cheer * Math.PI) * 1.6, 0, -0.3); w.head.rotation.set(-0.15, 0.6, 0); }
                        if (!ok) setGrey(w, 0.6);   // ما لحقوا عليه
                    });
                    const docX = lerp(9, STOP_X + 0.8, ease(span(u, 0, 2000)));
                    saved.forEach((sl, j) => {
                        const d = j ? doctor2 : doctor, side = sl.z === Z ? 1 : -1;   // الطبيب الثاني من الجهة الثانية عشان ما يتداخلون
                        const p = mw(STOP_X + 0.8, 0, sl.z);   // مكان جسم المصاب على الأرض
                        d.root.visible = true; standPose(d); d.body.rotation.set(0, 0, 0);
                        const run = ease(span(u, j * 150, 2000 + j * 150));
                        const from = mw(9 + j * 0.9, 0, sl.z + 0.9 * side), to = mw(STOP_X + 0.8, 0, sl.z + 1.2 * side);
                        d.root.position.lerpVectors(from, to, run);
                        if (run < 1) { walkPose(d, u / 70, 0.85); d.root.position.y = Math.abs(Math.sin(u / 70)) * 0.12; d.body.rotation.x = 0.12; }
                        else d.armR.rotation.set(-1.4 + Math.sin(u / 160) * 0.15, 0, 0.15);
                        d.root.lookAt(run < 1 ? to.x : p.x, 0, run < 1 ? to.z : p.z);
                        const kneel = ease(span(u, 2000, 2300)) * (1 - ease(span(u, 5000, 5500)));
                        d.root.position.y -= kneel * 0.25; d.body.rotation.x += kneel * 0.15;
                    });
                    const healK = span(u, 2300, 5000);
                    if (healK > 0 && healK < 1 && saved.length) {
                        // الهالة على المصاب (أو بين الاثنين لو انحموا الاثنين، وأوسع)
                        const zc = saved.reduce((a, sl) => a + sl.z, 0) / saved.length, p = mw(STOP_X + 0.8, 0, zc), R = saved.length > 1 ? 1.6 : 1;
                        healPts.visible = true; healRing.visible = true;
                        healLight.position.set(p.x, 1.2, p.z); healLight.intensity = Math.sin(healK * Math.PI) * 25;
                        for (let i = 0; i < HEAL; i++) { const q = (healK * 2 + i / HEAL) % 1, a = i * 2.4 + u / 500; healPos[i * 3] = p.x + Math.cos(a) * (0.9 - q * 0.6) * R; healPos[i * 3 + 1] = q * 2.6; healPos[i * 3 + 2] = p.z + Math.sin(a) * (0.9 - q * 0.6) * R; }
                        healGeo.attributes.position.needsUpdate = true;
                        healRing.position.set(p.x, 0.05 + healK * 1.8, p.z); healRing.scale.setScalar((1 + healK) * R); healRing.material.opacity = 1 - healK;
                    }
                    if (u < 2000) cam = shotCam([docX - 3.4, 1.05, Z + 2.3], [docX, 1.15, Z + 0.9], 0.04);                       // يركض نحونا
                    else if (u < 4600) { const a = lerp(0.35, 1.5, ease(span(u, 2000, 4600))); cam = shotCam([0.8 + Math.cos(a) * 2.5, 4.3, Z + Math.sin(a) * 2.5], [0.8, 0.35, Z + 0.4], 0.01); }   // من فوق تدور
                    else { const k = ease(span(u, 4600, s.dur)); cam = shotCam([lerp(2.9, 2.4, k), lerp(0.6, 0.8, k), Z - lerp(2.2, 1.8, k)], [0.3, lerp(0.8, 1.35, k), Z + 0.3], 0.02); }   // يقوم: لقطة بطولية من تحت (جهة الزقاق عشان الطبيب ما يغطيه)
                    // هدفين: الكاميرا تتوسّط بين الاثنين وتبعد (ولو انحمى الثاني بس، تروح لحارته)
                    if (pair && u >= 4600) {   // يقومون: لقطة عالية من جهة الكاميرا تبين الاثنين (اللقطة المنخفضة كان الطبيب يغطي فيها)
                        const k = ease(span(u, 4600, s.dur)), zm = Z - PAIR_DZ / 2;
                        cam = shotCam([lerp(4.9, 4.2, k), lerp(2.6, 2.2, k), zm + lerp(1.4, 1.0, k)], [0.3, 0.75, zm], 0.02);   // من آخر الشارع: الأطباء على الجنبين والناجين بالنص
                    } else if (pair) { const zc = saved.length === 1 ? saved[0].z - Z : -PAIR_DZ / 2; cam = fit(cam, zc, saved.length === 1 ? 1.12 : 1.35); }
                }
            } else if (s.k === 'heal') {
                // العيادة: الطبيب يدخل ← يوقف جنب السرير ← هالة خضرا والنبض يقوى ← المريض يقعد (مجهول بدون اسم)
                setGrey(patient, 0.85);
                standPose(patient); patient.body.position.y = 0; patient.root.rotation.set(-Math.PI / 2, 0, 0); patient.root.position.set(0, 1.12, 1.0);
                const wake = ease(span(u, 4300, 4900));   // يصحى: يفتح عيونه ويرفع يده
                patient.eyes.forEach((e) => { e.scale.y = e.userData.sy * (0.15 + wake * 0.85); e.visible = true; });
                patient.head.rotation.set(0, Math.sin(u / 500) * 0.2 * wake, 0); patient.armR.rotation.set(-wake * 2.2 + Math.sin(u / 180) * 0.25 * wake, 0, 0.2);
                const cw = (x, y, z) => new THREE.Vector3(CLINIC.x + x, CLINIC.y + y, CLINIC.z + z);
                doctor.root.visible = true; standPose(doctor); doctor.body.rotation.set(0, 0, 0); setGrey(doctor, 0);
                const walk = ease(span(u, 0, 1800)), from = cw(3.6, 0, 3.6), to = cw(1.15, 0, -0.3), bedP = cw(0, 0, -0.5);
                doctor.root.position.lerpVectors(from, to, walk);
                if (walk < 1) { walkPose(doctor, u / 120, 0.6); doctor.root.position.y = Math.abs(Math.sin(u / 120)) * 0.05; }
                doctor.root.lookAt(walk < 1 ? to.x : bedP.x, 0, walk < 1 ? to.z : bedP.z);
                const treat = span(u, 1900, 4400) > 0 && u < 4400;
                if (treat) { doctor.armR.rotation.set(-1.3 + Math.sin(u / 160) * 0.18, 0, 0.15); doctor.armL.rotation.set(-1.0 + Math.cos(u / 190) * 0.12, 0, -0.15); doctor.body.rotation.x = 0.15; }
                const healK = span(u, 2000, 4500), hp = cw(0, 1.1, -0.5);
                if (healK > 0 && healK < 1) {
                    healPts.visible = true; healRing.visible = true;
                    healLight.position.set(hp.x, 2.2, hp.z); healLight.intensity = Math.sin(healK * Math.PI) * 20;
                    for (let i = 0; i < HEAL; i++) { const q = (healK * 2 + i / HEAL) % 1, a = i * 2.4 + u / 500; healPos[i * 3] = hp.x + Math.cos(a) * (0.8 - q * 0.5); healPos[i * 3 + 1] = 1.0 + q * 2.0; healPos[i * 3 + 2] = hp.z + Math.sin(a) * (1.3 - q * 0.8); }
                    healGeo.attributes.position.needsUpdate = true;
                    healRing.position.set(hp.x, 1.1 + healK * 1.4, hp.z); healRing.scale.setScalar(1 + healK); healRing.material.opacity = 1 - healK;
                }
                drawEcg(u, u > 3300);
                if (u < 1800) { const k = ease(span(u, 0, 1800)); cam = camAt(CLINIC, [lerp(-3.8, -3.4, k), 3.2, lerp(3.8, 3.4, k)], [0.6, 1.0, -0.4], 0.005); }   // تأسيس: الغرفة والسرير والطبيب داخل
                else if (u < 3300) cam = camAt(CLINIC, [-2.2, 2.3, 1.6], [0.3, 1.2, -0.6], 0.004);                                 // العلاج من جهة السرير
                else if (u < 4300) { const k = ease(span(u, 3300, 4300)); cam = camAt(CLINIC, [lerp(-0.7, -0.4, k), 2.3, lerp(-0.7, -0.9, k)], [1.4, 1.8, -1.6], 0.002); }   // لقطة قريبة: شاشة النبض تقوى
                else { const k = ease(span(u, 4300, s.dur)); cam = camAt(CLINIC, [lerp(-2.4, -3.0, k), 2.4, lerp(1.2, 1.8, k)], [0.2, 1.3, -0.9], 0.004); }   // المريض يصحى
            } else if (s.k === 'noheal') {
                // الطبيب ما اختار أحد: لقطة هادية للساحة النايمة
                const k = ease(u / s.dur), [R0, H0] = pull(14, 6.5);
                cam = camAt(ORIGIN, [lerp(1.5, -1.5, k), H0, R0], [0, 1.2, 0], 0);
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
                // لقطة وحدة هادية: من الجهة الثانية للنار، فوق رؤوس النايمين، والمافيا بالظلام قدّام
                // الكاميرا مايلة عن خط النار عشان المافيا يبان جنب النار مو وراها
                const qk = ease(u / s.dur), qr = (Math.max(outerR, 3.4) + 1.5) * lerp(1, 0.92, qk), qa = Math.atan2(-out.z, -out.x) + 0.75;
                const mp = mafioso.root.position;
                cam = camAt(ORIGIN, [Math.cos(qa) * qr, 3.6 + lift, Math.sin(qa) * qr], [mp.x * 0.85, 1.3, mp.z * 0.85], 0);
            } else if (s.k === 'result') {
                // الشروق: الشمس تطلع ورا السور، ولو فيه ضحية الكاميرا تمشي لمكانه
                const vv = s.victim && chars.get(s.victim), [R1, H1] = pull(15.5, 12);
                if (vv && u > 1600) {
                    const k = ease(span(u, 1600, s.dur)), p = seatWorld(vv, tmp), dir = tmp2.copy(p).normalize(), side = new THREE.Vector3(-dir.z, 0, dir.x);
                    const c = p.clone().addScaledVector(dir, -Math.min(3.6, vv.seat.r - 0.8) + k * 0.3).addScaledVector(side, 1.8);
                    cam = camAt(ORIGIN, [c.x, lerp(2.8, 2.2, k), c.z], [p.x, 0.5, p.z], 0);
                } else {
                    const k = ease(u / s.dur);
                    cam = camAt(ORIGIN, [lerp(-0.8, 0.8, k), lerp(H1, H1 - 2, k), lerp(R1, R1 - 1.5, k)], [0, lerp(2.5, 1, k), 0], 0);
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
                if (u > 2700 && u < 2900) shake = 0.1;
                v.group.position.y = lift * 16;
                verdictSpot.color.set('#fff2cc'); verdictSpot.position.set(p.x, 12, p.z); verdictSpot.target.position.set(p.x, 0, p.z); verdictSpot.intensity = 220 * spotK;
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
                // كاميرا وحدة شبه ثابتة: تقرب شوي وقت الارتطام والكشف، وتطالع فوق مع ارتفاع القفص
                const base = p.clone().addScaledVector(dir, -Math.min(4.2, v.seat.r - 0.8)).addScaledVector(side, 2.4);
                const push = ease(span(u, 2700, 5400)) * 0.6;
                const settle = ease(span(u, 8400, 11000));   // بعد ما يختفي القفص ترجع الكاميرا للساحة
                cam = at(base.clone().addScaledVector(dir, push).add(V3(0, 3.4 + lift * 4 * (1 - settle), 0)), V3(p.x, (u < 2700 ? 2.2 : 1.4) + lift * 11 * (1 - settle), p.z), 0);
            } else if (V) {
                // تعادل/ما أحد طلع: دوران هادي حول النار
                runCues('verdict' + G.phaseAt, now - G.phaseAt, [{ t: 300, k: 'tie' }]);
                orbit(t, 13, 6, 0.02);
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
                { const a = t * 0.035 + 0.6, [R, H] = pull(14, 4.5); setCam(Math.sin(a) * R, H, Math.cos(a) * R, 0, 5.5, 0); }   // تطالع فوق للألعاب النارية
            } else if (phase === 'night') {
                // جو كل دور ليل (بدون ما يكشف أحد): المافيا = عيون حمرا تحوم بالظلام، الطبيب = توهّج أخضر هادي، المحقق = كشاف يمسح الساحة
                const tn = G && G.turn;
                if (tn === 'mafia') {
                    const a = t * 0.04 + 1.2, R = Math.max(13, outerR + 4.5);
                    mafioso.root.visible = true; standPose(mafioso); mafioso.body.rotation.set(0.1, 0, 0);
                    mafioso.root.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); mafioso.root.rotation.set(0, Math.atan2(-Math.cos(a), -Math.sin(a)), 0);
                    mafioso.eyes.forEach((e) => { e.material.emissiveIntensity = 1.3 + Math.sin(t * 3) * 0.3; e.scale.y = e.userData.sy; });
                    evilLight.position.set(Math.cos(a) * (R - 1), 2.5, Math.sin(a) * (R - 1)); evilLight.intensity = 9;
                } else if (tn === 'doctor') {
                    healLight.position.set(0, 3, 0); healLight.intensity = 12 + Math.sin(t * 2) * 4;
                } else if (tn === 'detective') {
                    const a = t * 0.45, R = Math.max(3.4, Math.min(outerR, 9));
                    verdictSpot.color.set('#ff3b30'); verdictSpot.position.set(0, 16, 0); verdictSpot.target.position.set(Math.cos(a) * R, 0, Math.sin(a) * R); verdictSpot.intensity = 70;   // كشاف المحقق: أحمر وهادي
                }
                orbit(t, 12, 4.2, 0.015);   // دوران بطيء جداً: أهدى للمشاهد وأخف
            }
            else if (phase === 'vote') orbit(t, 13, 7.5, 0.02);
            else if (phase === 'day') orbit(t, 13.5, 6, 0.02);
            else orbit(t, 14, 6.5, 0.02);
        }
        if (cam) { camPos.set(cam[0], cam[1], cam[2]); camLook.set(cam[3], cam[4], cam[5]); }   // اللقطات محسوبة من الوقت مباشرة

        // كل تغيّر لقطة أو مرحلة = قطع مباشر للكاميرا (بدون طيران بين الأماكن)
        const shotKey = sh ? 'shot' + sh.s.at : phase + (G ? G.phaseAt : '');
        if (shotKey !== lastShotKey) { lastShotKey = shotKey; if (cam) { camPos.set(cam[0], cam[1], cam[2]); camLook.set(cam[3], cam[4], cam[5]); } else snapNext = true; }
        else if (snapNext) { snapNext = false; camPos.copy(camTarget); camLook.copy(lookTarget); }

        shake *= Math.pow(0.02, dt);
        camera.position.copy(camPos).add(new THREE.Vector3((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake));
        camera.lookAt(camLook);
        perf(dt);
        applyViewShift();
        composer.render();
    }
    // وضع خفيف تلقائي: لو متوسط الإطارات نزل تحت 45/ث (بعد أول 3ث) نطفي الظلال والتوهّج وننزل الدقة
    // (نفس فكرة ship3d.js بسفينة النجاة) — الجهاز الضعيف يكمل سلس بدل ما يتقطع
    // opts.lite (جوال اللاعب): يبدأ خفيف على طول — بدون ظلال وتوهّج وبدقة 1، عشان البطارية والحرارة
    let lite = false, pfT = 0, pfN = 0, pfS = 0;
    function perf(dt) {
        if (lite) return;
        if (!opts.lite) {
            pfT += dt; if (pfT < 3) return;
            pfN++; pfS += dt;
            if (pfS < 2) return;
            const fps = pfN / pfS; pfN = 0; pfS = 0;
            if (fps >= 45) return;
        }
        lite = true;
        renderer.shadowMap.enabled = false; bloom.enabled = false; renderer.setPixelRatio(1);
        scene.traverse((o) => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { m.needsUpdate = true; }); });
        resize();
    }
    requestAnimationFrame(frame);

    return {
        shotInfo: () => info,
        /** موضع لاعب على الشاشة (0..1) — لعرض عناصر HTML فوق الشخصية إذا احتجنا */
        setViewShift(f) { viewShiftTarget = Math.max(-0.25, Math.min(0.25, +f || 0)); },
        screenOf(id) { const v = chars.get(id); if (!v) return null; const p = v.group.position.clone(); p.y += 2.5; p.project(camera); return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; },
        // إيقاف كامل: يوقف الرسم ويرجّع ذاكرة كرت الشاشة (مهم بالجوال لما يقفل المشهد)
        dispose() { stopped = true; removeEventListener('resize', resize); onAmbience(null); try { composer.dispose && composer.dispose(); } catch (e) { } renderer.dispose(); try { renderer.forceContextLoss(); } catch (e) { } if (renderer.domElement.parentNode) renderer.domElement.parentNode.removeChild(renderer.domElement); }
    };
}
