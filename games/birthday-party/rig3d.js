// شخصية الحفلة بهيكل عظمي حقيقي (أسماء عظام Mixamo) — شخصية وحدة؛ الجمهور كله في crowd-rig.js.
// - الجسم SkinnedMesh واحد بجلد ناعم ينثني على المفاصل (الكوع، الركبة، الظهر)، والألوان vertex colors.
// - الهيكل بوضع T ومحاور كل عظمة = محاور الجسم (دوران الراحة صفر)، فالحركات المسجّلة (فرق الدوران
//   العالمي عن وضع T، من tools/extract-anims.mjs) تنطبق مباشرة: local = D(parent)⁻¹ · D(bone).
// - الحركات: 0 وقوف · 1 مشي · 2 سامبا (مسجّلة) · 3 تلويح · 4 تصفيق · 5 لفّة · 6 قفز · 7 قلب · 8 تمايل
//   · 9 رقصة 2 · 10 رقصة 3 · 11 تحية الأميرة (بالكود). التبديل بينها crossfade 0.25ث.
// - الشعر الطويل والذيلين والكيرلي الطويل والفستان سلاسل نوابض (Verlet) بالعالم الحقيقي، فتتأرجح مع
//   المشي واللف. update(dt, false) للبعيدين: بدون فيزياء (السلاسل تتعلق بوضع ثابت).
// - أوامر الرسم للضيف ≤ 6: الجسم، الراس (الوجه)، ملحقات الراس (طاقية الشعر والكعكة والإكسسوار)،
//   الخصل، التنورة، القبعة. صاحبة الحفلة مستثناة (تاجها الكبير وفستانها الفخم ولمعاتها).
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
import { SKIN, HAIR, OUTFIT, hash } from './crowd-common.js';
import { createGown } from './gown3d.js';

const T = THREE;
const HEIGHT = 1.6, BODY_UNITS = 1.8, BODY_SCALE = HEIGHT / BODY_UNITS, GIRL_SCALE = 1.06;
const HIPS_Y = .92, FPS = 15, FADE = .25;
export const RIG_HEIGHT = HEIGHT;

// أسماء الحركات بالعربي وأيقوناتها (نفس أرقام السيرفر)؛ girl = لصاحبة الحفلة بس
export const ANIMS = [
  { id: 2, name: 'سامبا', icon: '💃' }, { id: 9, name: 'ديسكو', icon: '🕺' }, { id: 10, name: 'هيب هوب', icon: '🎶' },
  { id: 8, name: 'تمايل', icon: '🌊' }, { id: 5, name: 'لفّة', icon: '🌀' }, { id: 3, name: 'تلويح', icon: '👋' },
  { id: 4, name: 'تصفيق', icon: '👏' }, { id: 7, name: 'قلب', icon: '🫶' }, { id: 11, name: 'تحية الأميرة', icon: '👑', girl: true },
];
export const JUMP = 6;

// ---- الهيكل: [الاسم، الأب، x، y، z] بوحدات الجسم (الطول 1.8 قبل التصغير). Left = يسار الشخصية = +X ----
const BONE_DEFS = [['Hips', null, 0, HIPS_Y, 0], ['Spine', 'Hips', 0, .1, 0], ['Spine1', 'Spine', 0, .1, 0], ['Spine2', 'Spine1', 0, .1, 0],
  ['Neck', 'Spine2', 0, .12, 0], ['Head', 'Neck', 0, .08, 0]];
for (const [S, sd] of [['Left', 1], ['Right', -1]]) BONE_DEFS.push(
  [S + 'Shoulder', 'Spine2', sd * .05, .09, 0], [S + 'Arm', S + 'Shoulder', sd * .1, 0, 0], [S + 'ForeArm', S + 'Arm', sd * .25, 0, 0], [S + 'Hand', S + 'ForeArm', sd * .22, 0, 0],
  [S + 'UpLeg', 'Hips', sd * .085, -.03, 0], [S + 'Leg', S + 'UpLeg', 0, -.42, 0], [S + 'Foot', S + 'Leg', 0, -.4, 0], [S + 'ToeBase', S + 'Foot', 0, -.04, .11]);
