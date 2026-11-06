/**
 * شخصيات الأنمي المشتركة (VRM) — لأي لعبة على المنصة. الدليل الكامل: docs/CHARACTERS.md
 *
 * الموديلات: assets/characters/girl.vrm و assets/characters/boy.vrm (صممها صاحب المنصة بـ VRoid Studio،
 * ومخففة بـ tools/vrm-slim.py). أول من استخدمها: «حجرة ورقة مقص» (games/rock-paper-scissors/rps-scene.js).
 *
 * يحتاج بصفحة اللعبة importmap فيه: three (0.160.0) و three/addons/ و @pixiv/three-vrm (3.3.3).
 *
 * loadModels(base?) ← Promise<{ girl, boy } | null>: كل موديل ينحمّل مرة وحدة بالصفحة، وكل لاعب ياخذ نسخة
 *   (SkeletonUtils.clone: نفس الجيومتري والخامات والصور، فالذاكرة ما تتضاعف). base الافتراضي مجلد
 *   assets/characters/ نسبة لهذا الملف. لو فشل التحميل (المكتبة أو الملف) ترجع null، والفشل ما ينحفظ:
 *   نداء ثاني يعيد المحاولة (الألعاب تعيد كل كم ثانية).
 *
 * makeVrmRig(model, { n }) ← شخصية وحدة:
 *   root (Group تنضاف للمشهد) · bones (عظام بأسماء Mixamo: Hips, Spine, Head, RightArm, RightForeArm, RightHand ...)
 *   play(a): حركات حفلة الميلاد (getClip بـ birthday-party/rig3d.js): 0 وقوف · 1 مشي · 2 سامبا · 3 تلويح
 *     · 4 تصفيق · 5 لفّة · 6 قفز · 7 قلب · 8 تمايل · 9 ديسكو · 10 هيب هوب · 'win' رقصة الفوز (خاصة بالبنت وخاصة بالولد) مع تأثيراتها (قلوب / نجوم)
 *   setSpeed(mps) · update(dt) كل إطار · sync() بعد أي تعديل يدوي على bones (ينقل الوضعية للهيكل الفعلي)
 *   mood('smile'|'laugh'|'scared'|'sad'|'focus'): ملامح الوجه من تعابير الموديل نفسه، ورمشة تلقائية
 *   express(kind, sec): تعبير مؤقت ('laugh' أو 'open') · gesture(side, 'rock'|'paper'|'scissors'|'relax'): الأصابع
 *   hideHand(side, on): يخفي يد الموديل (لو اللعبة تركّب يد خاصة فيها) · skin: لون البشرة · dispose()
 *   الهيكل الموحّد بـ VRM (normalized) بوضع T ودوران راحة صفر، نفس هيكل rig3d، فنفس الحركات تنطبق.
 *   فيزياء الشعر والتنورة (spring bones) طافية عشان الأداء.
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getClip, getClipsVersion, POSE_KIT } from '../games/birthday-party/rig3d.js';

const MODELS_BASE = new URL('../assets/characters/', import.meta.url).href;

const T = THREE, TAU = Math.PI * 2, FADE = .25;
const RIG_HIPS = .92; // ارتفاع الورك بوحدات حركات الحفلة (HIPS_Y بـ rig3d.js)
const HEIGHT = { girl: 1.62, boy: 1.7 };
// لون بشرة الموديلين (لليد الكبيرة بالمواجهة)
const SKIN = { girl: '#f6e0d4', boy: '#f3dacb' };

// أسماء Mixamo (اللي تستخدمها الحركات و rps-scene.js) ← أسماء عظام VRM
const MAP = { Hips: 'hips', Spine: 'spine', Spine1: 'chest', Spine2: 'upperChest', Neck: 'neck', Head: 'head' };
for (const [S, s] of [['Left', 'left'], ['Right', 'right']]) Object.assign(MAP, {
    [S + 'Shoulder']: s + 'Shoulder', [S + 'Arm']: s + 'UpperArm', [S + 'ForeArm']: s + 'LowerArm', [S + 'Hand']: s + 'Hand',
    [S + 'UpLeg']: s + 'UpperLeg', [S + 'Leg']: s + 'LowerLeg', [S + 'Foot']: s + 'Foot', [S + 'ToeBase']: s + 'Toes',
});
const LOOPED = new Set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);

let VRMMod = null;
const cache = {};
export function loadModels(base = MODELS_BASE) {
    if (cache.p) return cache.p;
    cache.p = (async () => {
        const [{ GLTFLoader }, mod] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('@pixiv/three-vrm')]);
        VRMMod = mod;
        const loader = new GLTFLoader(); loader.register(p => new mod.VRMLoaderPlugin(p));
        const one = async (kind) => {
            const gltf = await loader.loadAsync(base + kind + '.vrm'), vrm = gltf.userData.vrm;
            mod.VRMUtils.rotateVRM0(vrm);
            vrm.scene.updateMatrixWorld(true);
            const box = new T.Box3().setFromObject(vrm.scene), height = box.max.y - box.min.y;
            const hipsY = vrm.humanoid.getNormalizedBoneNode('hips').getWorldPosition(new T.Vector3()).y;
            // التعابير: [{morph: [[اسم المجسم، رقم الهدف، الوزن]...]}] من بيانات الملف نفسه
            const json = gltf.parser.json, ex = json.extensions && json.extensions.VRMC_vrm && json.extensions.VRMC_vrm.expressions || {};
            const expr = {};
            for (const g of ['preset', 'custom']) for (const [name, e] of Object.entries(ex[g] || {})) {
                expr[name] = (e.morphTargetBinds || []).map(b => [json.nodes[b.node].name, b.index, b.weight == null ? 1 : b.weight]);
            }
            const rawNames = {}; for (const b of Object.values(MAP).concat(FINGER_BONES)) { const nd = vrm.humanoid.getRawBoneNode(b); if (nd) rawNames[b] = nd.name; }
            return { kind, vrm, height, hipsY, expr, rawNames, clips: new Map() };
        };
        const [girl, boy] = await Promise.all([one('girl'), one('boy')]);
        return { girl, boy };
    })().catch(() => { cache.p = null; return null; }); // الفشل ما ينحفظ: المحاولة الجاية تعيد التحميل
    return cache.p;
}

// الأصابع: [اسم، [عظام السلاميات]]
const FINGERS = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
const PARTS = { Thumb: ['Metacarpal', 'Proximal', 'Distal'], Index: ['Proximal', 'Intermediate', 'Distal'], Middle: ['Proximal', 'Intermediate', 'Distal'], Ring: ['Proximal', 'Intermediate', 'Distal'], Little: ['Proximal', 'Intermediate', 'Distal'] };
const FINGER_BONES = []; for (const s of ['left', 'right']) for (const f of FINGERS) for (const p of PARTS[f]) FINGER_BONES.push(s + f + p);
// ثني كل إصبع (0 مفرود، 1 مقبوض)
const GEST = {
    relax: { Thumb: .25, Index: .2, Middle: .25, Ring: .3, Little: .35 },
    rock: { Thumb: .85, Index: 1, Middle: 1, Ring: 1, Little: 1 },
    paper: { Thumb: 0, Index: 0, Middle: 0, Ring: 0, Little: 0 },
    scissors: { Thumb: .85, Index: 0, Middle: 0, Ring: 1, Little: 1 },
};
const SPREAD = { Index: .12, Middle: 0, Ring: -.1, Little: -.2 }; // فتحة الأصابع (المقص أوسع)
// الإبهام لكل سلامية [x, y, z] لليد اليمين (اليسار مرآة) — يلف على القبضة
export const WRIST = { v: Math.PI / 2 };
export const THUMB = [[-.6, -.4, 0], [-.6, -.4, 0], [-.6, -.4, 0]];

// ================================================================ رقصات الفوز (خاصة بكل شخصية)
// rig.play('win'): رقصة البنت أو الولد حسب الموديل. مكتوبة بالكود بنفس أدوات حركات الحفلة (POSE_KIT)،
// كل رقصة مقاطع تتبدّل بانتقال ناعم (آخر .22ث من كل مقطع يندمج بأول المقطع اللي بعده) وتتكرر بدون قفزة.
function seqPose(segs) {
    const K = POSE_KIT, W = .22, total = segs.reduce((a, s) => a + s[0], 0);
    const bounds = []; segs.reduce((a, sg) => (bounds.push(a), a + sg[0]), 0);
    return [total, (t, P) => {
        let i = 0, u = t; while (i < segs.length - 1 && u >= segs[i][0]) { u -= segs[i][0]; i++; }
        const [dur, fn] = segs[i]; fn(u, P);
        const r = dur - u;
        if (r < W) {
            const Pn = K.newPose(); segs[(i + 1) % segs.length][1](0, Pn);
            const x = 1 - r / W, k = x * x * (3 - 2 * x);
            for (const b of K.BONES) P.q[b].slerp(Pn.q[b], k);
            P.hips.lerp(Pn.hips, k);
        }
    }, bounds];
}
const DANCE_DEF = {
    // البنت «رقصة الفراشة»: خطوات جانبية وقلب باليدين فوق الراس ← أجنحة فراشة ترفرف ← بوسة للكاميرا ← لفّة باليه
    girl: () => {
        const { euler, arm, bend, standLegs, wave, HIPS_Y } = POSE_KIT, TAU2 = Math.PI * 2;
        return seqPose([
            [1.6, (u, P) => {
                const s = wave(u, 1.25), b = Math.abs(wave(u, 2.5));
                euler(P, 'Hips', 0, 0, s * .08); euler(P, 'Spine', .02, 0, -s * .1);
                bend(P, .1 + .14 * b, s > 0 ? 1 : -1); P.hips.x = s * .07;
                for (const sd of [1, -1]) arm(P, sd, [.35, .92, .18], [-.62, .72, .3]); // قلب فوق الراس
                euler(P, 'Head', .04, 0, -s * .16);
            }],
            [1.4, (u, P) => {
                const f = wave(u, 3), hop = Math.max(0, wave(u, 1.5));
                euler(P, 'Spine', -.06, 0, 0);
                standLegs(P); bend(P, .06 + .1 * (1 - hop)); P.hips.y = HIPS_Y - .02 + hop * .06;
                for (const sd of [1, -1]) arm(P, sd, [1, .15 + .45 * f, -.15], [1, .3 + .55 * f, -.1]); // أجنحة ترفرف
                euler(P, 'Head', -.12, 0, 0);
            }],
            [1.0, (u, P) => {
                const k = Math.min(1, u / .45), e = k * k * (3 - 2 * k);
                euler(P, 'Spine', .05 - .1 * e, -.15 * e, 0);
                standLegs(P); bend(P, .1, 1); P.hips.x = .04;
                arm(P, -1, [.25 + .1 * e, .35 - .55 * e, .9], [-.6 + 1 * e, .85 - .65 * e, .4 + .6 * e]); // من الشفايف لقدام
                arm(P, 1, [.75, -.55, -.1], [-.7, .25, .35]); // يد على الخصر
                euler(P, 'Head', -.05, -.15 * e, .12);
            }],
            [1.1, (u, P) => {
                const k = u / 1.1, e = k * k * (3 - 2 * k);
                euler(P, 'Hips', 0, -e * TAU2, 0);
                standLegs(P); P.hips.y = HIPS_Y + Math.sin(k * Math.PI) * .05;
                for (const sd of [1, -1]) arm(P, sd, [.18, 1, .05], [-.45, .9, .05]); // يدين فوق مثل الباليه
                euler(P, 'Head', -.15, 0, 0);
            }],
        ]);
    },
    // الولد «رقصة الملك»: فلوس ← قفزات انتصار بقبضة لفوق ← استعراض العضلات ← ينفض كتوفه بثقة
    boy: () => {
        const { euler, arm, leg, bend, standLegs, wave, HIPS_Y } = POSE_KIT;
        return seqPose([
            [1.6, (u, P) => {
                const s = wave(u, 2.5), h = wave(u, 1.25);
                euler(P, 'Hips', 0, 0, -h * .1); euler(P, 'Spine', .05, 0, h * .08); P.hips.x = h * .07;
                standLegs(P); bend(P, .12);
                for (const sd of [1, -1]) arm(P, sd, [.3 - .55 * h * sd, -.9, s * .55], [.2 - .5 * h * sd, -.8, s * .6]); // فلوس
                euler(P, 'Head', .05, h * .12, 0);
            }],
            [1.2, (u, P) => {
                const ph = (u / .6) % 1, up = Math.sin(ph * Math.PI), side = u < .6 ? -1 : 1;
                standLegs(P); bend(P, .3 * (1 - up)); P.hips.y += up * .28;
                for (const sd of [1, -1]) { if (up > 0) leg(P, sd, [.06, -1, .25 * up], [0, -1, -.45 * up]); }
                arm(P, side, [.25, 1, .05], [.05, 1, 0]); // قبضة لفوق
                arm(P, -side, [.35, -.6, .55], [-.3, .5, .8]);
                euler(P, 'Head', -.15 * up, 0, 0);
            }],
            [1.0, (u, P) => {
                const p = Math.abs(wave(u, 2));
                euler(P, 'Spine', -.05, 0, 0);
                standLegs(P); bend(P, .14 + .06 * p);
                for (const sd of [1, -1]) arm(P, sd, [1, .1 + .08 * p, .1], [.1, 1, .25]); // عضلات
                euler(P, 'Head', -.08, wave(u, 1) * .2, 0);
            }],
            [1.0, (u, P) => {
                const sd = u < .5 ? 1 : -1, k = Math.sin(((u % .5) / .5) * Math.PI);
                euler(P, 'Spine', 0, sd * -.15, 0);
                standLegs(P); bend(P, .08);
                arm(P, sd, [-.25, .2, .9], [-.95, .35 + .25 * k, .2]); // ينفض الكتف الثاني
                arm(P, -sd, [.22, -1, .04], [.12, -1, .2]);
                euler(P, 'Head', .1, sd * .35, sd * -.1);
            }],
        ]);
    },
};
const DANCES = {};
// يرجع {clip, bounds}: bounds = بداية كل مقطع بالثواني (لدفعات التأثيرات مع كل حركة)
function danceClip(kind) {
    if (DANCES[kind]) return DANCES[kind].clip;
    const def = DANCE_DEF[kind] || DANCE_DEF.girl, [dur, fn, bounds] = def();
    DANCES[kind] = { clip: POSE_KIT.poseClip('win-' + kind, dur, fn), bounds, dur };
    return DANCES[kind].clip;
}

// ================================================================ تأثيرات رقصة الفوز
// البنت: قلوب ولمعات وردية تطلع لفوق وحلقة وردية على الأرض · الولد: نجوم ذهبية وشرار أزرق ينفجر وموجة ذهبية.
// دفعة مع بداية كل حركة بالرقصة، ولمعات خفيفة طول الرقص. Points وحدة (أمر رسم واحد) + حلقة أرض.
const FXTEX = {};
function fxTex(kind) {
    if (FXTEX[kind]) return FXTEX[kind];
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    if (kind === 'heart') {
        g.fillStyle = '#fff'; g.beginPath(); g.moveTo(32, 56); g.bezierCurveTo(2, 34, 10, 6, 32, 20); g.bezierCurveTo(54, 6, 62, 34, 32, 56); g.fill();
    } else if (kind === 'star') {
        g.fillStyle = '#fff'; g.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 11 : 30, a = k / 10 * Math.PI * 2 - Math.PI / 2; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } g.closePath(); g.fill();
    } else {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64); g.fillStyle = '#fff'; g.fillRect(30, 4, 4, 56); g.fillRect(4, 30, 56, 4);
    }
    const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; return (FXTEX[kind] = t);
}
const FX_STYLE = {
    girl: { tex: 'heart', cols: ['#ff5fa2', '#ff8fc4', '#ffffff', '#ffb3d9'], ring: '#ff7ab8', rise: 1, spread: .6, size: .3, spark: 'sparkle' },
    boy: { tex: 'star', cols: ['#ffd447', '#ffb020', '#7fd4ff', '#ffffff'], ring: '#ffc83a', rise: -1, spread: 1.6, size: .27, spark: 'sparkle' },
};
function createWinFx(kind) {
    const S = FX_STYLE[kind] || FX_STYLE.girl, N = 90, group = new T.Group();
    const geo = new T.BufferGeometry(), pos = new Float32Array(N * 3), col = new Float32Array(N * 3);
    geo.setAttribute('position', new T.BufferAttribute(pos, 3)); geo.setAttribute('color', new T.BufferAttribute(col, 3));
    const mat = new T.PointsMaterial({ map: fxTex(S.tex), size: S.size, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, sizeAttenuation: true });
    const pts = new T.Points(geo, mat); pts.frustumCulled = false; group.add(pts);
    const ring = new T.Mesh(new T.RingGeometry(.45, .6, 48).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: S.ring, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
    ring.position.y = .02; group.add(ring);
    const P = Array.from({ length: N }, () => ({ life: 0, max: 1, p: new T.Vector3(), v: new T.Vector3(), c: new T.Color() }));
    let next = 0, ringT = 1, sparkT = 0;
    function spawn(n, burst) {
        for (let i = 0; i < n; i++) {
            const q = P[next]; next = (next + 1) % N;
            const a = Math.random() * Math.PI * 2, sp = burst ? S.spread * (.6 + Math.random() * .8) : .25;
            q.p.set(Math.cos(a) * .2, .9 + Math.random() * .5, Math.sin(a) * .2);
            q.v.set(Math.cos(a) * sp, (S.rise > 0 ? .8 : 1.8) + Math.random() * (burst ? 1.4 : .5), Math.sin(a) * sp);
            q.c.set(S.cols[(Math.random() * S.cols.length) | 0]); q.max = burst ? 1.1 + Math.random() * .7 : .8; q.life = q.max;
        }
    }
    function update(dt, active, beat) {
        if (beat) { spawn(kind === 'boy' ? 34 : 26, true); ringT = 0; }
        if (active) { sparkT -= dt; if (sparkT < 0) { sparkT = .12; spawn(2, false); } }
        const grav = S.rise > 0 ? .35 : -2.6;
        for (let i = 0; i < N; i++) {
            const q = P[i];
            if (q.life > 0) {
                q.life -= dt; q.v.y += grav * dt; q.v.multiplyScalar(1 - dt * .9); q.p.addScaledVector(q.v, dt);
                if (S.rise > 0) q.p.x += Math.sin((q.max - q.life) * 6 + i) * dt * .25; // القلوب تتمايل وهي طالعة
                const k = Math.max(0, q.life / q.max), f = k * (k > .85 ? (1 - k) / .15 : 1);
                pos.set([q.p.x, q.p.y, q.p.z], i * 3); col.set([q.c.r * f, q.c.g * f, q.c.b * f], i * 3);
            } else col.set([0, 0, 0], i * 3);
        }
        geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
        ringT = Math.min(1, ringT + dt / .9); const e = 1 - Math.pow(1 - ringT, 2);
        ring.scale.setScalar(.6 + e * 2.4); ring.material.opacity = (1 - ringT) * .85;
    }
    function dispose() { group.removeFromParent(); geo.dispose(); mat.dispose(); ring.geometry.dispose(); ring.material.dispose(); }
    return { group, update, dispose };
}

// مسار الحركة بارتفاع ورك الموديل. a رقم (حركات الحفلة) أو 'win' (رقصة الفوز الخاصة بالموديل)
function clipFor(model, a) {
    const ver = getClipsVersion(), key = a + ':' + ver;
    if (model.clips.has(key)) return model.clips.get(key);
    const src = a === 'win' ? danceClip(model.kind) : getClip(a); if (!src) return null;
    const k = model.hipsY / RIG_HIPS;
    const tracks = src.tracks.map(t => {
        if (t.name !== 'Hips.position') return t;
        const v = Float32Array.from(t.values, x => x * k); return new T.VectorKeyframeTrack(t.name, t.times, v);
    });
    const clip = new T.AnimationClip(src.name + '-vrm', src.duration, tracks);
    model.clips.set(key, clip); return clip;
}

const hash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

export function makeVrmRig(model, { n = 0 } = {}) {
    const M = VRMMod;
    const root = new T.Group(); root.name = 'vrm-rig';
    const body = SkeletonUtils.clone(model.vrm.scene);
    // النسخة فيها نسخة من الهيكل الموحّد للأصلي: نشيلها ونبني واحد خاص فيها
    const nRoot = model.vrm.humanoid.normalizedHumanBonesRoot, idx = model.vrm.scene.children.indexOf(nRoot);
    if (idx >= 0) body.children[idx].removeFromParent();
    body.traverse(o => { if (o.isMesh) { o.frustumCulled = false; if (o.morphTargetInfluences) o.morphTargetInfluences = o.morphTargetInfluences.slice(); } });
    root.add(body); root.updateMatrixWorld(true);

    // الهيكل الموحّد ينبني والموديل بمقاسه الأصلي، وبعدها نصغّره/نكبّره للطول المطلوب
    const human = {};
    for (const [b, name] of Object.entries(model.rawNames)) { const node = body.getObjectByName(name); if (node) human[b] = { node }; }
    const humanoid = new M.VRMHumanoid(human, { autoUpdateHumanBones: true });
    body.add(humanoid.normalizedHumanBonesRoot);
    body.scale.setScalar((HEIGHT[model.kind] || 1.65) / model.height);
    const bones = {};
    for (const [mx, vb] of Object.entries(MAP)) { const nd = humanoid.getNormalizedBoneNode(vb); if (nd) { nd.name = mx; bones[mx] = nd; } }

    // ---- الحركة (نفس حركات الحفلة)
    const mixer = new T.AnimationMixer(humanoid.normalizedHumanBonesRoot);
    let cur = -1, curAction = null, ver = -1, speed = 1;
    const actions = {};
    function action(a) {
        if (ver !== getClipsVersion()) { for (const k in actions) { if (actions[k] !== curAction) mixer.uncacheAction(actions[k].getClip()); delete actions[k]; } ver = getClipsVersion(); }
        const clip = clipFor(model, a); if (!clip) return null;
        return actions[a] || (actions[a] = mixer.clipAction(clip).setLoop(LOOPED.has(a) || a === 'win' ? T.LoopRepeat : T.LoopOnce, Infinity));
    }
    function play(a) {
        if (a === 11) a = 0;
        if (a === cur && ver === getClipsVersion()) return;
        const next = action(a); if (!next) return;
        next.reset().setEffectiveTimeScale(a === 1 ? speed : 1).setEffectiveWeight(1).play();
        if (curAction && curAction !== next) curAction.crossFadeTo(next, FADE, false);
        const old = curAction; if (old && old.getClip() !== next.getClip()) setTimeout(() => { if (old !== curAction) old.stop(); }, FADE * 1000 + 50);
        cur = a; curAction = next;
    }
    function setSpeed(mps) { speed = Math.max(.6, Math.min(1.9, mps / 1.3)); if (cur === 1 && curAction) curAction.setEffectiveTimeScale(speed); }

    // ---- ملامح الوجه (تعابير الموديل)
    const meshes = {}; body.traverse(o => { if (o.isMesh && o.morphTargetInfluences) (meshes[o.name] = meshes[o.name] || []).push(o); });
    const groupMeshes = name => { if (meshes[name]) return meshes[name]; const g = body.getObjectByName(name), out = []; if (g) g.traverse(o => { if (o.isMesh && o.morphTargetInfluences) out.push(o); }); return (meshes[name] = out); };
    const binds = {}; for (const [k, list] of Object.entries(model.expr)) binds[k] = list.map(([nm, i, w]) => [groupMeshes(nm), i, w]);
    const want = {}, have = {};
    let moodK = 'smile', exprT = 0, exprK = null, blinkT = 1.5 + (hash(String(n)) % 300) / 100, blinking = 0;
    const MOODS = {
        smile: { happy: .28, relaxed: .2 },
        laugh: { happy: 1 },
        scared: { surprised: 1 },
        sad: { sad: .9 },
        focus: { angry: .45, relaxed: .25 },
    };
    function mood(k) { moodK = MOODS[k] ? k : 'smile'; }
    function express(kind, sec = 1.6) { exprK = kind === 'laugh' || kind === 'smile' || kind === 'party' ? 'laugh' : 'scared'; exprT = sec; }
    function face(dt) {
        if (exprT > 0) exprT -= dt;
        blinkT -= dt; if (blinkT < 0) { blinking = .14; blinkT = 2.4 + Math.random() * 2.8; } if (blinking > 0) blinking -= dt;
        const m = MOODS[exprT > 0 ? exprK : moodK];
        for (const k in binds) want[k] = m[k] || 0;
        // الرمشة ما تنضاف فوق العيون المقفلة (الضحكة) أو المفتوحة على وسعها (الخوف)
        want.blink = blinking > 0 && !m.happy && !m.surprised ? 1 : 0;
        const kk = 1 - Math.exp(-dt * 14);
        for (const ms of Object.values(meshes)) for (const o of ms) o.morphTargetInfluences.fill(0);
        for (const k in binds) {
            const v = (have[k] || 0) + ((want[k] || 0) - (have[k] || 0)) * (k === 'blink' ? 1 : kk); have[k] = v;
            if (v < .002) continue;
            for (const [ms, i, w] of binds[k]) for (const o of ms) o.morphTargetInfluences[i] = Math.min(1, o.morphTargetInfluences[i] + v * w);
        }
    }

    // ---- الأصابع
    const fb = {}; for (const b of FINGER_BONES) fb[b] = humanoid.getNormalizedBoneNode(b);
    const gest = { left: 'relax', right: 'relax' }, cv = { left: {}, right: {} };
    function gesture(side, name) { gest[String(side).toLowerCase().startsWith('l') ? 'left' : 'right'] = GEST[name] ? name : 'relax'; }
    function fingers(dt) {
        const k = 1 - Math.exp(-dt * 18);
        for (const sd of ['left', 'right']) {
            const G = GEST[gest[sd]], sg = sd === 'left' ? -1 : 1, sc = gest[sd] === 'scissors' ? 1.8 : gest[sd] === 'paper' ? 1.2 : .6;
            for (const f of FINGERS) {
                const v = cv[sd][f] = (cv[sd][f] || 0) + (G[f] - (cv[sd][f] || 0)) * k;
                PARTS[f].forEach((p, j) => {
                    const nd = fb[sd + f + p]; if (!nd) return;
                    if (f === 'Thumb') { const [tx, ty, tz] = THUMB[j]; nd.rotation.set(sg * tx * v, sg * ty * v, sg * tz * v); }
                    else { nd.rotation.set(0, j ? 0 : sg * -(SPREAD[f] || 0) * sc * (1 - v), sg * v * (j === 0 ? 1.45 : j === 1 ? 1.6 : 1.1)); }
                });
            }
        }
    }

    // المعصم: اليد اللي تلعب تلف لين الإبهام فوق، عشان الحجرة/الورقة/المقص تنقرا من الجنب
    const roll = { left: 0, right: 0 }, _qw = new T.Quaternion(), XA = new T.Vector3(1, 0, 0);
    function wrist(dt) {
        const k = 1 - Math.exp(-dt * 14);
        for (const sd of ['left', 'right']) {
            roll[sd] += ((gest[sd] === 'relax' ? 0 : 1) - roll[sd]) * k;
            const h = bones[sd === 'left' ? 'LeftHand' : 'RightHand']; if (!h || roll[sd] < .001) continue;
            h.quaternion.multiply(_qw.setFromAxisAngle(XA, (sd === 'left' ? 1 : -1) * WRIST.v * roll[sd]));
        }
    }

    // تأثيرات رقصة الفوز: دفعة مع بداية كل حركة، ولمعات طول الرقص، وتختفي بهدوء بعدها
    let fx = null, seg = -1;
    function winFx(dt) {
        const on = cur === 'win' && curAction;
        if (!on && !fx) return;
        if (!fx) { fx = createWinFx(model.kind); root.add(fx.group); }
        let beat = false;
        if (on) {
            const D = DANCES[model.kind], t = curAction.time % D.dur; let i = 0; while (i < D.bounds.length - 1 && t >= D.bounds[i + 1]) i++;
            if (i !== seg) { beat = true; seg = i; }
        } else seg = -1;
        fx.update(dt, !!on, beat);
    }
    function update(dt) {
        if (ver !== getClipsVersion() && typeof cur === 'number' && cur >= 0) { const a = cur; cur = -1; play(a); } // وصلت الحركات المسجّلة
        mixer.update(dt);
        winFx(dt);
        wrist(dt);
        fingers(dt);
        face(dt);
    }
    function sync() { humanoid.update(); }
    // يد المواجهة الكبيرة (rps-hand.js) تتركّب مكان يد الموديل: نخفي يد الموديل وأصابعها بتصغير عظمتها الفعلية
    function hideHand(side, on) { const nd = humanoid.getRawBoneNode(String(side).toLowerCase().startsWith('l') ? 'leftHand' : 'rightHand'); if (nd) nd.scale.setScalar(on ? .001 : 1); }
    function dispose() { if (fx) fx.dispose(); mixer.stopAllAction(); mixer.uncacheRoot(humanoid.normalizedHumanBonesRoot); root.removeFromParent(); }

    play(0);
    root.userData.rig = true;
    const look = { g: model.kind === 'boy' ? 1 : 0, s: 0, vrm: true };
    return { root, bones, play, setSpeed, update, sync, express, mood, gesture, hideHand, skin: SKIN[model.kind] || '#f4dccf', dispose, vrm: true, get anim() { return cur; }, get look() { return look; } };
}
