/**
 * «شد الحبل» — الملعب ثلاثي الأبعاد (Three.js 0.160) بشخصيات سفينة النجاة
 * (نسخة من figure() بـ games/survival-ship/ship3d.js)، قميصها وعصابتها بلون الفريق.
 *
 * يحتاج importmap فيه three (game.html).
 *
 * createTugScene(container, { colors:[يسار، يمين] }) ← { ready, setState, pull, stop }
 *   setState({ teams:[[{id,name,g,frozen}],[...]], pos:-100..100, boost:[bool,bool], winner:-1|0|1 })
 *   pull(id): سحبة لاعب (حركة شد قوية لحظية)
 */
import * as THREE from 'three';

const T = THREE;
// المسافة بين اللاعبين: مريحة (1م) للعدد القليل، وما تقل عن 0.62م حتى مع 18 لاعب
const stepFor = n => Math.max(.62, Math.min(1, 6.2 / Math.max(1, n - 1)));
const SHIFT = 3.2;          // المسافة من النص لخط الفوز (pos = ±100)
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
    const colors = (opts.colors || ['#ff5b45', '#19a7ff']).slice();
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
    const ropeTex = tex(256, 32, (g, w, h) => { for (let x = -h; x < w; x += 16) { g.fillStyle = (x / 16) % 2 ? '#a87a3f' : '#c89b5c'; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 16, 0); g.lineTo(x + 16 + h, h); g.lineTo(x + h, h); g.fill(); } });
    ropeTex.wrapS = T.RepeatWrapping; ropeTex.repeat.set(72, 1);
    const rope = new T.Mesh(new T.CylinderGeometry(.055, .055, 40, 12), new T.MeshStandardMaterial({ map: ropeTex, roughness: .9 })); rope.rotation.z = Math.PI / 2; rope.castShadow = true; mover.add(rope);
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
        state.teams.forEach((list, k) => {
            const dir = k ? 1 : -1, n = list.length, step = stepFor(n);
            list.forEach((p, i) => {
                const id = p.id || p.name; seen.add(id); let f = figs.get(id);
                if (!f || f.k !== k) { if (f) drop(f); f = makeFig(p, k); if (!f) return; figs.set(id, f); }
                f.x = dir * (1.15 + i * step); f.z = i % 2 ? .3 : -.3; f.frozen = !!p.frozen;
                f.outer.position.set(f.x, 0, f.z); f.ly = 2.2 + (i % 2) * .42; // الأسماء بطابقين عشان ما تتراكب
            });
        });
        for (const [id, f] of figs) if (!seen.has(id)) { drop(f); figs.delete(id); }
        fitCam();
    }
    // الكاميرا تقرّب أو تبعد حسب عدد اللاعبين وعرض الملعب: أبعد لاعب + أقصى سحبة لازم يبانون
    let spanX = 6;
    function fitCam() {
        const n = Math.max(1, state.teams[0].length, state.teams[1].length), step = stepFor(n);
        spanX = 1.15 + (n - 1) * step + SHIFT * .8 + .9;
        const halfH = Math.tan(T.MathUtils.degToRad(cam.fov / 2)), dist = Math.max(6.5, Math.min(19, spanX / (halfH * Math.max(.5, cam.aspect))));
        cam.position.set(0, 1.2 + dist * .2, dist); cam.lookAt(0, 1.0 + dist * .02, 0); cam.updateProjectionMatrix();
    }
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

    const clock = new T.Clock(); let raf = 0, last = -1e9, posX = 0, measured = false;
    function frame(now) {
        raf = requestAnimationFrame(frame); if (now - last < 29) return; last = now; // 30 إطار/ث (نفس البث)
        const dt = Math.min(.05, clock.getDelta()), t = clock.elapsedTime;
        const target = Math.max(-1, Math.min(1, state.pos / 100)) * SHIFT;
        posX += (target - posX) * (1 - Math.exp(-dt * 7)); mover.position.x = posX;
        flag.position.set(0, ropeY, 0);
        for (const f of figs.values()) {
            f.jerk = Math.max(0, f.jerk - dt * 3.5);
            const won = state.winner === f.k, lost = state.winner >= 0 && !won;
            const boost = state.boost[f.k] ? .08 : 0;
            const lean = f.frozen ? .05 : lost ? .02 : .38 + boost + f.jerk * .35 + (won ? -.3 : 0);
            f.ice.visible = !!f.frozen;
            poseShip(f, lean, t, won ? 'win' : lost ? 'lose' : null);
            f.sp.position.y = lost ? f.ly - 1.15 : f.ly;
            if (won) f.outer.position.y = Math.abs(Math.sin(t * 6 + f.ph)) * .25; else f.outer.position.y = 0;
        }
        // ارتفاع الحبل = ارتفاع يدين أول لاعب (مرة وحدة بعد ما تطلع الشخصيات)
        if (!measured && figs.size) { const f = figs.values().next().value; f.outer.updateMatrixWorld(true);
            const hand = f.arms[0].children[1];
            if (hand) { const v = hand.getWorldPosition(new T.Vector3()); if (v.y > .4) { ropeY = v.y; rope.position.y = ropeY; measured = true; } } }
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
        stop() { cancelAnimationFrame(raf); ro.disconnect(); for (const f of figs.values()) drop(f); r.dispose(); r.domElement.remove(); }
    };
}