const BONES = BONE_DEFS.map(b => b[0]);
const PARENT = Object.fromEntries(BONE_DEFS.map(b => [b[0], b[1]]));
const REST = Object.fromEntries(BONE_DEFS.map(b => [b[0], new T.Vector3(b[2], b[3], b[4])]));
const WORLD_REST = {}; for (const [n, p] of BONE_DEFS) WORLD_REST[n] = REST[n].clone().add(p ? WORLD_REST[p] : new T.Vector3());
// اتجاه كل عظمة وقت الراحة (لعظمتها الابن) — للتصويب بالحركات المكتوبة بالكود
const CHILD = { Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head' };
for (const S of ['Left', 'Right']) Object.assign(CHILD, { [S + 'Shoulder']: S + 'Arm', [S + 'Arm']: S + 'ForeArm', [S + 'ForeArm']: S + 'Hand', [S + 'UpLeg']: S + 'Leg', [S + 'Leg']: S + 'Foot', [S + 'Foot']: S + 'ToeBase' });
const restDir = b => CHILD[b] ? REST[CHILD[b]].clone().normalize() : (b.endsWith('Hand') ? new T.Vector3(b.startsWith('Left') ? 1 : -1, 0, 0) : new T.Vector3(0, 1, 0));

// ================= الحركات بالكود =================
// وضعية = دوران محلي لكل عظمة + موقع الورك. aim(): يوجّه العظمة لاتجاه بإحداثيات الجسم (قدام +Z، فوق +Y، يسار +X)
const _q = new T.Quaternion(), _q2 = new T.Quaternion(), _v = new T.Vector3(), _e = new T.Euler();
function newPose() { const q = {}; for (const b of BONES) q[b] = new T.Quaternion(); return { q, hips: new T.Vector3(0, HIPS_Y, 0) }; }
function globalQ(P, b, out = new T.Quaternion()) { out.identity(); const chain = []; for (let x = b; x; x = PARENT[x]) chain.unshift(x); for (const x of chain) out.multiply(P.q[x]); return out; }
function euler(P, b, x, y, z) { P.q[b].setFromEuler(_e.set(x, y, z, 'YXZ')); }
function aim(P, b, dx, dy, dz) {
  const par = PARENT[b] ? globalQ(P, PARENT[b], _q2) : _q2.identity();
  _q.setFromUnitVectors(restDir(b), _v.set(dx, dy, dz).normalize());
  P.q[b].copy(par.invert()).multiply(_q);
}
// ذراع: اتجاه العضد ثم الساعد (sd = 1 يسار، -1 يمين)
function arm(P, sd, u, f) { const S = sd > 0 ? 'Left' : 'Right'; aim(P, S + 'Arm', u[0] * sd, u[1], u[2]); aim(P, S + 'ForeArm', f[0] * sd, f[1], f[2]); }
function leg(P, sd, th, sh, ft = [0, -.35, 1]) { const S = sd > 0 ? 'Left' : 'Right'; aim(P, S + 'UpLeg', th[0] * sd, th[1], th[2]); aim(P, S + 'Leg', sh[0] * sd, sh[1], sh[2]); aim(P, S + 'Foot', ft[0], ft[1], ft[2]); }
const relaxedArms = (P, k = 0) => { for (const sd of [1, -1]) arm(P, sd, [.22, -1, .04 + k * sd], [.12, -1, .22]); };
const standLegs = P => { for (const sd of [1, -1]) leg(P, sd, [.02, -1, 0], [0, -1, -.02]); };
// الركبة تنثني (b من 0 لـ 1) والورك ينزل بقدرها
function bend(P, b, sd = 0) {
  for (const s of [1, -1]) { const k = b * (sd ? (s === sd ? 1.4 : .6) : 1); leg(P, s, [.03, -1, .55 * k], [0, -1, -.6 * k]); }
  P.hips.y = HIPS_Y - .84 * (1 - Math.cos(Math.atan(.55 * b))) - .03 * b;
}

const TAU = Math.PI * 2, wave = (t, f = 1, ph = 0) => Math.sin(t * TAU * f + ph);
// كل حركة: [المدة، دالة الوضعية (t, P)]
const CODED = {
  0: [3, (t, P) => { relaxedArms(P); standLegs(P); euler(P, 'Spine', .02 + wave(t, 1 / 3) * .015, 0, 0); euler(P, 'Head', wave(t, 1 / 3, 1) * .03, wave(t, 1 / 3) * .06, 0); }],
  1: [1, (t, P) => {
    const s = wave(t); for (const sd of [1, -1]) { const k = s * sd; leg(P, sd, [.02, -1, .45 * k], [0, -1, .45 * k - .35 * Math.max(0, -k) - .15]); arm(P, sd, [.2, -1, -.35 * k], [.1, -1, -.2 * k + .25]); }
    P.hips.y = HIPS_Y - .015 + Math.abs(wave(t, 2)) * .02; euler(P, 'Spine', .05, -s * .08, 0);
  }],
  2: [1, (t, P) => {
    const s = wave(t); bend(P, .25 + Math.max(0, s) * .25, s > 0 ? 1 : -1); P.hips.x = s * .05;
    euler(P, 'Hips', 0, s * .25, s * .08); euler(P, 'Spine', .04, -s * .18, -s * .07);
    for (const sd of [1, -1]) arm(P, sd, [.6, .4 + wave(t, 1, sd) * .3, .3], [.2, .9, .2]);
  }],
  3: [2, (t, P) => { relaxedArms(P); standLegs(P); arm(P, -1, [.45, .95, .12], [.15 + wave(t, 2) * .55, 1, .18]); euler(P, 'Head', 0, -.15, wave(t, .5) * .08); euler(P, 'Spine', 0, 0, -.04); }],
  4: [1, (t, P) => {
    const open = .5 + .5 * Math.cos(t * TAU * 2); standLegs(P); bend(P, .15 * (1 - open));
    for (const sd of [1, -1]) arm(P, sd, [.25, -.25, 1], [-.55 * (1 - open) + .3 * open, .3, 1]);
    euler(P, 'Head', .08 * (1 - open), 0, 0);
  }],
  5: [1.2, (t, P) => { standLegs(P); for (const sd of [1, -1]) arm(P, sd, [1, .15, 0], [1, .3, .1]); P.hips.y = HIPS_Y + Math.abs(wave(t)) * .02; euler(P, 'Head', -.12, 0, 0); }],
  6: [1, (t, P) => {
    // تجهيز ← قفزة ← هبوط
    let lift = 0, crouch = 0;
    if (t < .2) crouch = Math.sin(t / .2 * Math.PI / 2); else if (t < .7) { const f = (t - .2) / .5; lift = Math.sin(f * Math.PI); crouch = (1 - f) * .3; } else crouch = Math.sin((1 - (t - .7) / .3) * Math.PI / 2) * .8;
    bend(P, crouch * .7); P.hips.y += lift * .38;
    for (const sd of [1, -1]) { if (lift > 0) leg(P, sd, [.06, -1, .35 * lift], [0, -1, -.5 * lift]); arm(P, sd, [.35, lift > 0 ? 1 : -.4, .25], [.25, 1, .1]); }
    euler(P, 'Spine', crouch * .25, 0, 0);
  }],
  7: [2, (t, P) => { standLegs(P); for (const sd of [1, -1]) arm(P, sd, [.35, .5, .8], [-.6, .8, .3]); euler(P, 'Spine', 0, 0, wave(t, .5) * .05); euler(P, 'Head', .05, 0, wave(t, .5) * .12); }],
  8: [2, (t, P) => {
    const s = wave(t, .5); standLegs(P); P.hips.x = s * .05; euler(P, 'Hips', 0, 0, s * .06); euler(P, 'Spine', 0, 0, -s * .1); euler(P, 'Spine1', 0, 0, -s * .06);
    for (const sd of [1, -1]) arm(P, sd, [.4 + s * .4 * sd, 1, .1], [.1 + s * .5 * sd, 1, 0]); euler(P, 'Head', 0, 0, -s * .1);
  }],
  9: [1, (t, P) => {
    // ديسكو: اليمين تأشّر فوق وتحت بالتناوب، واليسار على الخصر
    const up = wave(t) > 0, s = wave(t); bend(P, .2 + Math.abs(s) * .15, up ? 1 : -1); P.hips.x = s * .04; euler(P, 'Hips', 0, s * .15, 0);
    arm(P, -1, up ? [.7, .9, .35] : [.7, -.75, .4], up ? [.6, 1, .4] : [.6, -.8, .5]); arm(P, 1, [.75, -.55, -.1], [-.7, .25, .35]);
    euler(P, 'Head', 0, up ? -.3 : .1, 0);
  }],
  10: [1, (t, P) => {
    // هيب هوب: الإيدين تنضخ فوق بالتناوب والركب تنط مع الإيقاع
    const b = Math.abs(wave(t, 2)); bend(P, .15 + b * .3);
    for (const sd of [1, -1]) { const u = wave(t, 1, sd > 0 ? 0 : Math.PI) > 0; arm(P, sd, u ? [.3, 1, .25] : [.55, -.1, .7], u ? [.15, 1, 0] : [.2, .9, .35]); }
    euler(P, 'Head', .15 * b, 0, 0); euler(P, 'Spine', .1 * b, 0, 0);
  }],
  11: [3.2, (t, P) => {
    // تحية الأميرة: رجل ورا والركب تنثني وانحناءة، والإيدين تمسك الفستان، ثم تقوم
    const f = t < 1 ? Math.sin(t * Math.PI / 2) : t < 2 ? 1 : Math.cos((t - 2) / 1.2 * Math.PI / 2);
    leg(P, -1, [.05, -1, -.4 * f], [0, -1, -.75 * f], [0, -.35 - .6 * f, 1]); leg(P, 1, [.03, -1, .45 * f], [0, -1, -.3 * f]);
    P.hips.y = HIPS_Y - .14 * f; P.hips.z = -.04 * f;
    euler(P, 'Spine', .3 * f, 0, 0); euler(P, 'Spine1', .1 * f, 0, 0); euler(P, 'Head', .25 * f, 0, .08 * f);
    for (const sd of [1, -1]) arm(P, sd, [.75, -.6, .2 + .1 * f], [.9, -.45, .35]);
  }],
};
const LOOPED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

function poseClip(name, dur, fn) {
  const n = Math.round(dur * FPS) + 1, times = new Float32Array(n), qs = Object.fromEntries(BONES.map(b => [b, new Float32Array(n * 4)])), hp = new Float32Array(n * 3);
  for (let k = 0; k < n; k++) {
    const t = k / FPS * (dur / ((n - 1) / FPS)); times[k] = t;
    const P = newPose(); fn(Math.min(t, dur - 1e-6) % dur, P);
    for (const b of BONES) { const q = P.q[b].normalize(); if (k) { const o = qs[b], j = (k - 1) * 4; if (o[j] * q.x + o[j + 1] * q.y + o[j + 2] * q.z + o[j + 3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w); } q.toArray(qs[b], k * 4); }
    P.hips.toArray(hp, k * 3);
  }
  // الإطار الأخير = الأول عشان اللف ما يقفز
  for (const b of BONES) qs[b].copyWithin((n - 1) * 4, 0, 4); hp.copyWithin((n - 1) * 3, 0, 3);
  const tracks = BONES.map(b => new T.QuaternionKeyframeTrack(b + '.quaternion', times, qs[b]));
  tracks.push(new T.VectorKeyframeTrack('Hips.position', times, hp));
  return new T.AnimationClip(name, dur, tracks);
}
const CLIPS = {}; for (const id in CODED) CLIPS[id] = poseClip('a' + id, ...CODED[id]);
let clipsVersion = 0;

// ---- الحركات المسجّلة: من JSON (فرق عالمي عن وضع T) إلى دوران محلي لهيكلنا ----
function mocapClip(name, data) {
  const fps = data.fps, n = Math.round(data.duration * fps) + 1, times = new Float32Array(n);
  for (let k = 0; k < n; k++) times[k] = k / fps;
  const D = b => data.tracks[b].q, out = {}, inv = new T.Quaternion(), q = new T.Quaternion();
  for (const b of BONES) {
    const arr = new Float32Array(n * 4), p = PARENT[b];
    for (let k = 0; k < n; k++) {
      q.fromArray(D(b), k * 4);
      if (p) { inv.fromArray(D(p), k * 4).invert(); q.premultiply(inv); }
      q.normalize();
      if (k && arr[(k - 1) * 4] * q.x + arr[(k - 1) * 4 + 1] * q.y + arr[(k - 1) * 4 + 2] * q.z + arr[(k - 1) * 4 + 3] * q.w < 0) q.set(-q.x, -q.y, -q.z, -q.w);
      q.toArray(arr, k * 4);
    }
    out[b] = new T.QuaternionKeyframeTrack(b + '.quaternion', times, arr);
  }
  const hp = Float32Array.from(data.tracks.Hips.p, v => v * HIPS_Y);
  return new T.AnimationClip(name, data.duration, [...Object.values(out), new T.VectorKeyframeTrack('Hips.position', times, hp)]);
}
// يحمّل السامبا والوقوف والمشي ويبدّلهم مكان النسخ المكتوبة بالكود (الشخصيات الموجودة تتحدث بنفسها)
export async function loadClips(baseUrl = './anims/') {
  const names = { samba: 2, idle: 0, walk: 1 }, got = {};
  await Promise.all(Object.keys(names).map(async k => {
    const r = await fetch(baseUrl + k + '.json'); if (!r.ok) throw new Error(k + ' ' + r.status);
    got[k] = CLIPS[names[k]] = mocapClip(k, await r.json());
  }));
  clipsVersion++;
  return got;
}

// ================= الجسم (SkinnedMesh واحد) =================
const BI = Object.fromEntries(BONES.map((b, i) => [b, i]));
// يضيف شكل للجسم: كل نقطة لها لون ووزن بين عظمتين (wf ترجع [عظمة1، عظمة2، وزن الثانية])
function bodyAdd(acc, geo, color, wf) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, nr = g.attributes.normal, c = new T.Color(color);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), [a, b, w] = wf(x, y, z);
    acc.pos.push(x, y, z); acc.nor.push(nr.getX(i), nr.getY(i), nr.getZ(i)); acc.col.push(c.r, c.g, c.b);
    acc.si.push(BI[a], BI[b || a], 0, 0); acc.sw.push(1 - (w || 0), w || 0, 0, 0);
  }
}
const smooth = (v, a, b) => Math.min(1, Math.max(0, (v - a) / (b - a)));
// وزن على طول سلسلة: joints = [[عظمة، موقع المفصل على المحور]...]، blend نصف عرض المنطقة الناعمة
function along(v, joints, blend) {
  for (let k = joints.length - 1; k > 0; k--) {
    const [b, at] = joints[k]; if (v >= at - blend) { const w = smooth(v, at - blend, at + blend); return w >= 1 || k === 0 ? [b, b, 0] : [joints[k - 1][0], b, w]; }
  }
  return [joints[0][0], joints[0][0], 0];
}
function tubeX(x0, x1, r0, r1, rings = 12, seg = 12, y0 = 0) { const g = new T.CylinderGeometry(1, 1, 1, seg, rings, false); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = p.getY(i) + .5, r = r1 + (r0 - r1) * f; p.setXYZ(i, x1 + (x0 - x1) * f, y0 + p.getX(i) * r, p.getZ(i) * r); } g.computeVertexNormals(); return g; }
function tubeY(y0, y1, r0, r1, rings = 14, seg = 12) { const g = new T.CylinderGeometry(1, 1, 1, seg, rings, false); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const f = p.getY(i) + .5, r = r1 + (r0 - r1) * f; p.setXYZ(i, p.getX(i) * r, y1 + (y0 - y1) * f, p.getZ(i) * r); } g.computeVertexNormals(); return g; }

