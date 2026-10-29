// يستخرج حركات مسجّلة صغيرة لحفلة عيد الميلاد من ملفات GLB (أمثلة Three.js r160، أصلها Mixamo).
// يقرأ JSON والـ buffer مباشرة بدون Three، ويحفظ لكل إطار «فرق الدوران العالمي» عن وضع T
// لكل عظمة: D = G_anim · G_T⁻¹. الجوال يطبّقه على وضع T حق هيكله، فما يهم اختلاف محاور العظام.
// التشغيل: node tools/extract-anims.mjs   (ينزّل الملفات لمجلد مؤقت، مو بالمستودع)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = 'https://raw.githubusercontent.com/mrdoob/three.js/r160/examples/models/gltf/';
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'games', 'birthday-party', 'anims');
const FPS = 15;
export const BONES = ['Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head'];
for (const s of ['Left', 'Right']) for (const b of ['Shoulder', 'Arm', 'ForeArm', 'Hand', 'UpLeg', 'Leg', 'Foot', 'ToeBase']) BONES.push(s + b);
const JOBS = [
    { file: 'Michelle.glb', clip: 'SambaDance', out: 'samba', ref: 'TPose' },
    { file: 'Xbot.glb', clip: 'idle', out: 'idle' },
    { file: 'Xbot.glb', clip: 'walk', out: 'walk' }
];

// —— رياضيات الكواترنيون [x,y,z,w] ——
const qmul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
const qinv = (q) => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q) => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return q.map((v) => v / l); };
const qrot = (q, v) => { const r = qmul(qmul(q, [v[0], v[1], v[2], 0]), qinv(q)); return [r[0], r[1], r[2]]; };
function slerp(a, b, t) {
    let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    if (d < 0) { b = b.map((v) => -v); d = -d; }
    if (d > 0.9995) return qnorm(a.map((v, i) => v + (b[i] - v) * t));
    const th = Math.acos(d), s = Math.sin(th);
    return a.map((v, i) => (v * Math.sin((1 - t) * th) + b[i] * Math.sin(t * th)) / s);
}

function readGlb(buf) {
    const jl = buf.readUInt32LE(12), json = JSON.parse(buf.slice(20, 20 + jl).toString());
    const bin = buf.slice(20 + jl + 8);
    const acc = (i) => {
        const a = json.accessors[i], bv = json.bufferViews[a.bufferView];
        if (a.componentType !== 5126) throw new Error('accessor ' + i + ' is not float');
        const n = { SCALAR: 1, VEC3: 3, VEC4: 4 }[a.type], off = (bv.byteOffset || 0) + (a.byteOffset || 0);
        const arr = new Float32Array(bin.buffer.slice(bin.byteOffset + off, bin.byteOffset + off + a.count * n * 4));
        const out = []; for (let k = 0; k < a.count; k++) out.push(n === 1 ? arr[k] : Array.from(arr.slice(k * n, k * n + n)));
        return out;
    };
    return { json, acc };
}

// مسار كل عقدة من الجذر، عشان نحسب العالمي
function parents(json) { const p = {}; json.nodes.forEach((n, i) => (n.children || []).forEach((c) => { p[c] = i; })); return p; }

function sampler(g, anim) {
    const ch = {};
    for (const c of anim.channels) {
        if (c.target.path === 'scale') continue;
        const s = anim.samplers[c.sampler];
        (ch[c.target.node] = ch[c.target.node] || {})[c.target.path] = { t: g.acc(s.input), v: g.acc(s.output) };
    }
    const at = (tr, t, isQ) => {
        const T = tr.t; if (t <= T[0]) return tr.v[0]; if (t >= T[T.length - 1]) return tr.v[T.length - 1];
        let i = 1; while (T[i] < t) i++;
        const f = (t - T[i - 1]) / (T[i] - T[i - 1]);
        return isQ ? slerp(tr.v[i - 1], tr.v[i], f) : tr.v[i - 1].map((v, k) => v + (tr.v[i][k] - v) * f);
    };
    return { ch, at, duration: Math.max(...anim.samplers.map((s) => g.json.accessors[s.input].max[0])) };
}

