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
 *     · 4 تصفيق · 5 لفّة · 6 قفز · 7 قلب · 8 تمايل · 9 ديسكو · 10 هيب هوب
 *   setSpeed(mps) · update(dt) كل إطار · sync() بعد أي تعديل يدوي على bones (ينقل الوضعية للهيكل الفعلي)
 *   mood('smile'|'laugh'|'scared'|'sad'|'focus'): ملامح الوجه من تعابير الموديل نفسه، ورمشة تلقائية
 *   express(kind, sec): تعبير مؤقت ('laugh' أو 'open') · gesture(side, 'rock'|'paper'|'scissors'|'relax'): الأصابع
 *   hideHand(side, on): يخفي يد الموديل (لو اللعبة تركّب يد خاصة فيها) · skin: لون البشرة · dispose()
 *   الهيكل الموحّد بـ VRM (normalized) بوضع T ودوران راحة صفر، نفس هيكل rig3d، فنفس الحركات تنطبق.
 *   فيزياء الشعر والتنورة (spring bones) طافية عشان الأداء.
 */
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { getClip, getClipsVersion } from '../games/birthday-party/rig3d.js';

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

// مسار الحركة بارتفاع ورك الموديل
function clipFor(model, a) {
    const ver = getClipsVersion(), key = a + ':' + ver;
    if (model.clips.has(key)) return model.clips.get(key);
    const src = getClip(a); if (!src) return null;
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
        return actions[a] || (actions[a] = mixer.clipAction(clip).setLoop(LOOPED.has(a) ? T.LoopRepeat : T.LoopOnce, Infinity));
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

    function update(dt) {
        if (ver !== getClipsVersion() && cur >= 0) { const a = cur; cur = -1; play(a); } // وصلت الحركات المسجّلة
        mixer.update(dt);
        wrist(dt);
        fingers(dt);
        face(dt);
    }
    function sync() { humanoid.update(); }
    // يد المواجهة الكبيرة (rps-hand.js) تتركّب مكان يد الموديل: نخفي يد الموديل وأصابعها بتصغير عظمتها الفعلية
    function hideHand(side, on) { const nd = humanoid.getRawBoneNode(String(side).toLowerCase().startsWith('l') ? 'leftHand' : 'rightHand'); if (nd) nd.scale.setScalar(on ? .001 : 1); }
    function dispose() { mixer.stopAllAction(); mixer.uncacheRoot(humanoid.normalizedHumanBonesRoot); root.removeFromParent(); }

    play(0);
    root.userData.rig = true;
    const look = { g: model.kind === 'boy' ? 1 : 0, s: 0, vrm: true };
    return { root, bones, play, setSpeed, update, sync, express, mood, gesture, hideHand, skin: SKIN[model.kind] || '#f4dccf', dispose, vrm: true, get anim() { return cur; }, get look() { return look; } };
}