function buildBody(L, role) {
  const girl = role === 'girl', pants = L.st === 1 && !girl, h = hash(L._n || 0);
  const out = L.o < 0 ? '#fff4f8' : OUTFIT[L.o], skin = SKIN[L.s];
  const shirt = girl ? (L.o < 0 ? '#5b2d8c' : new T.Color(out).multiplyScalar(.7)) : pants ? new T.Color(out).lerp(new T.Color('#ffffff'), .55) : new T.Color(out).lerp(new T.Color('#ffffff'), .2);
  const pantsC = new T.Color(out).multiplyScalar(.62), legC = pants ? pantsC : girl ? skin : '#f3d6dc', shoe = girl ? '#f2cf8e' : pants ? '#4a3a52' : OUTFIT[(h >>> 4) % OUTFIT.length];
  const acc = { pos: [], nor: [], col: [], si: [], sw: [] };
  // الجذع: من الحوض للرقبة، الوزن على طول الظهر
  const torso = new T.LatheGeometry([[.001, .8], [.13, .8], [.158, .88], [.146, .97], [.15, 1.05], [.17, 1.15], [.178, 1.24], [.15, 1.3], [.07, 1.345], [.001, 1.35]].map(([r, y]) => new T.Vector2(r, y)), 28);
  torso.rotateY(Math.PI); torso.scale(1, 1, .74); torso.computeVertexNormals(); // الدرزة ورا
  const spineW = (x, y) => {
    if (y > 1.27 && Math.abs(x) > .09) return ['Spine2', x > 0 ? 'LeftShoulder' : 'RightShoulder', smooth(Math.abs(x), .09, .16) * .6];
    return along(y, [['Hips', 0], ['Spine', 1.0], ['Spine1', 1.1], ['Spine2', 1.2]], .045);
  };
  // الحوض بلون البنطلون/الفستان، والصدر بلون القميص
  { const g = torso.toNonIndexed(), p = g.attributes.position;
    bodyAdd(acc, g, shirt, spineW);
    if (pants || girl) { const base = acc.col.length / 3 - p.count, pc = new T.Color(girl ? shirt : pantsC); for (let i = 0; i < p.count; i++) if (p.getY(i) < .95) acc.col.splice((base + i) * 3, 3, pc.r, pc.g, pc.b); } }
  // الرقبة
  bodyAdd(acc, tubeY(1.3, 1.47, .048, .044, 6, 10), skin, (x, y) => along(y, [['Spine2', 0], ['Neck', 1.34], ['Head', 1.44]], .03));
  for (const [S, sd] of [['Left', 1], ['Right', -1]]) {
    // الذراع: كم قصير ثم جلد، تنثني على الكوع والرسغ
    const armG = tubeX(sd * .1, sd * .66, .056, .036, 16, 12, WORLD_REST.LeftArm.y), ax = x => Math.abs(x);
    const armW = x => along(ax(x), [[S + 'Shoulder', 0], [S + 'Arm', .14], [S + 'ForeArm', .4], [S + 'Hand', .62]], .045);
    { const g = armG.toNonIndexed(), p = g.attributes.position; bodyAdd(acc, g, skin, armW);
      const base = acc.col.length / 3 - p.count, sc = new T.Color(shirt); for (let i = 0; i < p.count; i++) if (ax(p.getX(i)) < .27) acc.col.splice((base + i) * 3, 3, sc.r, sc.g, sc.b); }
    const sh = new T.SphereGeometry(.06, 12, 10); sh.scale(1.05, .95, .9); sh.translate(sd * .14, 1.29, 0); bodyAdd(acc, sh, shirt, () => [S + 'Shoulder', S + 'Arm', .55]);
    const hand = new T.SphereGeometry(.045, 12, 8); hand.scale(1.35, .55, .85); hand.translate(sd * .68, 0, .005); hand.translate(0, 1.31, 0); bodyAdd(acc, hand, skin, () => [S + 'Hand', S + 'Hand', 0]);
    const thumb = new T.SphereGeometry(.018, 8, 6); thumb.scale(1.4, 1, 1); thumb.translate(sd * .655, 1.312, .035); bodyAdd(acc, thumb, skin, () => [S + 'Hand', S + 'Hand', 0]);
    // الرجل: من الورك للكاحل، تنثني على الركبة
    const legG = tubeY(.9, .06, pants ? .088 : .076, pants ? .06 : .045, 18, 12); legG.translate(sd * .085, 0, 0);
    bodyAdd(acc, legG, legC, (x, y) => along(-y, [['Hips', -2], [S + 'UpLeg', -.93], [S + 'Leg', -.47], [S + 'Foot', -.07]], .05));
    const foot = new T.SphereGeometry(.058, 12, 8); foot.scale(1, .55, 1.9); foot.translate(sd * .085, .045, .05);
    bodyAdd(acc, foot, shoe, (x, y, z) => [S + 'Foot', S + 'ToeBase', smooth(z, .05, .11)]);
  }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.Float32BufferAttribute(acc.pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(acc.nor, 3));
  g.setAttribute('color', new T.Float32BufferAttribute(acc.col, 3));
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(acc.si, 4)); g.setAttribute('skinWeight', new T.Float32BufferAttribute(acc.sw, 4));
  return g;
}