// العالمي (دوران، موقع، مقياس موحّد) لكل عظمة بوقت t
function world(g, par, smp, t) {
    const memo = {};
    const get = (i) => {
        if (memo[i]) return memo[i];
        const n = g.json.nodes[i], c = smp && smp.ch[i];
        const R = c && c.rotation ? qnorm(smp.at(c.rotation, t, true)) : (n.rotation || [0, 0, 0, 1]);
        const P = c && c.translation ? smp.at(c.translation, t, false) : (n.translation || [0, 0, 0]);
        const S = n.scale ? n.scale[0] : 1;
        let w;
        if (par[i] === undefined) w = { r: R, p: P, s: S };
        else { const q = get(par[i]); const lp = qrot(q.r, P.map((v) => v * q.s)); w = { r: qmul(q.r, R), p: [q.p[0] + lp[0], q.p[1] + lp[1], q.p[2] + lp[2]], s: q.s * S }; }
        return (memo[i] = w);
    };
    return get;
}

const r4 = (v) => Math.round(v * 1e4) / 1e4;

export function extract(buf, job) {
    const g = readGlb(buf), par = parents(g.json);
    const idx = {}; g.json.nodes.forEach((n, i) => { const m = /^mixamorig:?(.*)$/.exec(n.name || ''); if (m) idx[m[1]] = i; });
    for (const b of BONES) if (idx[b] === undefined) throw new Error(job.file + ': missing bone ' + b);
    const anim = g.json.animations.find((a) => a.name === job.clip);
    if (!anim) throw new Error(job.file + ': no clip ' + job.clip);
    const refAnim = job.ref && g.json.animations.find((a) => a.name === job.ref);
    const refW = world(g, par, refAnim ? sampler(g, refAnim) : null, 0);
    const rest = {}; BONES.forEach((b) => { rest[b] = refW(idx[b]).r.map(r4); });
    const hipsH = refW(idx.Hips).p[1];
    const smp = sampler(g, anim), n = Math.max(2, Math.round(smp.duration * FPS) + 1);
    const tracks = {}; BONES.forEach((b) => { tracks[b] = { q: [] }; }); tracks.Hips.p = [];
    const hp = [];
    let prev = {};
    for (let k = 0; k < n; k++) {
        const t = Math.min(smp.duration, k / FPS), w = world(g, par, smp, t);
        BONES.forEach((b) => {
            let d = qnorm(qmul(w(idx[b]).r, qinv(refW(idx[b]).r)));
            // نفس نصف الكرة مع الإطار السابق عشان الاستيفاء ما يلف الطريق الطويل
            const p = prev[b]; if (p && p[0] * d[0] + p[1] * d[1] + p[2] * d[2] + p[3] * d[3] < 0) d = d.map((v) => -v);
            prev[b] = d; tracks[b].q.push(...d.map(r4));
        });
        hp.push(w(idx.Hips).p);
    }
    // الموقع نسبة لطول الورك؛ الانزياح الأفقي على طول الحركة ينشال عشان تلف بدون قفزة (المكان من السيرفر)
    const a0 = hp[0], a1 = hp[n - 1];
    hp.forEach((p, k) => {
        const f = k / (n - 1);
        tracks.Hips.p.push(r4((p[0] - a0[0] - (a1[0] - a0[0]) * f) / hipsH), r4(p[1] / hipsH), r4((p[2] - a0[2] - (a1[2] - a0[2]) * f) / hipsH));
    });
    return { name: job.out, duration: r4((n - 1) / FPS), fps: FPS, space: 'world-delta', hipsUnit: 'hipsHeight', rest, tracks };
}

async function main() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agp-anims-'));
    fs.mkdirSync(OUT, { recursive: true });
    const cache = {};
    for (const job of JOBS) {
        if (!cache[job.file]) {
            const res = await fetch(BASE + job.file);
            if (!res.ok) throw new Error('download ' + job.file + ': ' + res.status);
            const f = path.join(tmp, job.file); fs.writeFileSync(f, Buffer.from(await res.arrayBuffer()));
            cache[job.file] = fs.readFileSync(f);
        }
        const data = JSON.stringify(extract(cache[job.file], job));
        fs.writeFileSync(path.join(OUT, job.out + '.json'), data);
        console.log(job.out + '.json', (data.length / 1024).toFixed(1) + 'KB');
    }
    fs.rmSync(tmp, { recursive: true, force: true });
}
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) main().catch((e) => { console.error(e); process.exit(1); });
