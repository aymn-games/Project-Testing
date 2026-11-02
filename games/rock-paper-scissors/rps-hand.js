/**
 * «حجرة ورقة مقص» — يد ثلاثية الأبعاد بأصابع ومفاصل (للقطة القريبة وقت الكشف بـ rps-scene.js).
 *
 * makeHand({ skin, sleeve, left }) ← { group, setPose(name), snap(name), update(dt), dispose() }
 *   - اليد بإحداثياتها: الأصابع لفوق (+Y)، باطن الكف لقدام (+Z)، الإبهام على +X (يد يمين).
 *   - كل إصبع 3 سلاميات (الإبهام: مشط + سلاميتين)، وكل مفصل يدور حول محوره، فالوضعيات
 *     (حجرة/ورقة/مقص) مجرد زوايا للمفاصل، والتنقّل بينها سلس (lerp).
 *   - الشكل: كف مدوّر بسماكة متدرجة، أصابع مخروطية خفيفة، عُقل بارزة، وأظافر.
 */
import * as THREE from 'three';

const T = THREE;
// [اسم، x القاعدة، z، أطوال السلاميات، نصف القطر عند القاعدة]
const FINGERS = [
    ['index', .29, .0, [.40, .25, .21], .094],
    ['middle', .095, .01, [.44, .28, .22], .097],
    ['ring', -.095, .0, [.41, .26, .21], .091],
    ['pinky', -.275, -.01, [.31, .20, .18], .079],
];

// زوايا المفاصل لكل وضعية: لكل إصبع [ثني1، ثني2، ثني3، فتح جانبي]، والإبهام [دوران القاعدة Y، Z، ثني1، ثني2، ثني3]
export const POSES = {
    rock: { index: [1.55, 1.75, .95, 0], middle: [1.6, 1.75, .95, 0], ring: [1.6, 1.7, .95, 0], pinky: [1.55, 1.65, .9, 0], thumb: [-1.15, -.3, .7, .6, .5] },
    paper: { index: [.04, .05, .03, .13], middle: [.03, .04, .03, .03], ring: [.04, .05, .03, -.07], pinky: [.06, .06, .04, -.17], thumb: [-.2, -.75, .1, .08, .05] },
    scissors: { index: [.04, .05, .03, .2], middle: [.03, .04, .03, -.12], ring: [1.55, 1.7, .95, 0], pinky: [1.5, 1.6, .9, 0], thumb: [-1.0, -.45, .65, .6, .45] },
};

function seg(len, r0, r1, mat) {
    // سلامية: كبسولة مخروطية خفيفة من 0 لـ len على +Y
    const g = new T.CapsuleGeometry(1, 1, 8, 16), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        let y = p.getY(i); const cap = Math.abs(y) > .5; const t = (y + 1.5) / 3; // 0 تحت، 1 فوق
        const r = r0 + (r1 - r0) * t;
        const sx = p.getX(i) * r, sz = p.getZ(i) * r * .92;
        // تبدأ تحت المفصل بشوي وتنتهي فوقه بشوي، فالسلاميات تتداخل والمفصل يبان متصل
        const o0 = -r0 * .55, o1 = len + r1 * .45;
        y = cap ? (y > 0 ? o1 - r1 * .6 + (y - .5) * r1 * .6 : o0 + r0 * .6 + (y + .5) * r0 * .6) : o0 + r0 * .6 + (y + .5) * (o1 - o0 - (r0 + r1) * .6);
        p.setXYZ(i, sx, y, sz);
    }
    g.computeVertexNormals();
    const m = new T.Mesh(g, mat); m.castShadow = true;
    return m;
}