// ================= الوجه (رسم بالكانفس، 3 حالات: مفتوح، رمشة، ضحكة) — مشترك حسب لون البشرة =================
const faceCache = new Map();
function faceTex(skin, kind) {
  const key = skin + kind; if (faceCache.has(key)) return faceCache.get(key);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d');
  g.fillStyle = skin; g.fillRect(0, 0, 512, 256);
  const cx = 128, cy = 136, lid = new T.Color(skin).multiplyScalar(.82).getStyle();
  for (const sx of [-1, 1]) { const gr = g.createRadialGradient(cx + sx * 30, cy + 22, 0, cx + sx * 30, cy + 22, 16); gr.addColorStop(0, 'rgba(240,110,130,.35)'); gr.addColorStop(1, 'rgba(240,110,130,0)'); g.fillStyle = gr; g.fillRect(cx + sx * 30 - 18, cy + 4, 36, 36); }
  for (const sx of [-1, 1]) {
    const ex = cx + sx * 20, ey = cy - 4;
    g.strokeStyle = 'rgba(60,32,20,.85)'; g.lineCap = 'round'; g.lineWidth = 3; g.beginPath(); g.arc(ex, ey - 3, 14, Math.PI * 1.2, Math.PI * 1.8); g.stroke(); // الحاجب
    if (kind === 'open') {
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey + 6, 9, 7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5a3420'; g.beginPath(); g.arc(ex, ey + 6, 5.5, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#140806'; g.beginPath(); g.arc(ex, ey + 6, 2.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(ex - 2, ey + 4, 1.6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#25120c'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(ex, ey + 6, 9.5, 7.5, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
    } else if (kind === 'blink') {
      g.fillStyle = lid; g.beginPath(); g.ellipse(ex, ey + 6, 9.5, 6, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#25120c'; g.lineWidth = 2.2; g.beginPath(); g.ellipse(ex, ey + 6, 9, 3, 0, Math.PI * .05, Math.PI * .95); g.stroke();
    } else { g.strokeStyle = '#25120c'; g.lineWidth = 2.6; g.beginPath(); g.arc(ex, ey + 9, 7, Math.PI * 1.15, Math.PI * 1.85); g.stroke(); } // ضحكة ^^
  }
  g.strokeStyle = 'rgba(150,80,60,.4)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy + 14, 3.5, Math.PI * .2, Math.PI * .8); g.stroke(); // الخشم
  if (kind === 'laugh') { g.fillStyle = '#9c2f4f'; g.beginPath(); g.moveTo(cx - 13, cy + 25); g.quadraticCurveTo(cx, cy + 46, cx + 13, cy + 25); g.closePath(); g.fill(); g.fillStyle = '#fff'; g.fillRect(cx - 9, cy + 25, 18, 4); }
  else { g.strokeStyle = '#c4566f'; g.lineWidth = 3; g.beginPath(); g.moveTo(cx - 10, cy + 26); g.quadraticCurveTo(cx, cy + 33, cx + 10, cy + 26); g.stroke(); }
  const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; faceCache.set(key, t); return t;
}

// ================= ملحقات الراس (هندسة بإحداثيات عظمة الراس؛ مركز الجمجمة (0, .14, 0) ونصف قطرها .17) =================
const HEAD_C = .14, HEAD_R = .17;
// أشكال crowd3d القديمة مرسومة لراس مركزه 1.55 ونصف قطره .3 — نحوّلها لمقاسنا
const fromOld = g => { g.translate(0, -1.55, 0); g.scale(HEAD_R / .3, HEAD_R / .3, HEAD_R / .3); g.translate(0, HEAD_C, 0); return g; };
function colored(geo, color) { const g = geo.index ? geo.toNonIndexed() : geo; const c = new T.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3); g.setAttribute('color', new T.BufferAttribute(a, 3)); g.deleteAttribute('uv'); return g; }
function merge(list) {
  const pos = [], nor = [], col = [];
  for (const g of list) { pos.push(...g.attributes.position.array); nor.push(...g.attributes.normal.array); col.push(...g.attributes.color.array); }
  const out = new T.BufferGeometry(); out.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); out.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); out.setAttribute('color', new T.Float32BufferAttribute(col, 3));
  return out;
}
function buildHeadGear(L, role) {
  const hairC = HAIR[L.h], parts = [], girl = role === 'girl';
  // طاقية الشعر: تغطي فوق وورا الراس، والغرة قدام
  const cap = new T.SphereGeometry(HEAD_R * 1.07, 30, 18, 0, TAU, 0, Math.PI * .58); cap.rotateX(-.32); cap.translate(0, HEAD_C + .012, -.012); parts.push(colored(cap, hairC));
  const back = new T.SphereGeometry(HEAD_R * 1.05, 24, 14, Math.PI * .1, Math.PI * .8, Math.PI * .35, Math.PI * .4); back.rotateY(Math.PI); back.translate(0, HEAD_C, -.01); parts.push(colored(back, hairC));
  if (L.hs === 2) { const bun = new T.SphereGeometry(.07, 14, 10); bun.translate(0, HEAD_C + .19, -.07); parts.push(colored(bun, hairC)); }
  if (L.hs === 3) for (const sd of [1, -1]) { const tie = new T.TorusGeometry(.028, .011, 6, 14); tie.rotateY(Math.PI / 2); tie.translate(sd * .17, HEAD_C + .02, -.045); parts.push(colored(tie, OUTFIT[(L.o + 3 + 12) % 12])); }
  if (L.hs === 4 || L.hs === 5) {
    // كيرلي: كرات صغيرة على الطاقية (أكثف للقصير)
    const n = L.hs === 4 ? 46 : 30;
    for (let k = 0; k < n; k++) {
      const a = k * 2.399, ph = .18 + (k / n) * (L.hs === 4 ? 1.75 : 1.2), r = HEAD_R * 1.1;
      const x = Math.cos(a) * Math.sin(ph) * r, y = HEAD_C + Math.cos(ph) * r * 1.02, z = Math.sin(a) * Math.sin(ph) * r - .01;
      if (z > .06 && y < HEAD_C + .06) continue; // ما تغطي الوجه
      const b = new T.IcosahedronGeometry(.036 + (k % 3) * .006, 1); b.translate(x, y, z); parts.push(colored(b, hairC));
    }
  }
  // الإكسسوار (صاحبة الحفلة عليها تاج: التاج الصغير وقبعة الحفلة ما ينلبسون)
  const acc = girl && (L.acc === 2 || L.acc === 5) ? 0 : L.hat > 0 && L.acc === 5 ? 0 : L.acc;
  const cone = (r, hh) => new T.ConeGeometry(r, hh, 10);
  if (acc === 1) { const a = cone(.08, .15); a.rotateZ(Math.PI / 2); a.translate(-.08, 0, 0); const b = cone(.08, .15); b.rotateZ(-Math.PI / 2); b.translate(.08, 0, 0); for (const g of [a, b, new T.SphereGeometry(.045, 8, 6)]) { g.rotateZ(.4); g.translate(.2, 1.84, -.02); parts.push(colored(fromOld(g), L.o >= 0 && OUTFIT[L.o] !== '#f4a3c0' ? '#f4a3c0' : '#c94f7e')); } }
  if (acc === 2) { const list = [new T.TorusGeometry(.2, .018, 6, 24, Math.PI), ...[-.12, 0, .12].map((x, k) => { const c = cone(.03, k === 1 ? .12 : .08); c.translate(x, (k === 1 ? .23 : .17), 0); return c; })]; for (const g of list) { g.rotateX(-.25); g.translate(0, 1.68, .06); parts.push(colored(fromOld(g), '#f2cf8e')); } }
  if (acc === 3) { for (let k = 0; k < 5; k++) { const p = new T.SphereGeometry(.05, 8, 6), a = k / 5 * TAU; p.translate(Math.cos(a) * .06, Math.sin(a) * .06, 0); p.rotateY(-1.1); p.translate(-.26, 1.74, .06); parts.push(colored(fromOld(p), '#ff7eb3')); } const c = new T.SphereGeometry(.035, 8, 6); c.rotateY(-1.1); c.translate(-.26, 1.74, .06); parts.push(colored(fromOld(c), '#ffd54a')); }
  if (acc === 4) { for (const x of [-.11, .11]) { const t = new T.TorusGeometry(.075, .014, 6, 18); t.translate(x, 1.58, .29); parts.push(colored(fromOld(t), '#2a1a24')); } const br = new T.CylinderGeometry(.01, .01, .07, 6); br.rotateZ(Math.PI / 2); br.translate(0, 1.58, .29); parts.push(colored(fromOld(br), '#2a1a24')); }
  if (acc === 5) { const c = cone(.15, .34); c.rotateZ(-.18); c.translate(.05, 2.0, -.02); parts.push(colored(fromOld(c), L.o >= 0 ? OUTFIT[(L.o + 6) % OUTFIT.length] : '#cdb6ef')); }
  return merge(parts);
}

