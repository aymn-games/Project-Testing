/**
 * «شد الحبل» — الملعب ثلاثي الأبعاد (Three.js 0.160) بشخصيات سفينة النجاة
 * (نسخة من figure() بـ games/survival-ship/ship3d.js)، قميصها وعصابتها بلون الفريق.
 *
 * يحتاج importmap فيه three (game.html).
 *
 * createTugScene(container, { colors:[يسار، يمين] }) ← { ready, setState, pull, effect, stop }
 *   setState({ teams:[[{id,name,g,frozen,out}],[...]], pos:-100..100, boost:[bool,bool], winner:-1|0|1 })
 *     out = اللاعب انقصى (تعدّى خط النص): ينقذف للجهة الثانية ويختفي بانفجار
 *   pull(id): سحبة لاعب (حركة شد قوية لحظية)
 *   effect(kind, k, ids): تأثير هدية — 'freeze' (ثلج على ids) · 'boost' (شرار ذهبي على فريق k)
 *     · 'hook' (خطاف يطير على الحبل لجهة فريق k) · 'support' (دفعة بلون الفريق عند ids)
 * أماكن اللاعبين وخط الإقصاء من TOW.slot/TOW.SHIFT (tow-platform.js) — نفس حساب منطق المباراة.
 */
import * as THREE from 'three';