export function makeHand({ skin = '#e8b896', sleeve = '#2d3442', left = false } = {}) {
    const skinM = new T.MeshPhysicalMaterial({ color: skin, roughness: .62, metalness: 0, sheen: .25, sheenRoughness: .7, sheenColor: new T.Color('#ff9f87'), envMapIntensity: .35 });
    const nailM = new T.MeshPhysicalMaterial({ color: new T.Color(skin).lerp(new T.Color('#f3cfc6'), .5), roughness: .3, clearcoat: .5, envMapIntensity: .5 });
    const knuckleTone = new T.MeshPhysicalMaterial({ color: new T.Color(skin).multiplyScalar(.94), roughness: .64, sheen: .2, sheenColor: new T.Color('#ff9f87'), envMapIntensity: .35 });

    const group = new T.Group(), hand = new T.Group(); group.add(hand);
    if (left) group.scale.x = -1;

    // الكف: شكل «سكويركل» ناعم (بين المربع والبيضاوي)، أعرض عند المفاصل وأنحف عند الرسغ
    const palmG = new T.SphereGeometry(1, 48, 32), pp = palmG.attributes.position;
    for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i);
        const sq = (v, e) => Math.sign(v) * Math.pow(Math.abs(v), e);
        const t = (y + 1) / 2, w = .4 + t * .06;
        pp.setXYZ(i, sq(x, .55) * w, sq(y, .6) * .5, sq(z, .85) * .15 * (1 - Math.abs(x) * .25) - (z > 0 ? .02 * (1 - x * x) * (1 - y * y) : 0));
    }
    palmG.computeVertexNormals();
    const palm = new T.Mesh(palmG, skinM); palm.position.y = .46; palm.castShadow = true; hand.add(palm);
    // لحمة الإبهام (thenar) بالباطن
    const thenar = new T.Mesh(new T.SphereGeometry(.2, 24, 16), skinM); thenar.scale.set(.95, 1.3, .62); thenar.position.set(.25, .27, .05); hand.add(thenar);
    // الرسغ والساعد (كم بسيط)
    const wrist = new T.Mesh(new T.CylinderGeometry(.27, .29, .3, 28), skinM); wrist.scale.z = .6; wrist.position.y = -.05; hand.add(wrist);
    const sleeveM = new T.MeshStandardMaterial({ color: sleeve, roughness: .85 });
    const sleeveMesh = new T.Mesh(new T.CylinderGeometry(.36, .38, .7, 28), sleeveM); sleeveMesh.scale.z = .72; sleeveMesh.position.y = -.5; hand.add(sleeveMesh);
    const cuff = new T.Mesh(new T.TorusGeometry(.355, .035, 10, 32), sleeveM); cuff.rotation.x = Math.PI / 2; cuff.scale.y = .72; cuff.position.y = -.16; hand.add(cuff);

    const joints = {};
    for (const [name, x, z, lens, r] of FINGERS) {
        const base = new T.Group(); base.position.set(x, .9, z); hand.add(base);
        // العُقلة البارزة على ظهر اليد
        const kn = new T.Mesh(new T.SphereGeometry(r * 1.05, 16, 12), knuckleTone); kn.position.set(0, .0, -.05); kn.scale.set(1, .8, .9); base.add(kn);
        const chain = []; let parent = base, rr = r;
        lens.forEach((L, k) => {
            const j = new T.Group(); if (k) j.position.y = lens[k - 1]; parent.add(j);
            const r1 = rr * (k === 2 ? .82 : .9);
            j.add(seg(L, rr, r1, skinM));
            if (k) { const jn = new T.Mesh(new T.SphereGeometry(rr * .99, 20, 14), skinM); jn.scale.z = .92; j.add(jn); } // مفصل ناعم
            if (k === 2) {
                const nail = new T.Mesh(new T.SphereGeometry(1, 16, 10), nailM);
                nail.scale.set(r1 * .78, L * .32, r1 * .3); nail.position.set(0, L * .66, -r1 * .82); j.add(nail);
            }
            chain.push(j); parent = j; rr = r1;
        });
        joints[name] = chain;
    }
    // الإبهام: قاعدة تدور (Y,Z) ثم ثلاث مفاصل
    const tBase = new T.Group(); tBase.position.set(.4, .22, .04); hand.add(tBase);
    const tLens = [.3, .25, .21], tChain = []; let tp = tBase, tr = .1;
    tLens.forEach((L, k) => {
        const j = new T.Group(); if (k) j.position.y = tLens[k - 1]; tp.add(j);
        const r1 = tr * (k === 2 ? .82 : .92); j.add(seg(L, tr, r1, skinM));
        if (k) { const jn = new T.Mesh(new T.SphereGeometry(tr * .99, 20, 14), skinM); jn.scale.z = .92; j.add(jn); }
        if (k === 2) { const nail = new T.Mesh(new T.SphereGeometry(1, 16, 10), nailM); nail.scale.set(r1 * .8, L * .32, r1 * .3); nail.position.set(0, L * .64, -r1 * .82); j.add(nail); }
        tChain.push(j); tp = j; tr = r1;
    });
    joints.thumb = { base: tBase, chain: tChain };

    // ---- الوضعيات: نحفظ الزوايا الحالية ونقرّبها للهدف بسلاسة
    const cur = JSON.parse(JSON.stringify(POSES.rock)), target = JSON.parse(JSON.stringify(POSES.rock));
    function apply() {
        for (const [name] of FINGERS) {
            const a = cur[name], ch = joints[name];
            ch[0].rotation.set(a[0], 0, -a[3]); ch[1].rotation.x = a[1]; ch[2].rotation.x = a[2];
        }
        const t = cur.thumb; joints.thumb.base.rotation.set(0, t[0], t[1], 'YZX');
        joints.thumb.chain[0].rotation.x = t[2]; joints.thumb.chain[1].rotation.x = t[3]; joints.thumb.chain[2].rotation.x = t[4];
    }
    function setPose(name) { const p = POSES[name]; for (const k in p) target[k] = p[k].slice(); }
    function snap(name) { setPose(name); for (const k in target) cur[k] = target[k].slice(); apply(); }
    function update(dt, speed = 14) {
        const f = 1 - Math.exp(-dt * speed);
        for (const k in cur) for (let i = 0; i < cur[k].length; i++) cur[k][i] += (target[k][i] - cur[k][i]) * f;
        apply();
    }
    snap('rock');
    return { group, setPose, snap, update, dispose() { group.traverse(o => { if (o.geometry) o.geometry.dispose(); }); [skinM, nailM, knuckleTone, sleeveM].forEach(m => m.dispose()); } };
}