// ================= القبعات (4 أنواع) — قطعة وحدة بخامتها =================
const TOP = HEAD_C + HEAD_R * .93;
function buildHat(kind, L) {
  const base = L.o >= 0 ? OUTFIT[(L.o + 5) % OUTFIT.length] : '#9fc6f0', parts = [];
  const cone = new T.ConeGeometry(.095, .27, 24, 8, true); cone.translate(0, .135, 0);
  if (kind === 1) {
    parts.push(colored(cone, base));
    for (let k = 0; k < 14; k++) { const y = .03 + (k % 5) * .045, a = k * 2.1, r = .095 * (1 - y / .27) + .003; const d = new T.SphereGeometry(.013, 6, 4); d.scale(1, 1, .4); d.lookAt(new T.Vector3(Math.cos(a), 0, Math.sin(a))); d.translate(Math.cos(a) * r, y, Math.sin(a) * r); parts.push(colored(d, k % 2 ? '#ffffff' : '#ffd54a')); }
  } else if (kind === 2) {
    const g = cone.toNonIndexed(), p = g.attributes.position, col = new Float32Array(p.count * 3), a = new T.Color('#ffffff'), b = new T.Color(base);
    for (let i = 0; i < p.count; i++) { const c = Math.floor(p.getY(i) / .045 + .5) % 2 ? a : b; col.set([c.r, c.g, c.b], i * 3); }
    g.setAttribute('color', new T.BufferAttribute(col, 3)); g.deleteAttribute('uv'); parts.push(g);
  } else if (kind === 3) {
    parts.push(colored(cone, '#f5d27a'));
    const star = new T.OctahedronGeometry(.035, 0); star.translate(0, .29, 0); parts.push(colored(star, '#fff2b0'));
  } else {
    parts.push(colored(cone, '#f48fb8'));
    // شراشيب على الحافة وشرايط من الرأس
    for (let k = 0; k < 18; k++) { const a = k / 18 * TAU, f = new T.ConeGeometry(.007, .05, 4); f.rotateX(Math.PI); f.translate(Math.cos(a) * .097, -.02, Math.sin(a) * .097); parts.push(colored(f, k % 2 ? '#ffffff' : '#c94f7e')); }
    for (let k = 0; k < 3; k++) { const r = new T.CylinderGeometry(.004, .004, .14, 4); r.rotateZ(.5 + k * .35); r.translate(Math.sin(.5 + k * .35) * -.05, .32, 0); parts.push(colored(r, ['#ffd54a', '#a9dcc8', '#cdb6ef'][k])); }
  }
  if (kind !== 3) { const pom = new T.IcosahedronGeometry(.03, 1); pom.translate(0, .28, 0); parts.push(colored(pom, kind === 4 ? '#ffffff' : '#ffd54a')); }
  const g = merge(parts); g.rotateZ(-.16); g.rotateX(-.08); g.translate(.02, TOP - .02, -.01);
  return g;
}

// ================= السلاسل (Verlet) =================
// كل سلسلة: نقاط بالعالم الحقيقي تتبع جذرها بطول ثابت، بجاذبية وتخميد
function makeChain(n, seg) { const p = [], o = []; for (let i = 0; i <= n; i++) { p.push(new T.Vector3()); o.push(new T.Vector3()); } return { n, seg, p, o, init: false }; }
const G = -9.8, _t = new T.Vector3(), _t2 = new T.Vector3(), _a = new T.Vector3(), _b = new T.Vector3();
function stepChain(c, start, hint, dt, physics, stiff, collide) {
  if (!physics || !c.init) {
    for (let i = 0; i <= c.n; i++) { c.p[i].copy(start).addScaledVector(hint, i * c.seg); if (collide) collide(c.p[i], i); c.o[i].copy(c.p[i]); }
    c.init = true; return;
  }
  c.p[0].copy(start); c.o[0].copy(start);
  for (let i = 1; i <= c.n; i++) { const p = c.p[i], o = c.o[i]; _t.copy(p).sub(o).multiplyScalar(.9); o.copy(p); p.add(_t); p.y += G * dt * dt; }
  for (let it = 0; it < 3; it++) for (let i = 1; i <= c.n; i++) {
    const a = c.p[i - 1], b = c.p[i];
    b.addScaledVector(_t2.copy(a).addScaledVector(hint, c.seg).sub(b), stiff * (1 - i / (c.n + 1))); // صلابة خفيفة باتجاه الجذر
    _t.copy(b).sub(a); const d = _t.length() || 1e-6; b.copy(a).addScaledVector(_t, c.seg / d);
    if (collide) collide(b, i);
  }
}
// يدفع النقطة برا كرة
function outSphere(p, c, r) { _t.copy(p).sub(c); const d = _t.length(); if (d < r) p.copy(c).addScaledVector(_t.divideScalar(d || 1), r); }
// يدفع النقطة برا كبسولة (قطعة a→b بنصف قطر r)
function outCapsule(p, a, b, r) {
  _t.copy(b).sub(a); const len2 = _t.lengthSq() || 1e-6, f = Math.max(0, Math.min(1, _t2.copy(p).sub(a).dot(_t) / len2));
  _t2.copy(a).addScaledVector(_t, f); _t.copy(p).sub(_t2); const d = _t.length(); if (d < r) p.copy(_t2).addScaledVector(_t.divideScalar(d || 1), r);
}