const T = THREE;
// المسافة بين اللاعبين ومكان كل لاعب: نفس دوال TOW (tow-platform.js) عشان الإقصاء يطابق اللي يبان
const TOWG = window.TOW || {};
const stepFor = TOWG.stepFor || (n => Math.max(.62, Math.min(1, 6.2 / Math.max(1, n - 1))));
const slot = TOWG.slot || ((i, n) => 1.15 + i * stepFor(n));
const SHIFT = TOWG.SHIFT || 3.2;          // المسافة من النص لخط الفوز (pos = ±100)
const FONT = '"IBM Plex Sans Arabic", "Zain", Tahoma, sans-serif';
const hash = s => { let h = 2166136261; for (const c of String(s)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; };

// ألوان شخصيات السفينة (البشرة والشعر) — القميص بلون الفريق
const SKINS = ['#f6cfa6', '#f2c49b', '#d9a273', '#f8d9bd', '#c68a5c', '#e3ae80'];
const HAIRS = ['#3b2414', '#5b3a1e', '#1f1410', '#7c4a1e', '#120c09', '#4a2c17'];

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
function label(name, color) {
    return tex(512, 128, (g, w) => { g.font = '700 58px ' + FONT; const tw = Math.min(w - 20, g.measureText(name).width + 60);
        g.fillStyle = 'rgba(10,9,18,.88)'; g.beginPath(); g.roundRect((w - tw) / 2, 14, tw, 100, 50); g.fill();
        g.strokeStyle = color; g.lineWidth = 6; g.stroke();
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl'; g.fillText(name, w / 2, 66, w - 70); });
}
const shade = (c, k) => new T.Color(c).multiplyScalar(k).getStyle();

/* ---------- شخصية سفينة النجاة (نسخة من figure() بـ ship3d.js، بقميص الفريق) ---------- */
function shipFigure(d) {
    const G = new T.Group(), M = (c, o = {}) => new T.MeshStandardMaterial({ color: c, roughness: .55, ...o });
    const add = (geo, c, x, y, z, par = G, o) => { const m = new T.Mesh(geo, typeof c === 'string' ? M(c, o) : c); m.position.set(x, y, z); m.castShadow = true; par.add(m); return m; };
    const skin = M(d.skin, { roughness: .5 });
    const legs = []; for (const x of [-.17, .17]) { const l = new T.Group(); l.position.set(x, .78, 0); add(new T.CapsuleGeometry(.13, .42, 4, 10), d.pants, 0, -.32, 0, l); const sh = add(new T.SphereGeometry(.19, 14, 10), '#f8fafc', 0, -.7, .07, l); sh.scale.set(1, .62, 1.35); add(new T.CylinderGeometry(.19, .19, .05, 14), '#334155', 0, -.77, .07, l); G.add(l); legs.push(l); }
    const torso = add(new T.CapsuleGeometry(.36, .42, 6, 16), d.outfit, 0, 1.18, 0); torso.scale.set(1, 1, .82);
    add(new T.TorusGeometry(.3, .06, 8, 20), '#ffffff', 0, 1.52, 0).rotation.x = Math.PI / 2;
    add(new T.CylinderGeometry(.37, .37, .09, 18), shade(d.outfit, .7), 0, .93, 0);
    const arms = []; for (const s of [-1, 1]) { const a = new T.Group(); a.position.set(s * .44, 1.42, 0); add(new T.CapsuleGeometry(.1, .34, 4, 10), d.outfit, 0, -.24, 0, a); add(new T.SphereGeometry(.12, 12, 10), skin, 0, -.52, 0, a); G.add(a); arms.push(a); }
    add(new T.CylinderGeometry(.13, .15, .16, 12), skin, 0, 1.66, 0);
    const head = new T.Group(); head.position.y = 2.18; G.add(head);
    add(new T.SphereGeometry(.62, 28, 22), skin, 0, 0, 0, head).scale.set(1, .96, .94);
    for (const s of [-1, 1]) add(new T.SphereGeometry(.13, 12, 10), skin, s * .6, -.04, 0, head).scale.set(.6, 1, .8);
    const hairM = M(d.hair, { roughness: .45 });
    const cap = add(new T.SphereGeometry(.67, 28, 18, 0, Math.PI * 2, 0, Math.PI * .52), hairM, 0, .04, -.05, head); cap.rotation.x = -.32;
    for (let i = -2; i <= 2; i++) { const fr = add(new T.SphereGeometry(.2, 12, 10), hairM, i * .17, .36 - Math.abs(i) * .03, .46 - Math.abs(i) * .05, head); fr.scale.set(1, .7, .6); }
    if (d.girl) { for (const s of [-1, 1]) { const p = add(new T.CapsuleGeometry(.16, .55, 6, 12), hairM, s * .62, -.32, -.12, head); p.rotation.z = s * .12; add(new T.SphereGeometry(.09, 10, 8), '#f472b6', s * .6, .08, -.1, head); } }
    else add(new T.SphereGeometry(.5, 18, 14), hairM, 0, -.05, -.28, head).scale.set(1.15, 1, .8);
    // عصابة راس بلون الفريق
    add(new T.TorusGeometry(.64, .07, 8, 28), M(d.outfit, { emissive: d.outfit, emissiveIntensity: .35 }), 0, .2, 0, head).rotation.x = Math.PI / 2 - .25;
    const eyeW = M('#ffffff', { roughness: .2 }), eyeB = M('#1e1b2e', { roughness: .2 });
    for (const s of [-1, 1]) { const e = add(new T.SphereGeometry(.12, 16, 12), eyeB, s * .22, -.02, .53, head); e.scale.set(.85, 1.15, .5);
        add(new T.SphereGeometry(.04, 8, 6), eyeW, s * .22 + .03, .05, .59, head);
        const br = add(new T.CapsuleGeometry(.025, .13, 3, 6), d.hair, s * .22, .2, .55, head); br.rotation.z = Math.PI / 2 - s * .35; // حواجب معقودة (جهد)
        const ch = add(new T.SphereGeometry(.09, 10, 8), M('#fb7185', { transparent: true, opacity: .55 }), s * .36, -.2, .47, head); ch.scale.set(1, .55, .3); }
    add(new T.SphereGeometry(.07, 10, 8), '#9f1239', 0, -.22, .57, head).scale.set(1.3, .6, .4); // فم مشدود
    const body = new T.Group(); body.add(G); body.scale.setScalar(.72); // نفس طول شخصية الأنمي تقريباً
    return { root: body, inner: G, legs, arms, head, kind: 'ship' };
}

export function createTugScene(container, opts = {}) {
    const colors = (opts.colors || ['#e8776a', '#5aaee6']).slice();
    const r = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: !!opts.capture });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5)); r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.1; r.outputColorSpace = T.SRGBColorSpace;
    container.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%';
    const sc = new T.Scene();
    sc.background = tex(4, 256, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#0b0816'); gr.addColorStop(.6, '#1a1030'); gr.addColorStop(1, '#2a1846'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    sc.fog = new T.Fog('#160f28', 22, 55);
    const cam = new T.PerspectiveCamera(36, 1, .1, 100); cam.position.set(0, 3.6, 11); cam.lookAt(0, 1.25, 0);
    sc.add(new T.HemisphereLight('#d9ccff', '#1b1230', 1.05));
    const sun = new T.DirectionalLight('#fff4e6', 2.1); sun.position.set(3, 10, 7); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 8, bottom: -8, near: 1, far: 30 }); sc.add(sun);
    const glowL = new T.PointLight(colors[0], 18, 14); glowL.position.set(-6, 3, 2); sc.add(glowL);
    const glowR = new T.PointLight(colors[1], 18, 14); glowR.position.set(6, 3, 2); sc.add(glowR);

    // ---- الأرضية: منصة غامقة، نصّين بلون الفريقين، خط نص، وخطّين فوز
    const floorTex = tex(1024, 1200, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, colors[0]); gr.addColorStop(.38, '#1b1530'); gr.addColorStop(.62, '#1b1530'); gr.addColorStop(1, colors[1]);
        g.fillStyle = '#120e20'; g.fillRect(0, 0, w, h); g.globalAlpha = .35; g.fillStyle = gr; g.fillRect(0, 0, w, h); g.globalAlpha = 1;
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; for (let x = 0; x < w; x += 32) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); } for (let y = 0; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); } });
    const floor = new T.Mesh(new T.BoxGeometry(46, .3, 30), new T.MeshStandardMaterial({ map: floorTex, roughness: .8 })); floor.position.set(0, -.15, 11.5); floor.receiveShadow = true; sc.add(floor);
    const edge = new T.Mesh(new T.BoxGeometry(46.2, .06, 30.2), new T.MeshBasicMaterial({ color: '#a855f7' })); edge.position.set(0, -.31, 11.5); sc.add(edge);
    const lineM = c => new T.MeshBasicMaterial({ color: c, transparent: true, opacity: .95 });
    const mid = new T.Mesh(new T.PlaneGeometry(.06, 6), lineM('#ffffff')); mid.rotation.x = -Math.PI / 2; mid.position.y = .01; sc.add(mid);
    for (const k of [0, 1]) { const wl = new T.Mesh(new T.PlaneGeometry(.12, 6), lineM(colors[k])); wl.rotation.x = -Math.PI / 2; wl.position.set((k ? 1 : -1) * SHIFT, .012, 0); sc.add(wl);
        const glow = new T.Mesh(new T.PlaneGeometry(.7, 6), new T.MeshBasicMaterial({ color: colors[k], transparent: true, opacity: .18, depthWrite: false })); glow.rotation.x = -Math.PI / 2; glow.position.set(wl.position.x, .011, 0); sc.add(glow); }

    // ---- الحبل وكل اللاعبين داخل mover (يتحرك مع pos)
    const mover = new T.Group(); sc.add(mover);
    let ropeY = 1.0;
    const ropeTex = tex(256, 32, (g, w, h) => { for (let x = -h; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#d1a76a' : '#f0d39d'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 + h, h); g.lineTo(x + h, h); g.fill(); } });
    ropeTex.wrapS = T.RepeatWrapping; ropeTex.repeat.set(72, 1);
    const rope = new T.Mesh(new T.CylinderGeometry(.085, .085, 40, 14), new T.MeshStandardMaterial({ map: ropeTex, roughness: .75, emissive: '#5a4020', emissiveIntensity: .35 })); rope.rotation.z = Math.PI / 2; rope.castShadow = true; mover.add(rope);
    const flag = new T.Group(); mover.add(flag);
    const fTex = tex(64, 128, (g, w, h) => { g.fillStyle = colors[0]; g.fillRect(0, 0, w / 2, h); g.fillStyle = colors[1]; g.fillRect(w / 2, 0, w / 2, h); });
    const fl = new T.Mesh(new T.PlaneGeometry(.32, .55), new T.MeshBasicMaterial({ map: fTex, side: T.DoubleSide })); fl.position.y = -.33; flag.add(fl);
    const knot = new T.Mesh(new T.SphereGeometry(.11, 16, 12), new T.MeshStandardMaterial({ color: '#fff', emissive: '#fff', emissiveIntensity: .6 })); flag.add(knot);

    // ---- اللاعبين
    const figs = new Map();
    let state = { teams: [[], []], pos: 0, boost: [false, false], winner: -1 };
    const ready = Promise.resolve().then(sync);

    function makeFig(p, k) {
        const outer = new T.Group(), h = hash(p.id || p.name), girl = p.g != null ? !p.g : (h & 1) === 0;
        const f = shipFigure({ skin: SKINS[h % SKINS.length], hair: HAIRS[(h >>> 3) % HAIRS.length], girl, outfit: colors[k], pants: shade(colors[k], .45) });
        outer.add(f.root);
        const sp = new T.Sprite(new T.SpriteMaterial({ map: label(p.name, colors[k]), depthTest: false, transparent: true })); sp.scale.set(1.5, .375, 1); sp.position.y = 2.2; sp.renderOrder = 10; outer.add(sp);
        const ice = new T.Mesh(new T.BoxGeometry(.8, 1.9, .8), new T.MeshStandardMaterial({ color: '#bae6fd', transparent: true, opacity: .42, roughness: .1, metalness: .1, emissive: '#7dd3fc', emissiveIntensity: .35, depthWrite: false })); ice.position.y = .95; ice.visible = false; outer.add(ice);
        outer.rotation.y = k ? -Math.PI / 2 : Math.PI / 2; // يطالع النص
        mover.add(outer);
        return Object.assign(f, { outer, sp, ice, k, ph: (h % 628) / 100, jerk: 0, x: 0, name: p.name });
    }
    function sync() {
        const seen = new Set();
        const n = Math.max(state.teams[0].length, state.teams[1].length);
        state.teams.forEach((list, k) => {
            const dir = k ? 1 : -1;
            list.forEach((p, i) => {
                const id = p.id || p.name; seen.add(id); let f = figs.get(id);
                if (!f || f.k !== k) { if (f) drop(f); f = makeFig(p, k); if (!f) return; figs.set(id, f); }
                f.x = dir * slot(i, n); f.z = i % 2 ? .3 : -.3; f.frozen = !!p.frozen;
                if (p.out && !f.outAt) { f.outAt = clock.elapsedTime; burstAt(f, '#f97316', 46, 4.2); burstAt(f, '#fde68a', 22, 3); }
                if (!p.out) { f.outAt = 0; f.outer.visible = true; f.outer.scale.setScalar(1); }
                if (!f.outAt) f.outer.position.set(f.x, 0, f.z); f.ly = 2.2 + (i % 2) * .42; // الأسماء بطابقين عشان ما تتراكب
            });
        });
        for (const [id, f] of figs) if (!seen.has(id)) { drop(f); figs.delete(id); }
        fitCam();
    }
    // الكاميرا تقرّب أو تبعد حسب عدد اللاعبين وعرض الملعب: أبعد لاعب + أقصى سحبة لازم يبانون
    let spanX = 6;
    function fitCam() {
        const n = Math.max(1, state.teams[0].length, state.teams[1].length);
        spanX = slot(n - 1, n) + SHIFT * .45 + .5; // أقرب: آخر لاعب + جزء من أقصى سحبة
        const halfH = Math.tan(T.MathUtils.degToRad(cam.fov / 2)), dist = Math.max(5.2, Math.min(17, spanX / (halfH * Math.max(.5, cam.aspect))));
        // far = قبل البداية: الكاميرا بعيدة وأعلى، وبعد العد التنازلي تقرّب بنعومة (frame)
        const d = far ? dist * 1.75 : dist;
        camGoal.pos.set(0, 1.2 + d * (far ? .32 : .2), d); camGoal.look.set(0, 1.0 + d * .02, 0);
        if (!camInit) { camInit = true; cam.position.copy(camGoal.pos); camLook.copy(camGoal.look); cam.lookAt(camLook); }
        cam.updateProjectionMatrix();
    }
    let far = true, camInit = false; const camGoal = { pos: new T.Vector3(), look: new T.Vector3() }, camLook = new T.Vector3(0, 1, 0);
    function drop(f) { f.outer.removeFromParent(); }

    // وضعية الشد: الجسم مايل لورا، الركب منثنية، اليدين قدام على الحبل
    const E = (b, x, y, z) => { if (b) b.rotation.set(x, y, z); };
    function poseShip(f, lean, t, mode) {
        if (mode === 'win') { // الفايز: يدينه فوق ويهتف
            const c = Math.sin(t * 9 + f.ph);
            f.inner.rotation.x = 0; f.legs[0].rotation.x = f.legs[1].rotation.x = 0; f.head.rotation.x = -.15;
            for (const [i, a] of f.arms.entries()) { a.rotation.x = 0; a.rotation.z = (i ? -1 : 1) * (2.6 + c * .25); }
            return;
        }
        if (mode === 'lose') { // الخسران: طايح على ظهره
            f.inner.rotation.x = -1.2; f.legs[0].rotation.x = f.legs[1].rotation.x = -.6; f.head.rotation.x = .2;
            for (const [i, a] of f.arms.entries()) { a.rotation.x = -.4; a.rotation.z = (i ? -1 : 1) * 1.1; }
            return;
        }
        const w = Math.sin(t * 2.2 + f.ph) * .03;
        f.inner.rotation.x = -lean * .9 - w;
        f.legs[0].rotation.x = -.55 + lean * .3; f.legs[1].rotation.x = -.2 + lean * .3;
        for (const [i, a] of f.arms.entries()) { a.rotation.x = -1.35 + lean * .6; a.rotation.z = (i ? -1 : 1) * .32; }
        f.head.rotation.x = lean * .45;
    }

    // ---- جزيئات التأثيرات (شرار، ثلج، انفجار): Sprites بإضاءة جمعية، وحد أقصى عشان الأداء
    const dot = tex(64, 64, (g, w, h) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.85)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    const flake = tex(64, 64, (g) => { g.strokeStyle = '#fff'; g.lineWidth = 5; g.lineCap = 'round'; g.translate(32, 32); for (let i = 0; i < 6; i++) { g.rotate(Math.PI / 3); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 26); g.moveTo(0, 14); g.lineTo(-8, 21); g.moveTo(0, 14); g.lineTo(8, 21); g.stroke(); } });
    const parts = [], fx = new T.Group(); sc.add(fx);
    function spawn(pos, color, n, speed, o = {}) {
        for (let i = 0; i < n && parts.length < 420; i++) {
            const m = new T.Sprite(new T.SpriteMaterial({ map: o.map || dot, color, transparent: true, depthWrite: false, blending: T.AdditiveBlending }));
            const a = Math.random() * Math.PI * 2, u = Math.random() * .9 + .1, sz = (o.size || .22) * (.6 + Math.random() * .8);
            m.position.copy(pos); m.scale.setScalar(sz); fx.add(m);
            parts.push({ m, v: new T.Vector3(Math.cos(a) * speed * u, (o.up != null ? o.up : speed * .8) * (.5 + Math.random()), Math.sin(a) * speed * u * .6), life: o.life || 1.1, age: 0, g: o.g != null ? o.g : 6, sz, spin: (Math.random() - .5) * 6 });
        }
    }
    const _v = new T.Vector3();
    function burstAt(f, color, n, speed, o) { f.outer.getWorldPosition(_v); _v.y += 1.1; spawn(_v.clone(), color, n, speed, o); }
    // الخطاف: رأس معدني لامع يطير على الحبل من طرف فريقه للنص
    const hookMesh = new T.Group(); hookMesh.visible = false; sc.add(hookMesh);
    { const hm = new T.MeshStandardMaterial({ color: '#f9a8d4', emissive: '#ec4899', emissiveIntensity: 1.2, metalness: .6, roughness: .25 });
      const arc = new T.Mesh(new T.TorusGeometry(.32, .07, 10, 24, Math.PI * 1.25), hm); arc.rotation.z = Math.PI * .9; hookMesh.add(arc);
      const shaft = new T.Mesh(new T.CylinderGeometry(.06, .06, .9, 10), hm); shaft.position.set(.32, .45, 0); hookMesh.add(shaft);
      const tip = new T.Mesh(new T.ConeGeometry(.12, .25, 10), hm); tip.position.set(-.3, -.1, 0); tip.rotation.z = Math.PI * .75; hookMesh.add(tip); }
    let hookAnim = null, flash = { k: -1, t: 0, c: null };
    function effect(kind, k, ids) {
        const list = (ids || []).map(id => figs.get(id)).filter(Boolean);
        if (kind === 'freeze') { for (const f of list) { burstAt(f, '#bae6fd', 26, 2.6, { map: flake, size: .34, g: 1.5, life: 1.6 }); burstAt(f, '#7dd3fc', 30, 3.2); } flash = { k: 1 - k, t: 1, c: '#7dd3fc' }; }
        if (kind === 'boost') { for (const f of figs.values()) if (f.k === k && !f.outAt) burstAt(f, '#fbbf24', 14, 2.4, { up: 3.5, g: 2 }); flash = { k, t: 1, c: '#fbbf24' }; }
        if (kind === 'hook') { const dir = k ? 1 : -1; hookAnim = { k, t: 0, from: dir * 11, to: 0 }; hookMesh.visible = true; hookMesh.scale.set(dir > 0 ? 1.6 : -1.6, 1.6, 1.6); for (const f of figs.values()) if (f.k === k) f.jerk = 1; }
        if (kind === 'support') { for (const f of list) burstAt(f, colors[k], 30, 3); for (const f of figs.values()) if (f.k === k) f.jerk = Math.max(f.jerk, .6); }
    }

    const clock = new T.Clock(); let raf = 0, last = -1e9, posX = 0, measured = false;
    function frame(now) {
        raf = requestAnimationFrame(frame); if (now - last < 29) return; last = now; // 30 إطار/ث (نفس البث)
        const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
        const target = Math.max(-1, Math.min(1, state.pos / 100)) * SHIFT;
        posX += (target - posX) * (1 - Math.exp(-dt * 7)); mover.position.x = posX;
        { const k = 1 - Math.exp(-dt * 1.8); cam.position.lerp(camGoal.pos, k); camLook.lerp(camGoal.look, k); cam.lookAt(camLook); }
        flag.position.set(0, ropeY, 0);
        for (const f of figs.values()) {
            if (f.outAt) { // منقصى: ينقذف لجهة الخصم وهو يلف، ويصغر لين يختفي
                const u = Math.min(1, (t - f.outAt) / 1.1), dir = f.k ? -1 : 1;
                f.outer.position.set(f.x + dir * u * 3.2, Math.sin(u * Math.PI) * 1.8, f.z + u * 1.2);
                f.outer.rotation.z = dir * u * 5; f.outer.scale.setScalar(Math.max(.001, 1 - u * u)); f.outer.visible = u < 1;
                poseShip(f, 0, t, 'win'); continue;
            }
            if (state.boost[f.k] && state.winner < 0 && Math.random() < dt * 2.5) burstAt(f, '#fbbf24', 2, 1.2, { up: 2.6, g: 1, life: .9, size: .16 });
            f.jerk = Math.max(0, f.jerk - dt * 3.5);
            const won = state.winner === f.k, lost = state.winner >= 0 && !won;
            const boost = state.boost[f.k] ? .08 : 0;
            const lean = f.frozen ? .05 : lost ? .02 : .38 + boost + f.jerk * .35 + (won ? -.3 : 0);
            f.ice.visible = !!f.frozen;
            poseShip(f, lean, t, won ? 'win' : lost ? 'lose' : null);
            f.sp.position.y = lost ? f.ly - 1.15 : f.ly;
            if (won) f.outer.position.y = Math.abs(Math.sin(t * 6 + f.ph)) * .25; else f.outer.position.y = 0;
        }
        for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.age += dt; const a = p.age / p.life;
            if (a >= 1) { fx.remove(p.m); p.m.material.dispose(); parts.splice(i, 1); continue; }
            p.v.y -= p.g * dt; p.m.position.addScaledVector(p.v, dt); p.m.material.opacity = 1 - a * a; p.m.material.rotation += p.spin * dt; p.m.scale.setScalar(p.sz * (1 - a * .4)); }
        if (hookAnim) { hookAnim.t += dt / .55; const u = Math.min(1, hookAnim.t);
            hookMesh.position.set(hookAnim.from + (hookAnim.to - hookAnim.from) * (1 - Math.pow(1 - u, 3)) + posX, ropeY + .25 + Math.sin(u * Math.PI) * .6, 0); hookMesh.rotation.y = u * Math.PI * 2;
            spawn(hookMesh.position.clone(), '#f472b6', 2, .8, { up: .5, g: 0, life: .5, size: .2 });
            if (u >= 1) { spawn(new T.Vector3(posX, ropeY, 0), '#f472b6', 50, 4.5); spawn(new T.Vector3(posX, ropeY, 0), '#ffffff', 20, 3); hookMesh.visible = false; hookAnim = null; } }
        if (flash.t > 0) { flash.t = Math.max(0, flash.t - dt * 1.4); const L = flash.k ? glowR : glowL; L.color.set(flash.c); L.intensity = 18 + flash.t * 90; if (flash.t === 0) L.color.set(colors[flash.k]); }
        // ارتفاع الحبل = ارتفاع يدين أول لاعب (مرة وحدة بعد ما تطلع الشخصيات)
        if (!measured && figs.size) { const f = [...figs.values()].find(x => !x.outAt); if (f) { f.outer.updateMatrixWorld(true);
            const hand = f.arms[0].children[1];
            if (hand) { const v = hand.getWorldPosition(new T.Vector3()); if (v.y > .4) { ropeY = v.y; rope.position.y = ropeY; measured = true; } } } }
        r.render(sc, cam);
    }
    const ro = new ResizeObserver(() => { const w = container.clientWidth || 1, h = container.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h;
        // الشاشات الضيقة: الكاميرا ترجع لورا عشان يبان الملعب كامل
        fitCam(); });
    ro.observe(container); rope.position.y = ropeY;
    raf = requestAnimationFrame(frame);

    return {
        ready,
        setState(s) { state = { ...state, ...s }; sync(); },
        pull(id) { const f = figs.get(id); if (f) f.jerk = 1; },
        effect,
        // true = الكاميرا بعيدة (قبل البداية) · false = تقرّب للعب
        setFar(v) { far = !!v; fitCam(); },
        stop() { cancelAnimationFrame(raf); ro.disconnect(); for (const f of figs.values()) drop(f); r.dispose(); r.domElement.remove(); }
    };
}