// شريط (خصلة) أو كرات (كيرلي) — كلهم بهندسة وحدة متغيرة
function strandMesh(chains, kind, width, mat) {
  const g = new T.BufferGeometry();
  if (kind === 'ribbon') {
    const per = chains[0].n + 1, pos = new Float32Array(chains.length * per * 2 * 3), idx = [];
    chains.forEach((c, s) => { const b = s * per * 2; for (let i = 0; i < c.n; i++) { const a = b + i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); } });
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setIndex(idx);
  } else {
    const ball = new T.IcosahedronGeometry(width, 1), bp = ball.attributes.position.array, per = chains[0].n, nb = chains.length * per, pos = new Float32Array(nb * bp.length);
    g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(new Float32Array(nb * bp.length), 3));
    const bn = ball.attributes.normal.array; for (let k = 0; k < nb; k++) g.attributes.normal.array.set(bn, k * bn.length);
    g.userData.ball = bp;
  }
  const m = new T.Mesh(g, mat); m.frustumCulled = false; return m;
}

// ================= الشخصية =================
export function makeRig({ look, role = 'guest', n = 0 } = {}) {
  const girl = role === 'girl', worldScale = BODY_SCALE * (girl ? GIRL_SCALE : 1);
  const root = new T.Group(); root.name = 'rig';
  const body = new T.Group(); body.scale.setScalar(worldScale); root.add(body);
  const bones = {};
  for (const [name, par, x, y, z] of BONE_DEFS) { const b = new T.Bone(); b.name = name; b.position.set(x, y, z); (par ? bones[par] : body).add(b); bones[name] = b; }
  const skeleton = new T.Skeleton(BONES.map(b => bones[b]));
  const bodyMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .62 });
  const gearMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: T.DoubleSide });
  const hairMat = new T.MeshStandardMaterial({ roughness: .45, side: T.DoubleSide });
  const skirtMat = new T.MeshStandardMaterial({ roughness: .5, side: T.DoubleSide });
  const headMat = new T.MeshStandardMaterial({ roughness: .55 });
  const headGeo = new T.SphereGeometry(HEAD_R, 32, 24); headGeo.scale(.92, 1.1, .98);
  const headMesh = new T.Mesh(headGeo, headMat); headMesh.position.set(0, HEAD_C, 0); bones.Head.add(headMesh);
  let bodyMesh = null, gear = null, hat = null, hatMat = null, strands = null, skirt = null, gown = null, crown = null, L = null;
  let hairChains = [], hairKind = null, skirtChains = [];

  function clearMesh(m) { if (!m) return; m.removeFromParent(); m.geometry.dispose(); }
  function setLook(look) {
    L = Object.assign({ _n: n }, look); if (girl) L.st = 0;
    root.updateMatrixWorld(true);
    // الجسم: نعيد بناء الهندسة بس (الهيكل نفسه ما يتغير)
    if (bodyMesh) { bodyMesh.geometry.dispose(); bodyMesh.geometry = buildBody(L, role); }
    else {
      // نربط على وضع الراحة (الحركات تتطبّق بعدين)
      const saved = BONES.map(b => [bones[b].position.clone(), bones[b].quaternion.clone()]);
      BONES.forEach(b => { bones[b].position.copy(REST[b]); bones[b].quaternion.identity(); });
      const prev = [root.position.clone(), root.quaternion.clone(), root.scale.clone()]; root.position.set(0, 0, 0); root.quaternion.identity(); root.scale.setScalar(1);
      root.updateMatrixWorld(true);
      bodyMesh = new T.SkinnedMesh(buildBody(L, role), bodyMat); bodyMesh.frustumCulled = false; body.add(bodyMesh); bodyMesh.bind(skeleton);
      root.position.copy(prev[0]); root.quaternion.copy(prev[1]); root.scale.copy(prev[2]);
      BONES.forEach((b, i) => { bones[b].position.copy(saved[i][0]); bones[b].quaternion.copy(saved[i][1]); });
    }
    faceKind = null;
    clearMesh(gear); gear = new T.Mesh(buildHeadGear(L, role), gearMat); bones.Head.add(gear);
    clearMesh(hat); if (hatMat) hatMat.dispose(); hat = hatMat = null;
    if (L.hat > 0 && !girl) {
      hatMat = L.hat === 3 ? new T.MeshPhysicalMaterial({ vertexColors: true, metalness: 1, roughness: .16, clearcoat: 1, emissive: '#4a3000', emissiveIntensity: .25, side: T.DoubleSide })
        : new T.MeshStandardMaterial({ vertexColors: true, roughness: .5, side: T.DoubleSide });
      hat = new T.Mesh(buildHat(L.hat, L), hatMat); bones.Head.add(hat);
    }
    // الخصل
    clearMesh(strands); strands = null; hairChains = []; hairKind = null;
    hairMat.color.set(HAIR[L.h]);
    if (L.hs === 1 || L.hs === 3 || L.hs === 5) {
      const add = (n, seg, x, y, z, w) => { const c = makeChain(n, seg * worldScale); c.anchor = new T.Vector3(x, y, z); c.w = w * worldScale; hairChains.push(c); };
      if (L.hs === 1) for (let k = 0; k < 26; k++) { const a = Math.PI * (.12 + .76 * k / 25) + Math.PI, r = HEAD_R * .98; add(6, girl ? .1 : .085, Math.cos(a) * r, HEAD_C + .05 - Math.abs(Math.cos(a)) * .04, Math.sin(a) * r * .9 - .02, .05); }
      if (L.hs === 3) for (const sd of [1, -1]) for (let k = 0; k < 3; k++) add(5, .07, sd * (.175 + k * .006), HEAD_C + .02 - k * .012, -.045 + (k - 1) * .016, .045);
      if (L.hs === 5) for (let k = 0; k < 18; k++) { const a = Math.PI * (.1 + .8 * k / 17) + Math.PI, r = HEAD_R * 1.02; add(4, .085, Math.cos(a) * r, HEAD_C + .03, Math.sin(a) * r * .92 - .02, 0); }
      hairKind = L.hs === 5 ? 'balls' : 'ribbon';
      strands = strandMesh(hairChains, hairKind, L.hs === 5 ? .042 * worldScale : 0, hairMat); body.add(strands);
    }
    // التنورة (الفستان العادي)؛ صاحبة الحفلة لها الفستان الفخم
    clearMesh(skirt); skirt = null; skirtChains = [];
    if (!girl && L.st === 0) {
      const SK = 18, SKN = 4; for (let j = 0; j < SK; j++) { const c = makeChain(SKN, .13 * worldScale); c.a = j / SK * TAU; skirtChains.push(c); }
      const geo = new T.BufferGeometry(), pos = new Float32Array((SKN + 1) * (SK + 1) * 3), idx = [];
      for (let i = 0; i < SKN; i++) for (let j = 0; j < SK; j++) { const a = i * (SK + 1) + j, b = a + SK + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setIndex(idx);
      skirt = new T.Mesh(geo, skirtMat); skirt.frustumCulled = false; body.add(skirt);
      skirtMat.color.set(L.o < 0 ? '#fff4f8' : OUTFIT[L.o]);
    }
    if (girl) {
      if (!gown) { gown = createGown(body); gown.attachTo(bones.Hips, HIPS_Y); }
      gown.setColor(L.o >= 0 ? OUTFIT[L.o] : null);
      if (!crown) crown = makeCrown(bones.Head);
    }
  }

  // ---- الحركة ----
  const mixer = new T.AnimationMixer(body);
  let cur = -1, curAction = null, ver = -1, speed = 1;
  const actions = {};
  function action(a) {
    if (ver !== clipsVersion) { for (const k in actions) { if (actions[k] !== curAction) mixer.uncacheAction(actions[k].getClip(), body); delete actions[k]; } ver = clipsVersion; }
    return actions[a] || (actions[a] = mixer.clipAction(CLIPS[a]).setLoop(LOOPED.has(a) ? T.LoopRepeat : T.LoopOnce, Infinity));
  }
  function play(a) {
    a = CLIPS[a] ? (a === 11 && !girl ? 0 : a) : 0;
    if (a === cur && ver === clipsVersion) return;
    const next = action(a); next.reset().setEffectiveTimeScale(a === 1 ? speed : 1).setEffectiveWeight(1).play();
    if (curAction && curAction !== next) curAction.crossFadeTo(next, FADE, false);
    // نسخة قديمة من الحركة (قبل تحميل المسجّلة) تختفي بعد الـ fade
    const old = curAction; if (old && old.getClip() !== next.getClip()) setTimeout(() => { if (old !== curAction) old.stop(); }, FADE * 1000 + 50);
    cur = a; curAction = next;
  }
  function setSpeed(mps) { speed = Math.max(.6, Math.min(1.9, mps / 1.3)); if (cur === 1 && curAction) curAction.setEffectiveTimeScale(speed); }

  // ---- الوجه: رمشة كل 3-5ث، والضحكة لمدة ----
  let faceKind = null, blinkT = 2 + (hash(n) % 300) / 100, exprT = 0, expr = 'laugh', time = 0;
  function express(kind, sec = 1.6) { expr = kind === 'laugh' || kind === 'smile' || kind === 'party' ? 'laugh' : 'open'; exprT = sec; }
  function face(dt) {
    blinkT -= dt; exprT -= dt;
    const k = exprT > 0 ? expr : blinkT < 0 ? 'blink' : 'open';
    if (blinkT < -.13) blinkT = 2.6 + Math.random() * 2.4;
    if (k !== faceKind) { const first = !headMat.map; faceKind = k; headMat.map = faceTex(SKIN[L.s], k); if (first) headMat.needsUpdate = true; }
  }

  // ---- الفيزياء ----
  const hq = new T.Quaternion(), hp = new T.Vector3(), hipsQ = new T.Quaternion(), hipsP = new T.Vector3(), chest = new T.Vector3(), headC = new T.Vector3(), hint = new T.Vector3(), start = new T.Vector3(), inv = new T.Matrix4();
  const legA = [new T.Vector3(), new T.Vector3()], legB = [new T.Vector3(), new T.Vector3()], legC = [new T.Vector3(), new T.Vector3()], lastRoot = new T.Vector3();
  function physics(dt, detail) {
    const sub = Math.min(dt, 1 / 30), on = detail && dt > 0;
    // انتقال مفاجئ (أول ظهور أو قفزة مكان) يعيد السلاسل
    root.getWorldPosition(_a); const jump = _a.distanceTo(lastRoot) > 1.5; lastRoot.copy(_a);
    if (jump) { hairChains.forEach(c => { c.init = false; }); skirtChains.forEach(c => { c.init = false; }); }
    bones.Head.getWorldQuaternion(hq); bones.Head.getWorldPosition(hp);
    headC.set(0, HEAD_C, 0); bones.Head.localToWorld(headC);
    bones.Spine2.getWorldPosition(chest); chest.y -= .02 * worldScale;
    inv.copy(body.matrixWorld).invert();
    if (strands) {
      const r = HEAD_R * worldScale * 1.08;
      const col = p => { outSphere(p, headC, r); outSphere(p, chest, .2 * worldScale); };
      for (const c of hairChains) {
        start.copy(c.anchor); bones.Head.localToWorld(start);
        hint.copy(c.anchor).setY(0).normalize().multiplyScalar(.25).applyQuaternion(hq); hint.y -= 1; hint.normalize();
        stepChain(c, start, hint, sub, on, .05, col);
      }
      const pa = strands.geometry.attributes.position, arr = pa.array;
      if (hairKind === 'ribbon') {
        let o = 0;
        for (const c of hairChains) {
          _b.copy(c.anchor).setY(0).normalize().applyQuaternion(hq); const side = _a.set(-_b.z, 0, _b.x).normalize();
          for (let i = 0; i <= c.n; i++) { const w = c.w * (1 - i / (c.n + 2)), p = c.p[i]; _t.copy(p).addScaledVector(side, -w).applyMatrix4(inv); arr[o++] = _t.x; arr[o++] = _t.y; arr[o++] = _t.z; _t.copy(p).addScaledVector(side, w).applyMatrix4(inv); arr[o++] = _t.x; arr[o++] = _t.y; arr[o++] = _t.z; }
        }
        pa.needsUpdate = true; if (detail || !strands.geometry.attributes.normal) strands.geometry.computeVertexNormals();
      } else {
        const bp = strands.geometry.userData.ball, L3 = bp.length; let o = 0;
        for (const c of hairChains) for (let i = 1; i <= c.n; i++) { _t.copy(c.p[i]).applyMatrix4(inv); const s = 1 + (i % 2) * .2; for (let k = 0; k < L3; k += 3) { arr[o++] = _t.x + bp[k] * s; arr[o++] = _t.y + bp[k + 1] * s; arr[o++] = _t.z + bp[k + 2] * s; } }
        pa.needsUpdate = true;
      }
    }
    if (skirt) {
      bones.Hips.getWorldPosition(hipsP); bones.Hips.getWorldQuaternion(hipsQ);
      for (let s = 0; s < 2; s++) { const S = s ? 'Right' : 'Left'; bones[S + 'UpLeg'].getWorldPosition(legA[s]); bones[S + 'Leg'].getWorldPosition(legB[s]); bones[S + 'Foot'].getWorldPosition(legC[s]); }
      const top = .05 * worldScale, r0 = .15 * worldScale, legR = .1 * worldScale;
      const col = (p, i) => { if (!i) return; _t.copy(p).sub(hipsP); const depth = Math.max(0, top - _t.y); _t.y = 0; const want = r0 + depth * .5, d = _t.length(); if (d < want) p.addScaledVector(_t.divideScalar(d || 1), want - d); for (let s = 0; s < 2; s++) { outCapsule(p, legA[s], legB[s], legR); outCapsule(p, legB[s], legC[s], legR * .8); } };
      for (const c of skirtChains) {
        _b.set(Math.cos(c.a), 0, Math.sin(c.a)).applyQuaternion(hipsQ); _b.y = 0; _b.normalize();
        start.copy(hipsP).addScaledVector(_b, r0); start.y += top;
        hint.copy(_b).multiplyScalar(.45); hint.y = -1; hint.normalize();
        stepChain(c, start, hint, sub, on, .08, col);
      }
      const SK = skirtChains.length, arr = skirt.geometry.attributes.position.array;
      for (let i = 0; i <= skirtChains[0].n; i++) for (let j = 0; j <= SK; j++) { _t.copy(skirtChains[j % SK].p[i]).applyMatrix4(inv); arr.set([_t.x, _t.y, _t.z], (i * (SK + 1) + j) * 3); }
      skirt.geometry.attributes.position.needsUpdate = true; if (detail || !skirt.geometry.attributes.normal) skirt.geometry.computeVertexNormals();
    }
  }

  // كيرلي قصير: يرتد مع حركة الراس (نابض على ارتفاع الطاقية)
  let bounceV = 0, bounceX = 0, lastHeadY = null;
  function bounce(dt) {
    if (L.hs !== 4 || dt <= 0) { gear.scale.set(1, 1, 1); return; }
    const y = hp.y; if (lastHeadY !== null) bounceV -= (y - lastHeadY) * 6; lastHeadY = y;
    bounceV += (-bounceX * 160 - bounceV * 9) * dt; bounceX += bounceV * dt; bounceX = Math.max(-.06, Math.min(.06, bounceX));
    gear.scale.set(1 - bounceX * .4, 1 + bounceX, 1 - bounceX * .4);
  }

  function update(dt, detail = true) {
    time += dt;
    if (ver !== clipsVersion && cur >= 0) { const a = cur; cur = -1; play(a); } // وصلت الحركات المسجّلة
    mixer.update(dt);
    root.updateMatrixWorld(true);
    physics(dt, detail);
    face(dt);
    bounce(detail ? dt : 0);
    if (gown) gown.update({ an: cur, phase: time * TAU }, dt);
    if (crown) crown.update(dt, detail);
  }

  function dispose() {
    mixer.stopAllAction(); mixer.uncacheRoot(body);
    for (const m of [bodyMesh, gear, hat, strands, skirt]) clearMesh(m);
    headGeo.dispose();
    [bodyMat, gearMat, hairMat, skirtMat, headMat, hatMat].forEach(m => m && m.dispose());
    if (gown) gown.dispose(); if (crown) crown.dispose();
    root.removeFromParent();
  }

  setLook(look || {});
  play(0);
  root.userData.rig = true;
  return { root, bones, setLook, play, setSpeed, update, express, dispose, get anim() { return cur; }, get look() { return L; } };
}

// ================= تاج صاحبة الحفلة: كبير بجواهر ولمعات وشرار =================
let glintTex = null;
function makeCrown(head) {
  const g = new T.Group(); g.position.set(0, HEAD_C + HEAD_R * .86, -.012); g.rotation.x = -.14; g.scale.setScalar(1.25); head.add(g);
  const gold = new T.MeshPhysicalMaterial({ color: '#f5d27a', metalness: 1, roughness: .1, clearcoat: 1, clearcoatRoughness: .05, emissive: '#6a4400', emissiveIntensity: .35 });
  const gem = new T.MeshPhysicalMaterial({ color: '#ff5fb0', roughness: 0, clearcoat: 1, emissive: '#ff2d8a', emissiveIntensity: .8 });
  const gem2 = new T.MeshPhysicalMaterial({ color: '#c9f3ff', roughness: 0, clearcoat: 1, emissive: '#7fd8ff', emissiveIntensity: .7 });
  const geos = [];
  const add = (geo, m, x = 0, y = 0, z = 0) => { geos.push(geo); const o = new T.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const R = .118;
  add(new T.CylinderGeometry(R, R * .94, .055, 40, 1, true), gold).material.side = T.DoubleSide;
  add(new T.TorusGeometry(R, .008, 8, 48), gold).rotation.x = Math.PI / 2;
  const top = add(new T.TorusGeometry(R * .98, .006, 8, 48), gold, 0, .028); top.rotation.x = Math.PI / 2;
  for (let i = 0; i < 10; i++) {
    const a = i / 10 * TAU, tall = i % 2 === 0 ? .15 : .095, x = Math.cos(a) * R, z = Math.sin(a) * R;
    add(new T.ConeGeometry(.02, tall, 8), gold, x, .028 + tall / 2, z);
    add(new T.SphereGeometry(.014, 10, 8), i % 2 ? gem2 : gem, x, .03 + tall, z);
    add(new T.OctahedronGeometry(.012, 0), i % 2 ? gem : gem2, x * 1.03, 0, z * 1.03);
  }
  // جوهرة الوسط الكبيرة قدام
  const big = add(new T.OctahedronGeometry(.03, 0), gem, 0, .03, R + .006); big.scale.set(1, 1.3, .55);
  if (!glintTex) { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), gr = x.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, '#fff'); gr.addColorStop(.15, 'rgba(255,240,200,.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)'); x.fillStyle = gr; x.fillRect(0, 0, 64, 64); x.strokeStyle = '#fff'; x.lineWidth = 2; x.beginPath(); x.moveTo(32, 2); x.lineTo(32, 62); x.moveTo(2, 32); x.lineTo(62, 32); x.stroke(); glintTex = new T.CanvasTexture(c); glintTex.colorSpace = T.SRGBColorSpace; }
  const glints = Array.from({ length: 8 }, (_, i) => { const s = new T.Sprite(new T.SpriteMaterial({ map: glintTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); const a = i / 8 * TAU; s.position.set(Math.cos(a) * R * 1.1, .05 + (i % 3) * .05, Math.sin(a) * R * 1.1); g.add(s); return s; });
  // شرار صغير يطلع من التاج ويطير
  const SP = 36, pos = new Float32Array(SP * 3), vel = new Float32Array(SP * 3), life = new Float32Array(SP), col = new Float32Array(SP * 3);
  const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(pos, 3)); sg.setAttribute('color', new T.BufferAttribute(col, 3));
  const sm = new T.PointsMaterial({ map: glintTex, size: .045, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending });
  const sparks = new T.Points(sg, sm); sparks.frustumCulled = false; g.add(sparks);
  let t = 0, next = 0;
  function update(dt, detail) {
    t += dt;
    glints.forEach((s, i) => { const k = Math.max(0, Math.sin(t * 2.6 + i * 1.9)) ** 8; s.material.opacity = k; s.scale.setScalar(.03 + k * .11); });
    gold.emissiveIntensity = .3 + Math.max(0, Math.sin(t * 1.7)) ** 4 * .4;
    if (!detail) return;
    for (let n = Math.random() < dt * 14 ? 1 : 0; n > 0; n--) { const k = next; next = (next + 1) % SP; const a = Math.random() * TAU; pos.set([Math.cos(a) * R, .06 + Math.random() * .1, Math.sin(a) * R], k * 3); vel.set([Math.cos(a) * .12, .18 + Math.random() * .2, Math.sin(a) * .12], k * 3); life[k] = .9; }
    for (let k = 0; k < SP; k++) { if (life[k] <= 0) { col.fill(0, k * 3, k * 3 + 3); continue; } life[k] -= dt; for (let j = 0; j < 3; j++) pos[k * 3 + j] += vel[k * 3 + j] * dt; const f = Math.max(0, life[k] / .9); col.set([f, f * .9, f * .6], k * 3); }
    sg.attributes.position.needsUpdate = true; sg.attributes.color.needsUpdate = true;
  }
  function dispose() { geos.forEach(x => x.dispose()); [gold, gem, gem2, sm].forEach(m => m.dispose()); glints.forEach(s => s.material.dispose()); sg.dispose(); g.removeFromParent(); }
  return { update, dispose };
}
