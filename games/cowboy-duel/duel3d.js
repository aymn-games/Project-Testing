// «مواجهة الغرب» — المشهد الثري دي (عرض فقط، منطق اللعبة كله في duel-game.js).
// سوق كاوبوي: شارع ترابي، محلات بواجهات خشبية ولوحات عربية، برج ساعة، طاحونة، خزان ماء، هضاب الصحراء.
// الشخصيات: نفس شخصيات «سفينة النجاة» (games/survival-ship/ship3d.js → figure) بلبس كاوبوي:
//   قبعة، صدرية، منديل رقبة، حزام بجراب مسدس، جزمة بمهماز. الألوان ثابتة لكل لاعب (hash من id).
// المخرج (director): كل مشهد مجموعة لقطات (shots) بقطع سينمائي — رافعة، لقطة الجزم، بروفايل،
//   عيون قريبة جداً، اليد على الجراب، ساعة الظهيرة، فوق الكتف، الرصاصة بالتصوير البطيء، السقوط، لقطة البطل.
// API: mountDuel(el, {onEvent}) → { setPlayers, duelIntro, standoff, fire, removePlayer, returnToCrowd, champion, lobby, stop }
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const T = THREE;

const PAL = {
    skin: ['#f6d3b3', '#eec19a', '#d9a37a', '#c68c5e', '#a8714a', '#f3c9a6'],
    hair: ['#2b1a10', '#4a2c17', '#6b3e1f', '#1c1c1c', '#8a5a2b', '#c9a15a'],
    hat: ['#5b3a1e', '#2b1d14', '#c8a165', '#7a2e1b', '#e3d3b0', '#3a2a1e', '#8c5a2e'],
    shirt: ['#8b2e2e', '#c96f3b', '#d8c39a', '#3e5c76', '#6b7f3a', '#efe6d2', '#a34a28', '#5e4b8b'],
    vest: ['#3b2416', '#5a3a22', '#2f2a26', '#7b4a26', '#4a3b2a', '#6a2c1c'],
    pants: ['#3d4a5c', '#4b3a2a', '#5c4632', '#2d3340', '#6b5a43'],
    band: ['#b91c1c', '#1e3a8a', '#d97706', '#111827', '#7c2d12', '#0f766e']
};
function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function pick(a, h, salt) { let x = Math.imul(h ^ Math.imul(salt + 1, 0x9e3779b1), 0x85ebca6b); x ^= x >>> 13; x = Math.imul(x, 0xc2b2ae35); x ^= x >>> 16; return a[(x >>> 0) % a.length]; }
const ease = k => k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const clamp01 = k => Math.max(0, Math.min(1, k));
function lerpAng(a, b, k) { const d = ((b - a + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; return a + d * k; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
const V = (x, y, z) => new T.Vector3(x, y, z);

// تجميع الأجسام الثابتة (المحلات والديكور) في mesh واحد لكل لون = عدد رسم قليل (draw calls)
class Batch {
    constructor() { this.groups = new Map(); }
    geo(g, color, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
        const m = new T.Matrix4().compose(V(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(rx, ry, rz)), V(sx, sy, sz));
        const n = g.index ? g.toNonIndexed() : g; if (n !== g) g.dispose(); n.applyMatrix4(m);
        if (!this.groups.has(color)) this.groups.set(color, []); this.groups.get(color).push(n);
    }
    box(w, h, d, c, x, y, z, rx, ry, rz) { this.geo(new T.BoxGeometry(w, h, d), c, x, y, z, rx, ry, rz); }
    cyl(rt, rb, h, seg, c, x, y, z, rx, ry, rz) { this.geo(new T.CylinderGeometry(rt, rb, h, seg), c, x, y, z, rx, ry, rz); }
    build(parent, matFor) {
        for (const [c, list] of this.groups) {
            let n = 0; list.forEach(g => n += g.attributes.position.count);
            const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o = 0;
            list.forEach(g => { const a = g.attributes; P.set(a.position.array, o * 3); N.set(a.normal.array, o * 3); if (a.uv) U.set(a.uv.array, o * 2); o += a.position.count; g.dispose(); });
            const geo = new T.BufferGeometry(); geo.setAttribute('position', new T.BufferAttribute(P, 3)); geo.setAttribute('normal', new T.BufferAttribute(N, 3)); geo.setAttribute('uv', new T.BufferAttribute(U, 2)); geo.computeBoundingSphere();
            const mesh = new T.Mesh(geo, matFor(c)); mesh.castShadow = mesh.receiveShadow = true; parent.add(mesh);
        }
        this.groups.clear();
    }
}

export async function mountDuel(el, opts = {}) {
    const emit = opts.onEvent || (() => {});
    try { await Promise.race([Promise.all(['64px Rakkas', '64px Rye', '700 40px "IBM Plex Sans Arabic"'].map(f => document.fonts.load(f))), new Promise(r => setTimeout(r, 2500))]); } catch (e) { }

    const r = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.08;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap;
    el.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%';

    const sc = new T.Scene();
    sc.fog = new T.Fog('#efbd85', 70, 380);
    const cam = new T.PerspectiveCamera(40, 1, .1, 1200);

    // ---------- السماء (قبة بتدرّج غروب) + الشمس
    {
        const g = new T.SphereGeometry(900, 32, 16), p = g.attributes.position, col = [];
        const stops = [[-1, '#e9b27a'], [0, '#f7d7a4'], [.08, '#f3b874'], [.25, '#d9875a'], [.55, '#8a6f9a'], [1, '#3f4f7d']].map(([y, c]) => [y, new T.Color(c)]);
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 900; let a = stops[0], b = stops[stops.length - 1]; for (let j = 0; j < stops.length - 1; j++) if (y >= stops[j][0] && y <= stops[j + 1][0]) { a = stops[j]; b = stops[j + 1]; break; } const c = a[1].clone().lerp(b[1], (y - a[0]) / ((b[0] - a[0]) || 1)); col.push(c.r, c.g, c.b); }
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        sc.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })));
    }
    const sunDir = V(60, 20, -26).normalize();
    const sunTex = canvasTex(256, 256, (g, w, h) => { const rg = g.createRadialGradient(128, 128, 0, 128, 128, 128); rg.addColorStop(0, 'rgba(255,250,225,1)'); rg.addColorStop(.18, 'rgba(255,226,150,1)'); rg.addColorStop(.3, 'rgba(255,190,110,.55)'); rg.addColorStop(1, 'rgba(255,160,90,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); });
    const sunSpr = new T.Sprite(new T.SpriteMaterial({ map: sunTex, fog: false, depthWrite: false, transparent: true, blending: T.AdditiveBlending }));
    sunSpr.position.copy(sunDir).multiplyScalar(700); sunSpr.scale.setScalar(220); sc.add(sunSpr);

    // ---------- الإضاءة: سماء/أرض دافية + شمس عصر منخفضة (ظلال طويلة) + إضاءة خلفية زرقا خفيفة
    sc.add(new T.HemisphereLight('#ffe2b8', '#7a4a2a', .95));
    const sun = new T.DirectionalLight('#ffc98a', 2.7); sun.position.copy(sunDir).multiplyScalar(60); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .03;
    Object.assign(sun.shadow.camera, { left: -60, right: 60, top: 50, bottom: -50, near: 1, far: 200 }); sc.add(sun); sc.add(sun.target);
    const rim = new T.DirectionalLight('#ffd7b0', .85); rim.position.set(-40, 18, 30); sc.add(rim);

    // ---------- الأرض الترابية + الشارع بآثار العجلات والحوافر
    const dirt = canvasTex(512, 512, (g, w, h) => {
        g.fillStyle = '#c9935c'; g.fillRect(0, 0, w, h);
        for (let i = 0; i < 9000; i++) { const t = Math.random(); g.fillStyle = t < .4 ? 'rgba(120,72,36,.18)' : t < .8 ? 'rgba(240,200,150,.2)' : 'rgba(90,55,30,.35)'; const s = Math.random() * 3 + .5; g.fillRect(Math.random() * w, Math.random() * h, s, s); }
        for (let i = 0; i < 70; i++) { g.fillStyle = 'rgba(110,70,40,.45)'; g.beginPath(); g.ellipse(Math.random() * w, Math.random() * h, 2 + Math.random() * 4, 1.5 + Math.random() * 3, Math.random() * 3, 0, 7); g.fill(); }
    });
    dirt.wrapS = dirt.wrapT = T.RepeatWrapping; dirt.repeat.set(70, 70);
    const ground = new T.Mesh(new T.PlaneGeometry(900, 900), new T.MeshStandardMaterial({ map: dirt, roughness: 1, color: '#e7b98a' }));
    ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; sc.add(ground);
    const ruts = canvasTex(1024, 128, (g, w, h) => {
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(120,70,35,0)'); gr.addColorStop(.2, 'rgba(120,70,35,.22)'); gr.addColorStop(.8, 'rgba(120,70,35,.22)'); gr.addColorStop(1, 'rgba(120,70,35,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.strokeStyle = 'rgba(85,50,25,.45)'; g.lineWidth = 5; for (const y of [38, 52, 76, 90]) { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= w; x += 32) g.lineTo(x, y + Math.sin(x * .02 + y) * 2.5); g.stroke(); }
        g.fillStyle = 'rgba(85,50,25,.35)'; for (let i = 0; i < 160; i++) { g.beginPath(); g.ellipse(Math.random() * w, 20 + Math.random() * 88, 4, 3, 0, 0, 7); g.fill(); }
    });
    ruts.wrapS = T.RepeatWrapping; ruts.repeat.set(6, 1);
    const street = new T.Mesh(new T.PlaneGeometry(240, 26), new T.MeshStandardMaterial({ map: ruts, transparent: true, depthWrite: false, roughness: 1 }));
    street.rotation.x = -Math.PI / 2; street.position.set(-25, .02, 0); street.receiveShadow = true; sc.add(street);

    // ---------- خامات الخشب المشتركة
    const grain = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); for (let y = 0; y < h; y += 32) { g.fillStyle = 'rgba(60,35,15,.28)'; g.fillRect(0, y, w, 3); } for (let i = 0; i < 260; i++) { g.strokeStyle = `rgba(80,50,25,${.05 + Math.random() * .12})`; g.lineWidth = 1; const y = Math.random() * h; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(w * .3, y + Math.random() * 6 - 3, w * .6, y + Math.random() * 6 - 3, w, y); g.stroke(); } });
    const MAT = new Map();
    const matFor = c => { if (MAT.has(c)) return MAT.get(c); let m;
        if (c[0] === '!') m = new T.MeshStandardMaterial({ color: c.slice(1), emissive: c.slice(1), emissiveIntensity: .9, roughness: .4 });
        else if (c[0] === '@') m = new T.MeshStandardMaterial({ color: c.slice(1), roughness: .9, flatShading: true });
        else m = new T.MeshStandardMaterial({ color: c, map: grain, roughness: .88 });
        MAT.set(c, m); return m; };

    // ---------- السوق: صفّين محلات متقابلة على الشارع
    const B = new Batch();
    // سوق طويل وعريض: صفّين محلات من x=-84 لين x=66، والبرج بعيد بنهاية الشارع (TX)
    const ZF = 18, X0 = -84, X1 = 66; // واجهات المحلات على بعد 18 من منتصف الشارع
    const NAMES = [['الإسطبل', 'STABLE'], ['فندق الصحراء', 'HOTEL'], ['الصالون', 'SALOON'], ['البنك', 'BANK'], ['الحلّاق', 'BARBER'], ['البريد', 'POST OFFICE'],
        ['متجر عام', 'GENERAL STORE'], ['الحدّاد', 'BLACKSMITH'], ['مكتب الشريف', 'SHERIFF'], ['تاجر السلاح', 'GUNSMITH'], ['قهوة الوادي', 'COFFEE'], ['الخيّاط', 'TAILOR'],
        ['المطعم', 'EATS'], ['العطّار', 'APOTHECARY'], ['التلغراف', 'TELEGRAPH'], ['شركة المنجم', 'MINING CO.'], ['مخزن الحبوب', 'FEED & SEED'], ['صانع السروج', 'SADDLERY'],
        ['المخبز', 'BAKERY'], ['الطبيب', 'DOCTOR'], ['المدرسة', 'SCHOOLHOUSE'], ['مكتب الأراضي', 'LAND OFFICE'], ['فاحص الذهب', 'ASSAY OFFICE'], ['الجريدة', 'GAZETTE'],
        ['دار الضيافة', 'BOARDING HOUSE'], ['مركز التجارة', 'TRADING POST'], ['صانع العجلات', 'WHEELWRIGHT'], ['محطة العربات', 'STAGECOACH'], ['الإسكافي', 'COBBLER'], ['تاجر الجلود', 'FUR TRADER'],
        ['الصيدلية', 'DRUG STORE'], ['البقّالة', 'GROCERY']];
    const BODY = ['#9c6b3f', '#a0522d', '#7d4b2a', '#c19a6b', '#6e3b2a', '#b5653a', '#8b5a2b', '#a67b5b'], TRIM = ['#e8d8b8', '#f0e2c4', '#e8c27a', '#5a3a22', '#3d2817'];
    let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const SHOPS = []; let ni = 0;
    for (const s of [-1, 1]) { let x = X0 + (s > 0 ? 3 : 0); while (x < X1) { const w = 7.5 + Math.floor(rnd() * 6) * .5, h = 7.5 + Math.floor(rnd() * 5) * .5;
        const [ar, en] = NAMES[ni++ % NAMES.length]; SHOPS.push([x + w / 2, s, w, h, BODY[ni % BODY.length], TRIM[(ni * 3) % TRIM.length], ar, en]); x += w + .6 + rnd() * .8; } }
    const signGeo = [], posterSpots = [];
    SHOPS.forEach(([x, s, w, h, col, trim, ar, en], idx) => {
        const zf = s * ZF, o = -s, D = 10;
        B.box(w, h * .8, D, col, x, h * .4, zf + s * D / 2);
        B.box(w + .3, h, .4, col, x, h / 2, zf);
        B.box(w + .8, .4, .8, trim, x, h + .15, zf);
        B.box(w + .5, .18, .55, trim, x, h - .55, zf + o * .05);
        for (const sx of [-1, 1]) B.box(.3, h, .55, trim, x + sx * w / 2, h / 2, zf);
        B.box(w, .36, 3.4, '#8a6440', x, .18, zf + o * 1.7);                                  // الممشى الخشبي
        B.box(w + .2, .16, 3.8, '#6b4a2b', x, 3.75, zf + o * 1.85, -s * .15, 0, 0);           // المظلّة
        for (const px of [x - w / 2 + .35, x + w / 2 - .35]) { B.box(.24, 3.1, .24, '#5a3a22', px, 1.9, zf + o * 3.35); posterSpots.push([px, zf + o * 3.35, s, idx]); }
        B.box(w, .12, .12, '#5a3a22', x, 1.2, zf + o * 3.35);                                   // درابزين الممشى
        // الباب (الصالون = باب مرجيحة)
        B.box(1.6, 2.7, .14, '#2e1c10', x, 1.7, zf + o * .25); B.box(2, .22, .22, trim, x, 3.12, zf + o * .27);
        if (en === 'SALOON') for (const sx of [-1, 1]) B.box(.74, 1.15, .08, '#b07a45', x + sx * .39, 1.75, zf + o * .45);
        // الشبابيك (بعضها مضاء)
        const win = (wx, wy, ww, wh, lit) => { B.box(ww + .3, wh + .3, .12, trim, wx, wy, zf + o * .22); B.box(ww, wh, .1, lit ? '!#ffbe63' : '#2a1a12', wx, wy, zf + o * .29); B.box(.08, wh, .12, trim, wx, wy, zf + o * .34); B.box(ww, .08, .12, trim, wx, wy, zf + o * .34); };
        for (const sx of [-1, 1]) win(x + sx * w * .3, 1.95, 1.5, 1.4, (idx + sx) % 3 === 0);
        if (h >= 8.5) for (const sx of [-1, 1]) win(x + sx * w * .27, 5.35, 1.15, 1.35, (idx * 3 + sx) % 4 === 0);
        if (en === 'HOTEL') { B.box(w, .2, 1.5, '#6b4a2b', x, 4.45, zf + o * .8); B.box(w, .1, .1, trim, x, 5.25, zf + o * 1.5); for (let bx = -w / 2 + .3; bx <= w / 2 - .3; bx += .55) B.box(.07, .8, .07, trim, x + bx, 4.9, zf + o * 1.5); }
        signGeo.push({ x, y: h - 1.4, z: zf + o * .24, s, w: Math.min(w * .82, 7.6), ar, en, dark: idx % 3 === 1 });
    });
    // أعمدة ربط الخيول + أحواض ماء + براميل + صناديق + تبن على طول السوق (بعيد عن نص الشارع وين المواجهة)
    const barrel = (x, z) => { B.cyl(.45, .42, 1.05, 12, '#7a4a22', x, .88, z); for (const y of [.58, 1.2]) B.cyl(.47, .47, .07, 12, '@#2f2f2f', x, y, z); };
    for (let x = X0 + 6; x < X1 - 4; x += 9) for (const s of [-1, 1]) { const r = rnd(), xx = x + rnd() * 4;
        if (r < .3 && Math.abs(xx) > 6) { const z = s * (ZF - 4.6); for (const dx of [-1.6, 1.6]) B.box(.22, 1.3, .22, '#5a3a22', xx + dx, .65, z); B.box(3.6, .14, .14, '#6b4a2b', xx, 1.15, z); B.box(2.2, .7, .9, '#7a5230', xx + 3.2, .35, z + s * .2); B.box(2, .1, .7, '@#4b7c8c', xx + 3.2, .62, z + s * .2); }
        else if (r < .6) barrel(xx, s * (ZF - .9));
        else if (r < .8) { B.box(.95, .95, .95, '#a87a4a', xx, .84, s * (ZF - 1.2), 0, r, 0); B.box(.7, .7, .7, '#b88a56', xx + .1, 1.66, s * (ZF - 1.2), 0, r + .4, 0); }
        else B.cyl(.62, .62, 1.3, 12, '@#d4b048', xx, .98, s * (ZF - 1.1), 0, 0, Math.PI / 2); }

    // برج الساعة بنهاية الشارع (لقطة «الظهيرة»)
    const TX = -112; // البرج بعيد بآخر الشارع
    B.box(7, 13, 7, '#b5653a', TX, 6.5, 0); B.box(7.6, .5, 7.6, '#f0e2c4', TX, 13.2, 0); B.box(7.8, .5, 7.8, '#f0e2c4', TX, 6.8, 0);
    B.geo(new T.ConeGeometry(5.7, 4.5, 4), '@#5a3a22', TX, 15.7, 0, 0, Math.PI / 4, 0);
    B.box(.2, 3.4, 2.2, '#2e1c10', TX + 3.55, 1.7, 0);
    const clockTex = canvasTex(256, 256, (g, w, h) => { g.fillStyle = '#f4e6c4'; g.beginPath(); g.arc(128, 128, 124, 0, 7); g.fill(); g.lineWidth = 10; g.strokeStyle = '#3d2817'; g.stroke(); g.fillStyle = '#3d2817'; g.font = '30px Rye, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; ['XII', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'].forEach((n, i) => { const a = i / 12 * Math.PI * 2; g.fillText(n, 128 + Math.sin(a) * 92, 128 - Math.cos(a) * 92); }); });
    const clock = new T.Mesh(new T.CircleGeometry(2, 40), new T.MeshStandardMaterial({ map: clockTex, roughness: .6 })); clock.position.set(TX + 3.56, 10, 0); clock.rotation.y = Math.PI / 2; sc.add(clock);
    const handM = new T.MeshStandardMaterial({ color: '#1f140c' });
    const mkHand = (len, wd) => { const g = new T.Group(); const m = new T.Mesh(new T.BoxGeometry(.05, len, wd), handM); m.position.y = len / 2 - .1; g.add(m); g.position.set(TX + 3.62, 10, 0); sc.add(g); return g; };
    const hourHand = mkHand(1.05, .14), minHand = mkHand(1.65, .09); hourHand.rotation.x = .02; minHand.rotation.x = .21;

    // طاحونة هواء خلف الصف الجنوبي (شفراتها تدور)
    const WX = -29, WZ = 33;
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) B.box(.25, 16.4, .25, '@#6b4a2b', WX + dx * 1.2, 8, WZ + dz * 1.2, dz * .08, 0, -dx * .08);
    for (const y of [4, 8, 12]) { B.box(2.6 - y * .08, .15, .15, '@#6b4a2b', WX, y, WZ - 1.2 + y * .07); B.box(2.6 - y * .08, .15, .15, '@#6b4a2b', WX, y, WZ + 1.2 - y * .07); }
    B.box(1.2, 1, 1.6, '@#5a3a22', WX, 16.4, WZ); B.box(.1, 1.6, 2.6, '@#b5653a', WX, 16.6, WZ + 2);
    const blades = new T.Group(); blades.position.set(WX, 16.5, WZ - 1); sc.add(blades);
    const bladeM = new T.MeshStandardMaterial({ color: '#d8c3a0', roughness: .8, flatShading: true });
    for (let i = 0; i < 12; i++) { const b = new T.Mesh(new T.BoxGeometry(.5, 2.6, .06), bladeM); const a = i / 12 * Math.PI * 2; b.position.set(Math.sin(a) * 1.9, Math.cos(a) * 1.9, 0); b.rotation.z = -a; b.rotation.y = .4; b.castShadow = true; blades.add(b); }

    // خزان ماء خلف الصف الشمالي
    for (const [dx, dz] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) B.box(.35, 8.4, .35, '@#5a3a22', 26 + dx, 4.2, -33 + dz);
    B.cyl(2.8, 2.8, 3.6, 16, '#8a5a32', 26, 10.2, -33); for (const y of [9, 11.4]) B.cyl(2.86, 2.86, .12, 16, '@#2f2f2f', 26, y, -33);
    B.geo(new T.ConeGeometry(3.1, 1.6, 16), '@#5a3a22', 26, 12.8, -33);

    // صبّار + صخور + هضاب حمرا بالأفق
    const cactus = (x, z, s) => { const c = '@#5f8a3e'; B.cyl(.32 * s, .38 * s, 3.4 * s, 8, c, x, 1.7 * s, z); B.cyl(.2 * s, .2 * s, .9 * s, 8, c, x + .55 * s, 1.6 * s, z, 0, 0, Math.PI / 2); B.cyl(.2 * s, .2 * s, 1.2 * s, 8, c, x + .95 * s, 2.15 * s, z); B.cyl(.18 * s, .18 * s, .7 * s, 8, c, x - .5 * s, 2.2 * s, z, 0, 0, Math.PI / 2); B.cyl(.18 * s, .18 * s, 1 * s, 8, c, x - .82 * s, 2.7 * s, z); };
    [[74, 9, 1.1], [80, -12, 1.4], [90, 4, 1], [72, -15, .9], [-100, 16, 1], [96, -6, 1.6], [-104, -15, 1.2], [84, 18, 1.3], [5, 38, 1.5], [-8, -40, 1.4], [-122, 9, 1.3], [-126, -8, 1]].forEach(a => cactus(...a));
    for (let i = 0; i < 26; i++) { const a = Math.random() * Math.PI * 2, d = 40 + Math.random() * 60, s = .5 + Math.random() * 1.6; const x = Math.cos(a) * d, z = Math.sin(a) * d; if (Math.abs(z) < 30 && x > -120 && x < 72) continue; B.geo(new T.DodecahedronGeometry(s, 0), '@#a2643b', x, s * .4, z, Math.random(), Math.random(), 0); }
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + Math.random() * .2, d = 200 + Math.random() * 140, w = 22 + Math.random() * 40, h = 18 + Math.random() * 36; const x = Math.cos(a) * d, z = Math.sin(a) * d, c = ['@#b85c34', '@#a34e2c', '@#c86f40'][i % 3];
        B.geo(new T.CylinderGeometry(w * .72, w, h, 7), c, x, h / 2, z, 0, Math.random(), 0); B.geo(new T.CylinderGeometry(w * .45, w * .6, h * .35, 6), c, x + w * .2, h + h * .17, z, 0, Math.random(), 0); }
    B.build(sc, matFor);

    // لوحات المحلات (عربي كبير + إنجليزي صغير بخط الغرب)
    const texList = [];
    signGeo.forEach(sg => {
        const tx = canvasTex(640, 170, (g, w, h) => {
            g.fillStyle = sg.dark ? '#2b1d14' : '#ead2a0'; g.fillRect(0, 0, w, h);
            for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(${sg.dark ? '255,220,170' : '90,55,25'},${Math.random() * .06})`; g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3); }
            g.strokeStyle = sg.dark ? '#c9a15a' : '#5a3a22'; g.lineWidth = 10; g.strokeRect(9, 9, w - 18, h - 18);
            g.fillStyle = sg.dark ? '#c9a15a' : '#5a3a22'; for (const [nx, ny] of [[24, 24], [w - 24, 24], [24, h - 24], [w - 24, h - 24]]) { g.beginPath(); g.arc(nx, ny, 5, 0, 7); g.fill(); }
            g.textAlign = 'center'; g.textBaseline = 'middle'; g.direction = 'rtl';
            g.fillStyle = sg.dark ? '#f0d9a0' : '#5a2a14'; g.font = '82px Rakkas, serif'; g.fillText(sg.ar, w / 2, 70, w - 60);
            g.direction = 'ltr'; g.fillStyle = sg.dark ? '#d9a35a' : '#8a3a1a'; g.font = '28px Rye, serif'; g.fillText('— ' + sg.en + ' —', w / 2, 138, w - 80);
        }); texList.push(tx);
        const m = new T.Mesh(new T.PlaneGeometry(sg.w, sg.w * 170 / 640), new T.MeshStandardMaterial({ map: tx, roughness: .8 }));
        m.position.set(sg.x, sg.y, sg.z); m.rotation.y = sg.s < 0 ? 0 : Math.PI; m.castShadow = true; sc.add(m);
    });
    // ملصقات «مطلوب» على أعمدة الممشى
    const wanted = canvasTex(256, 340, (g, w, h) => {
        g.fillStyle = '#efdcb2'; g.fillRect(0, 0, w, h); const rg = g.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, 210); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, 'rgba(110,60,20,.55)'); g.fillStyle = rg; g.fillRect(0, 0, w, h);
        g.fillStyle = '#3d2010'; g.textAlign = 'center'; g.font = '54px Rakkas, serif'; g.direction = 'rtl'; g.fillText('مطلوب', w / 2, 62);
        g.font = '22px Rye, serif'; g.direction = 'ltr'; g.fillText('WANTED', w / 2, 92); g.fillStyle = '#7a5a3a'; g.fillRect(48, 108, 160, 140); g.fillStyle = '#3d2010'; g.beginPath(); g.arc(128, 160, 34, 0, 7); g.fill(); g.fillRect(84, 196, 88, 52);
        g.font = '40px Rye, serif'; g.fillText('$500', w / 2, 300);
    });
    texList.push(wanted, clockTex, dirt, ruts, grain, sunTex);
    const posterM = new T.MeshStandardMaterial({ map: wanted, roughness: .9 }), posterG = new T.PlaneGeometry(.62, .82);
    posterSpots.forEach(([x, z, s, idx], i) => { if (i % 3) return; const m = new T.Mesh(posterG, posterM); m.position.set(x, 1.85, z - s * .13); m.rotation.y = s < 0 ? 0 : Math.PI; m.rotation.z = (i % 2 ? .05 : -.04); sc.add(m); });

    // ---------- غبار معلّق بالجو (ذرات ذهبية بضوء الشمس)
    const soft = canvasTex(64, 64, (g, w, h) => { const rg = g.createRadialGradient(32, 32, 0, 32, 32, 32); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.4, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); });
    texList.push(soft);
    const DN = 500, dPos = new Float32Array(DN * 3); for (let i = 0; i < DN; i++) { dPos[i * 3] = (Math.random() - .5) * 110; dPos[i * 3 + 1] = Math.random() * 9; dPos[i * 3 + 2] = (Math.random() - .5) * 32; }
    const dGeo = new T.BufferGeometry(); dGeo.setAttribute('position', new T.BufferAttribute(dPos, 3));
    const motes = new T.Points(dGeo, new T.PointsMaterial({ size: .14, map: soft, color: '#ffd9a0', transparent: true, opacity: .6, depthWrite: false, blending: T.AdditiveBlending })); sc.add(motes);

    // ---------- مؤثرات: سحب غبار/دخان (مجمّعة pooled) + وميض الطلقة + الرصاصة + كرة شوك متدحرجة + عملات الفوز
    const puffs = []; for (let i = 0; i < 70; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: soft, transparent: true, depthWrite: false, opacity: 0 })); s.visible = false; sc.add(s); puffs.push({ s, life: 0, max: 1, v: V(0, 0, 0), g0: 1, g1: 2, o: .6 }); }
    let puffI = 0;
    function puff(p, color, size = 1, vel = V(0, .6, 0), life = 1.4, op = .55, grow = 2.4) { const P = puffs[puffI++ % puffs.length]; P.s.position.copy(p); P.s.material.color.set(color); P.s.visible = true; P.life = 0; P.max = life; P.v.copy(vel); P.g0 = size; P.g1 = size * grow; P.o = op; P.s.material.opacity = op; P.s.scale.setScalar(size); }
    function dustBurst(p, n = 8, size = .8, color = '#d9b07a') { for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, s = .6 + Math.random() * 1.6; puff(V(p.x + Math.cos(a) * .3, p.y + .2, p.z + Math.sin(a) * .3), color, size * (.7 + Math.random() * .6), V(Math.cos(a) * s, .4 + Math.random() * .8, Math.sin(a) * s), 1.2 + Math.random() * .8, .6); } }
    const starTex = canvasTex(128, 128, (g, w, h) => { const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,230,1)'); rg.addColorStop(.25, 'rgba(255,200,90,.9)'); rg.addColorStop(1, 'rgba(255,120,30,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,250,220,1)'; g.beginPath(); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = i % 2 ? 14 : 62; g.lineTo(64 + Math.cos(a) * rr, 64 + Math.sin(a) * rr); } g.fill(); });
    texList.push(starTex);
    const flash = new T.Sprite(new T.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending })); flash.visible = false; sc.add(flash);
    const flashL = new T.PointLight('#ffb347', 0, 14, 1.6); sc.add(flashL); let flashT = 9;
    const bullet = new T.Group(); bullet.visible = false; sc.add(bullet);
    { const b = new T.Mesh(new T.CapsuleGeometry(.035, .12, 4, 8), new T.MeshStandardMaterial({ color: '#d4a640', metalness: .9, roughness: .25, emissive: '#5a3a00' })); b.rotation.z = Math.PI / 2; bullet.add(b);
      const trailTex = canvasTex(256, 16, (g, w, h) => { const lg = g.createLinearGradient(0, 0, w, 0); lg.addColorStop(0, 'rgba(255,220,150,0)'); lg.addColorStop(1, 'rgba(255,240,200,.9)'); g.fillStyle = lg; g.fillRect(0, 4, w, 8); }); texList.push(trailTex);
      for (const rx of [0, Math.PI / 2]) { const t = new T.Mesh(new T.PlaneGeometry(2.2, .07), new T.MeshBasicMaterial({ map: trailTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide })); t.position.x = -1.1; t.rotation.x = rx; bullet.add(t); }
      // حلقات هواء حول الرصاصة (تبان بالتصوير البطيء)
      const ringM = new T.MeshBasicMaterial({ color: '#fff3d6', transparent: true, opacity: .35, depthWrite: false, side: T.DoubleSide });
      bullet.userData.rings = [0, 1, 2].map(i => { const m = new T.Mesh(new T.RingGeometry(.09, .13, 24), ringM.clone()); m.rotation.y = Math.PI / 2; m.position.x = -.4 - i * .5; bullet.add(m); return m; }); }
    // مجمّع رصاص: بالمبارزات بنفس الوقت ممكن أكثر من رصاصة تطير سوا
    const bullets = [bullet]; bullet.userData.B = { on: false, from: V(), to: V(), dir: V(), p: 0, len: 1, onHit: null };
    function getBullet() { let b = bullets.find(x => !x.userData.B.on); if (!b) { const ud = bullet.userData; bullet.userData = {}; b = bullet.clone(); bullet.userData = ud; b.userData = { rings: b.children.filter(c => c.geometry && c.geometry.type === 'RingGeometry'), B: { on: false, from: V(), to: V(), dir: V(), p: 0, len: 1, onHit: null } }; sc.add(b); bullets.push(b); } return b; }

    const tumble = new T.Group(); tumble.visible = false; sc.add(tumble);
    { const m = new T.MeshStandardMaterial({ color: '#9c7a4a', wireframe: true }); tumble.add(new T.Mesh(new T.IcosahedronGeometry(.75, 1), m)); const i2 = new T.Mesh(new T.IcosahedronGeometry(.55, 1), m); i2.rotation.set(.5, .3, .2); tumble.add(i2); const i3 = new T.Mesh(new T.DodecahedronGeometry(.4, 0), new T.MeshStandardMaterial({ color: '#7a5a32', wireframe: true })); tumble.add(i3); }
    const TW = { on: false, from: V(), to: V(), t: 0, dur: 4 };
    function tumbleweed(from, to, dur = 4) { TW.on = true; TW.from.copy(from); TW.to.copy(to); TW.t = 0; TW.dur = dur; tumble.visible = true; }

    // موجة غبار على الأرض لما يطيح الخاسر (تأثير بعد السقوط)
    const shocks = [0, 1, 2, 3].map(() => { const m = new T.Mesh(new T.RingGeometry(.55, 1, 48), new T.MeshBasicMaterial({ color: '#f0c890', transparent: true, opacity: 0, depthWrite: false, side: T.DoubleSide })); m.rotation.x = -Math.PI / 2; m.visible = false; m.userData.t = 9; sc.add(m); return m; });
    function shock(p) { const m = shocks.find(x => x.userData.t >= 1) || shocks[0]; m.position.set(p.x, .07, p.z); m.userData.t = 0; m.visible = true; }
    const COINS = 90, coinMesh = new T.InstancedMesh(new T.CylinderGeometry(.22, .22, .05, 14), new T.MeshStandardMaterial({ color: '#f5c542', metalness: .95, roughness: .25, emissive: '#6b4a00' }), COINS);
    coinMesh.visible = false; sc.add(coinMesh); const coinD = []; let coinsOn = false, coinC = V();
    function startCoins(c) { coinsOn = true; coinC.copy(c); coinMesh.visible = true; coinD.length = 0; for (let i = 0; i < COINS; i++) coinD.push({ p: V(c.x + (Math.random() - .5) * 9, 8 + Math.random() * 14, c.z + (Math.random() - .5) * 9), v: -3 - Math.random() * 3, r: V(Math.random() * 6, Math.random() * 6, 0), s: V(Math.random() * 8, Math.random() * 6, 0) }); }

    // ---------- الشخصيات: شخصية سفينة النجاة بلبس كاوبوي
    const GC = new Map(), geo = (k, f) => { if (!GC.has(k)) GC.set(k, f()); return GC.get(k); };
    const FM = new Map(), fmat = (c, o = {}) => { const k = c + JSON.stringify(o); if (!FM.has(k)) FM.set(k, new T.MeshStandardMaterial({ color: c, roughness: .58, ...o })); return FM.get(k); };
    function brimGeo() { const pts = [V(0, 0, 0), V(.5, 0, 0), V(.8, 0, 0), V(.98, .03, 0), V(1.05, .1, 0)].map(v => new T.Vector2(v.x, v.y)); const g = new T.LatheGeometry(pts, 32), p = g.attributes.position;
        for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), side = Math.max(0, Math.abs(x) - .45); p.setY(i, p.getY(i) + side * side * 1.1 - Math.max(0, Math.abs(z) - .55) * .1); p.setZ(i, z * .9); } g.computeVertexNormals(); return g; }
    function crownGeo() { const g = new T.CylinderGeometry(.44, .56, .58, 20, 2), p = g.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); if (y > .2) { p.setY(i, y - (x * x < .04 ? .12 : 0) + Math.abs(x) * .06); } } g.computeVertexNormals(); return g; }
    function labelTex(name) { return canvasTex(512, 128, (g, w, h) => { g.font = '700 54px "IBM Plex Sans Arabic", sans-serif'; g.direction = 'rtl'; const tw = Math.min(w - 20, g.measureText(name).width + 60);
        g.fillStyle = 'rgba(43,24,12,.9)'; g.beginPath(); g.roundRect((w - tw) / 2, 16, tw, 96, 18); g.fill(); g.strokeStyle = '#d9a35a'; g.lineWidth = 5; g.stroke(); g.fillStyle = '#fbe7c0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, w / 2, 66, w - 70); }); }

    function cowboy(p) {
        const h = hash(p.id), girl = p.girl != null ? !!p.girl : ((h >>> 5) & 1) === 1;
        const C = { skin: pick(PAL.skin, h, 1), hair: pick(PAL.hair, h, 2), hat: pick(PAL.hat, h, 3), shirt: pick(PAL.shirt, h, 4), vest: pick(PAL.vest, h, 5), pants: pick(PAL.pants, h, 6), band: pick(PAL.band, h, 7) };
        const G = new T.Group(); G.rotation.order = 'YXZ'; const body = new T.Group(); G.add(body);
        const add = (gg, m, x, y, z, par = body) => { const o = new T.Mesh(gg, typeof m === 'string' ? fmat(m) : m); o.position.set(x, y, z); o.castShadow = true; par.add(o); return o; };
        const leather = '#3a2010', metal = fmat('#3b3f45', { metalness: .85, roughness: .32 }), gold = fmat('#e0b44a', { metalness: .85, roughness: .3 });
        // الأرجل + جزمة كاوبوي بمهماز
        const legs = []; for (const x of [-.17, .17]) { const l = new T.Group(); l.position.set(x, .78, 0); body.add(l);
            add(geo('leg', () => new T.CapsuleGeometry(.13, .36, 4, 10)), C.pants, 0, -.26, 0, l);
            add(geo('boot', () => new T.CylinderGeometry(.155, .16, .36, 12)), '#5a3218', 0, -.6, 0, l);
            add(geo('foot', () => new T.BoxGeometry(.24, .13, .42)), leather, 0, -.72, .08, l);
            add(geo('heel', () => new T.BoxGeometry(.2, .1, .1)), '#1f1208', 0, -.74, -.12, l);
            const sp = add(geo('spur', () => new T.TorusGeometry(.06, .016, 4, 10)), fmat('#cfcfcf', { metalness: .9, roughness: .3 }), 0, -.7, -.19, l); sp.rotation.y = Math.PI / 2;
            legs.push(l); }
        // الجسم: قميص + صدرية مفتوحة + حزام بإبزيم + جراب المسدس + منديل الرقبة
        const torso = add(geo('torso', () => new T.CapsuleGeometry(.36, .42, 6, 16)), C.shirt, 0, 1.18, 0); torso.scale.set(1, 1, .82);
        const vest = add(geo('vest', () => new T.CylinderGeometry(.388, .405, .62, 18, 1, true, .5, Math.PI * 2 - 1)), fmat(C.vest, { side: T.DoubleSide }), 0, 1.17, 0); vest.scale.z = .86;
        if (((h >>> 9) % 3) === 0) { const st = add(geo('badge', () => new T.CylinderGeometry(.075, .075, .025, 5)), gold, .2, 1.32, .32); st.rotation.x = Math.PI / 2; }
        add(geo('belt', () => new T.CylinderGeometry(.378, .378, .11, 18)), '#2a170b', 0, .94, 0).scale.z = .86;
        add(geo('buckle', () => new T.BoxGeometry(.17, .12, .05)), gold, 0, .94, .33);
        add(geo('hol', () => new T.BoxGeometry(.13, .36, .17)), '#4a2a14', -.42, .78, .03);
        const holGun = add(geo('hgrip', () => new T.BoxGeometry(.08, .17, .11)), '#6b4226', -.42, 1.0, -.01); holGun.rotation.x = -.35;
        add(geo('bandN', () => new T.TorusGeometry(.19, .07, 8, 18)), C.band, 0, 1.55, 0).rotation.x = Math.PI / 2;
        const tri = add(geo('bandT', () => new T.ConeGeometry(.17, .26, 3)), C.band, 0, 1.43, .27); tri.rotation.x = Math.PI; tri.scale.z = .45;
        // الأيدي — اليمين (x سالب) تمسك المسدس
        const arms = []; for (const s of [-1, 1]) { const a = new T.Group(); a.position.set(s * .44, 1.42, 0); body.add(a);
            add(geo('arm', () => new T.CapsuleGeometry(.1, .34, 4, 10)), C.shirt, 0, -.24, 0, a);
            add(geo('cuff', () => new T.CylinderGeometry(.115, .115, .08, 10)), C.vest, 0, -.42, 0, a);
            add(geo('hand', () => new T.SphereGeometry(.12, 12, 10)), fmat(C.skin, { roughness: .5 }), 0, -.52, 0, a);
            a.rotation.z = s * .18; arms.push(a); }
        const gun = new T.Group(); gun.position.set(0, -.55, 0); arms[0].add(gun); gun.visible = false;
        add(geo('barrel', () => new T.CylinderGeometry(.038, .045, .44, 8)), metal, 0, -.25, .07, gun);
        const drum = add(geo('drum', () => new T.CylinderGeometry(.075, .075, .13, 8)), metal, 0, -.05, .07, gun);
        add(geo('grip', () => new T.BoxGeometry(.08, .2, .1)), '#6b4226', 0, .05, -.05, gun).rotation.x = .5;
        const muzzle = new T.Object3D(); muzzle.position.set(0, -.5, .07); gun.add(muzzle);
        // الراس (نفس شخصية السفينة) + عيون قابلة للتضييق + حواجب
        add(geo('neck', () => new T.CylinderGeometry(.13, .15, .16, 12)), fmat(C.skin, { roughness: .5 }), 0, 1.66, 0);
        const head = new T.Group(); head.position.y = 2.18; body.add(head);
        const skin = fmat(C.skin, { roughness: .5 });
        add(geo('head', () => new T.SphereGeometry(.62, 28, 22)), skin, 0, 0, 0, head).scale.set(1, .96, .94);
        for (const s of [-1, 1]) add(geo('ear', () => new T.SphereGeometry(.13, 12, 10)), skin, s * .6, -.04, 0, head).scale.set(.6, 1, .8);
        const hairM = fmat(C.hair, { roughness: .45 });
        add(geo('cap', () => new T.SphereGeometry(.67, 28, 18, 0, Math.PI * 2, 0, Math.PI * .52)), hairM, 0, .04, -.05, head).rotation.x = -.32;
        for (let i = -2; i <= 2; i++) add(geo('fr', () => new T.SphereGeometry(.2, 12, 10)), hairM, i * .17, .3 - Math.abs(i) * .03, .46 - Math.abs(i) * .05, head).scale.set(1, .7, .6);
        if (girl) for (const s of [-1, 1]) { const b = add(geo('braid', () => new T.CapsuleGeometry(.13, .7, 6, 12)), hairM, s * .55, -.45, -.2, head); b.rotation.z = s * .18; add(geo('tie', () => new T.SphereGeometry(.08, 10, 8)), C.band, s * .62, -.85, -.24, head); }
        else add(geo('back', () => new T.SphereGeometry(.5, 18, 14)), hairM, 0, -.05, -.28, head).scale.set(1.15, 1, .8);
        const eyeB = fmat('#1e1b2e', { roughness: .2 }), eyeW = fmat('#ffffff', { roughness: .2 }), eyes = [], brows = [], glints = [];
        for (const s of [-1, 1]) { const e = add(geo('eye', () => new T.SphereGeometry(.12, 16, 12)), eyeB, s * .22, -.02, .53, head); e.scale.set(.85, 1.15, .5); eyes.push(e);
            glints.push(add(geo('glint', () => new T.SphereGeometry(.035, 8, 6)), eyeW, s * .22 + .03, .04, .6, head));
            const br = add(geo('brow', () => new T.CapsuleGeometry(.03, .14, 3, 6)), C.hair, s * .22, .19, .56, head); br.rotation.z = Math.PI / 2 + s * .12; brows.push(br);
            add(geo('cheek', () => new T.SphereGeometry(.09, 10, 8)), fmat('#fb7185', { transparent: true, opacity: .45 }), s * .36, -.2, .47, head).scale.set(1, .55, .3); }
        const mouth = add(geo('mouth', () => new T.TorusGeometry(.08, .022, 6, 14, Math.PI)), '#7f1d1d', 0, -.22, .57, head); mouth.rotation.z = Math.PI;
        if (!girl && ((h >>> 12) % 3) !== 2) for (const s of [-1, 1]) { const m = add(geo('stache', () => new T.CapsuleGeometry(.045, .16, 4, 8)), C.hair, s * .1, -.13, .58, head); m.rotation.z = Math.PI / 2 - s * .35; }
        // قبعة الكاوبوي
        const hat = new T.Group(); hat.position.set(0, .4, -.02); hat.rotation.x = -.12; head.add(hat);
        const hatM = fmat(C.hat, { side: T.DoubleSide, roughness: .75 });
        add(geo('brim', brimGeo), hatM, 0, 0, 0, hat);
        add(geo('crown', crownGeo), hatM, 0, .3, 0, hat).scale.z = .86;
        add(geo('hband', () => new T.CylinderGeometry(.548, .556, .1, 20)), C.band === '#111827' ? '#7c2d12' : '#2a170b', 0, .09, 0, hat).scale.z = .86;
        const label = new T.Sprite(new T.SpriteMaterial({ map: labelTex(p.name), depthTest: false, transparent: true })); label.scale.set(3.2, .8, 1); label.position.y = 3.75; label.renderOrder = 10; G.add(label);
        G.userData = { body, legs, arms, head, hat, gun, drum, muzzle, holGun, eyes, brows, glints, mouth, label };
        return G;
    }

    // ---------- اللاعبين
    const figs = new Map();
    let crowdOrder = [];
    function crowdSpot(i, n) {
        const north = Math.ceil(n / 2), side = i % 2 ? 1 : -1, slot = Math.floor(i / 2), cnt = side < 0 ? north : n - north;
        const sp = Math.min(5.2, 54 / Math.max(1, cnt - 1)), x = (slot - (cnt - 1) / 2) * sp + (side > 0 ? 1.3 : -1.3);
        return V(x, .36, side * (ZF - 1.8));
    }
    function homeOf(id) { const i = crowdOrder.indexOf(id); return crowdSpot(Math.max(0, i), crowdOrder.length); }
    function setPlayers(list) {
        const keep = new Set(list.map(p => String(p.id)));
        for (const [id, f] of figs) if (!keep.has(id)) dropFig(id);
        crowdOrder = list.map(p => String(p.id));
        list.forEach(p => { const id = String(p.id); let f = figs.get(id);
            if (!f) { const g = cowboy(p); sc.add(g); f = { id, name: p.name, g, U: g.userData, state: 'idle', ph: Math.random() * 6, speed: 3.4, face: 0, yawT: 0, walking: false, recoil: 0, t: 0, flyHat: null };
                figs.set(id, f); const hm = homeOf(id); g.position.copy(hm); f.target = hm.clone(); f.face = Math.atan2(-hm.x * .25, -hm.z); g.rotation.y = f.face; }
            if (f.state === 'idle' || f.state === 'watch') { f.target = homeOf(id); f.face = Math.atan2(-f.target.x * .25, -f.target.z); } });
    }
    function dropFig(id) { const f = figs.get(id); if (!f) return; sc.remove(f.g); if (f.flyHat) sc.remove(f.flyHat.o); f.U.label.material.map.dispose(); f.U.label.material.dispose(); figs.delete(id); }
    const fwd = f => V(Math.sin(f.face), 0, Math.cos(f.face));
    const rightOf = f => V(-Math.cos(f.face), 0, Math.sin(f.face));
    const wp = o => { const v = V(); o.getWorldPosition(v); return v; };

    // armed = المسدس طالع باليد ومنزّل (قبل الرقم). اللي سحب قبل (armed) يبقى مسدسه بيده لو انضرب أو تأخر
    function setState(f, st) { const U = f.U, was = U.gun.visible; f.state = st; f.t = 0;
        const gun = st === 'draw' || st === 'win' || st === 'armed' || st === 'champ' || ((st === 'slowdraw' || st === 'dead') && was);
        U.gun.visible = gun; U.holGun.visible = !gun; if (!gun || st === 'armed') U.gun.rotation.set(0, 0, 0); }

    // وضعيات الجسم: كل إطار نحسب الهدف ونقرّب له (انتقال ناعم بين الحالات)
    const tmp = { rA: [0, 0], lA: [0, 0], lg: [0, 0, 0, 0], hx: 0, sq: 1, br: 0, mo: 1 };
    function poseFig(f, dt, t) {
        const U = f.U, g = f.g; f.t += dt;
        // حركة نحو الهدف
        if (f.target && f.state !== 'dead' && f.state !== 'poof') {
            const dx = f.target.x - g.position.x, dz = f.target.z - g.position.z, d = Math.hypot(dx, dz);
            if (d > .04) { const st = Math.min(d, dt * f.speed); g.position.x += dx / d * st; g.position.z += dz / d * st; f.walking = true; f.yawT = Math.atan2(dx, dz);
                const ph = Math.sin(f.t * f.speed * 3.2); if (f.duelist && f.lastStep != null && Math.sign(ph) !== Math.sign(f.lastStep)) { puff(V(g.position.x, .1, g.position.z), '#d9b07a', .45, V(0, .3, 0), 1, .45); emit('step', g.position.z > 0 ? -.6 : .6); } f.lastStep = ph; }  // صوت الخطوة: يسار/يمين حسب مكان اللاعب بالشاشة
            else { f.walking = false; f.yawT = f.face; }
            g.position.y += (f.target.y - g.position.y) * Math.min(1, dt * 9);
        }
        if (f.state !== 'dead') g.rotation.y = lerpAng(g.rotation.y, f.yawT, 1 - Math.exp(-dt * 9));
        let rA = [0, -.18], lA = [0, .18], lg = [0, 0, 0, 0], hx = 0, sq = 1, br = 0, by = 0, rate = 10, mouthS = 1;
        const ph = t * 2 + f.ph;
        if (f.walking) { const w = f.t * f.speed * 3.2; lg = [Math.sin(w) * .6, -Math.sin(w) * .6, 0, 0]; rA = [-Math.sin(w) * .5, -.18]; lA = [Math.sin(w) * .5, .18]; by = Math.abs(Math.sin(w)) * .06; if (f.duelist) { sq = .55; br = 1; } rate = 18; }
        else switch (f.state) {
            case 'idle': by = Math.sin(ph) * .015; rA = [Math.sin(ph * .7) * .08, -.2]; lA = [-Math.sin(ph * .7) * .08, .2]; hx = Math.sin(ph * .4) * .05; break;
            case 'watch': by = Math.sin(ph * 1.3) * .015; rA = [-.25, -.5]; lA = [-.25, .5]; hx = .05; sq = .8; break;   // إيدين على الخصر يتفرجون
            case 'cheer': { const c = f.t * 9 + f.ph; by = Math.abs(Math.sin(c * .5)) * .5; rA = [0, -2.6 + Math.sin(c) * .3]; lA = [0, 2.6 - Math.sin(c) * .3]; mouthS = 1.6; rate = 16; break; }
            case 'ready': { const tw = Math.sin(t * 23 + f.ph) * .05 * (f.twitch ? 2.5 : 1); lg = [0, 0, -.13, .13]; rA = [.12 + tw, -.46]; lA = [0, .34]; hx = .1; sq = .42; br = 1; by = Math.sin(t * 1.4) * .01; break; }
            case 'armed': { const tw = Math.sin(t * 19 + f.ph) * .03; lg = [0, 0, -.13, .13]; rA = [-.55 + tw, -.12]; lA = [-.1, .38]; hx = .08; sq = .42; br = 1; by = Math.sin(t * 1.4) * .01; rate = f.t < .35 ? 22 : 10; break; }
            case 'draw': rA = [-Math.PI / 2 - f.recoil * .55, .06]; lA = [-.2, .55]; lg = [0, 0, -.13, .13]; sq = .5; br = 1; rate = 34; hx = 0; break;
            case 'slowdraw': { const k = clamp01((f.t - .18) / .5); rA = U.gun.visible ? [-.55 - k * .8, -.12 + k * .15] : [.12 - k * 1.1, -.46 + k * .3]; lA = [0, .4]; lg = [0, 0, -.13, .13]; sq = .45; br = 1; rate = 14; if (k > .55) { U.gun.visible = true; U.holGun.visible = false; } break; }
            case 'dead': { const k = clamp01(f.t / .85), e = k * k; g.rotation.x = -e * Math.PI / 2 * .98; if (k < 1) { const b = fwd(f).multiplyScalar(-dt * 2.2 * (1 - k)); g.position.add(b); }
                if (k >= 1 && !f.landed) { f.landed = true; const hp = wp(U.head); dustBurst(V(hp.x, 0, hp.z), 18, 1.35); shock(V(hp.x, 0, hp.z)); shake = Math.max(shake, .35); emit('thud'); emit('down', f.id); }
                rA = [-.6, -2.3]; lA = [-.6, 2.3]; lg = [-.35, .25, 0, 0]; sq = .05; mouthS = 1.4; rate = 12; break; }
            case 'win': { const k = f.t;
                if (k < .45) { rA = [-1.05, .1]; U.gun.rotation.x -= dt * 20; lA = [0, .25]; }
                else if (k < 2.5) { if (!f.blown) { f.blown = true; U.gun.rotation.set(0, 0, 0); } rA = [-2.25, .55]; lA = [0, .25]; hx = -.05; /* فوهة المسدس قدام فمه */ if ((f.smk = (f.smk || 0) + dt) > .06) { f.smk = 0; const blow = k > 1.2 && k < 1.9; puff(wp(U.muzzle), '#ece7dc', blow ? .22 : .15, blow ? V(.9, .5, (Math.random() - .5) * .4) : V(.04, .6, 0), 1.8, .6, blow ? 5 : 4); if (blow && !f.puffed) { f.puffed = true; emit('blow'); } } mouthS = k > 1.2 && k < 1.9 ? .45 : .7; }
                else { if (U.gun.visible) { U.gun.visible = false; U.holGun.visible = true; emit('holster'); } rA = [.15, -.4]; lA = [0, .2]; }
                sq = k < 2.5 ? .6 : 1; by = Math.sin(ph) * .015; break; }
            case 'champ': { const c = f.t * 6; by = Math.abs(Math.sin(c * .5)) * .35; lA = [0, 2.6 + Math.sin(c) * .25]; rA = [-Math.PI / 2 - .9, -.2]; U.gun.visible = true; U.holGun.visible = false; U.gun.rotation.x = 0; mouthS = 1.5; if (Math.sin(c * .5) > .97 && !f.shotUp) { f.shotUp = true; emit('pop'); puff(wp(U.muzzle), '#e8e2d6', .25, V(0, 1, 0), 1.4, .6, 3); } if (Math.sin(c * .5) < 0) f.shotUp = false; break; }
        }
        if (f.spinT > 0) { U.drum.rotation.y += dt * 38 * f.spinT; f.spinT = Math.max(0, f.spinT - dt * 1.05); } // تدوير الحشوة
        const k = 1 - Math.exp(-dt * rate);
        U.arms[0].rotation.x += (rA[0] - U.arms[0].rotation.x) * k; U.arms[0].rotation.z += (rA[1] - U.arms[0].rotation.z) * k;
        U.arms[1].rotation.x += (lA[0] - U.arms[1].rotation.x) * k; U.arms[1].rotation.z += (lA[1] - U.arms[1].rotation.z) * k;
        U.legs[0].rotation.x += (lg[0] - U.legs[0].rotation.x) * k; U.legs[1].rotation.x += (lg[1] - U.legs[1].rotation.x) * k;
        U.legs[0].rotation.z += (lg[2] - U.legs[0].rotation.z) * k; U.legs[1].rotation.z += (lg[3] - U.legs[1].rotation.z) * k;
        U.head.rotation.x += (hx - U.head.rotation.x) * k; U.body.position.y += (by - U.body.position.y) * Math.min(1, dt * 14);
        U.eyes.forEach(e => { e.scale.y += (1.15 * sq - e.scale.y) * k; }); U.glints.forEach(e => { e.scale.y = Math.max(.05, U.eyes[0].scale.y / 1.15); });
        U.brows.forEach((b, i) => { const s = i ? 1 : -1, tz = Math.PI / 2 + s * (.12 - br * .45); b.rotation.z += (tz - b.rotation.z) * k; b.position.y += ((.19 - br * .04) - b.position.y) * k; });
        U.mouth.scale.x += (mouthS - U.mouth.scale.x) * k; U.mouth.scale.y += ((mouthS > 1.2 ? 1.8 : 1) - U.mouth.scale.y) * k;
        if (f.recoil > 0) f.recoil = Math.max(0, f.recoil - dt * 3.2);
        // قبعة طايرة بعد الإصابة
        if (f.flyHat) { const H = f.flyHat; if (!H.landed) { H.v.y -= 9.8 * dt; H.o.position.addScaledVector(H.v, dt); H.o.rotation.x += H.s.x * dt; H.o.rotation.z += H.s.z * dt; if (H.o.position.y < .12 && H.v.y < 0) { H.landed = true; H.o.position.y = .1; H.o.rotation.set(0, H.o.rotation.y, 0); puff(H.o.position.clone(), '#d9b07a', .5, V(0, .3, 0), 1, .5); } } }
        if (f.state === 'poof') { const s = Math.max(.001, 1 - f.t / .35); g.scale.setScalar(s); if (f.t > .4) { dropFig(f.id); } }
    }

    // ---------- المخرج: لقطات سينمائية
    const CS = { pos: V(0, 12, 30), look: V(0, 1.5, 0), fov: 40, roll: 0 };
    const camPos = V(0, 12, 30), camLook = V(0, 1.5, 0); let camFov = 40, camRoll = 0, shake = 0;
    let shot = null, shotT = 0, queue = [], qDone = null, labels = true, TS = 1, lobbyCut = false;
    function play(list) { return new Promise(res => { if (qDone) qDone(false); queue = list.slice(); qDone = res; next(); }); }
    // انتقال ناعم بين اللقطات: نصوّر آخر إطار على لوحة فوق المشهد ونخليها تذوب (بدل القطع الحاد والدايرة السودا)
    const xf = document.createElement('canvas'); xf.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;opacity:0'; el.appendChild(xf);
    const XF = { draw: 140, bullet: 220, fall: 320, leave: 380 };
    function crossfade(ms = 600) { try { const c = r.domElement; if (xf.width !== c.width || xf.height !== c.height) { xf.width = c.width; xf.height = c.height; }
        r.render(sc, cam); xf.getContext('2d').drawImage(c, 0, 0); xf.style.transition = 'none'; xf.style.opacity = 1; void xf.offsetWidth; xf.style.transition = `opacity ${ms}ms ease-in-out`; xf.style.opacity = 0; } catch (e) { } }
    function next() { const s = queue.shift(); if (!s) { shot = null; const d = qDone; qDone = null; d && d(true); return; } crossfade(XF[s.name] || 600); shot = s; shotT = 0; s.cut = true; s.start && s.start(); emit('shot', s.name, s.dur); }
    function lobby() { if (qDone) { const d = qDone; qDone = null; d(false); } crossfade(800); lobbyCut = true; queue = []; shot = null; labels = true; TS = 1; emit('shot', 'lobby'); for (const [, f] of figs) if (f.state === 'watch' || f.state === 'cheer') setState(f, 'idle'); }

    // المواجهة بعرض الشارع: الأول يطلع من محلات الجنوب والثاني من محلات الشمال، ويوقفون وجه لوجه (بعيدين بعرض الشارع).
    // «كل المبارزات في وقت واحد»: كل زوج بمكان على طول الشارع (الأقرب للكاميرا x=0 والباقي باتجاه البرج)
    const LANE_Z = 7;
    const laneX = (i, n) => n > 1 ? -i * Math.min(9, 96 / (n - 1)) : 0;
    // اللقطة الأساسية: الكاميرا بالشارع تطالع جهة برج الساعة — السوق كامل والبرج بآخره والمتواجهين يمين ويسار.
    // المسافة تنحسب من عرض الشاشة عشان أقرب زوج يطلع كامل بأي جهاز (الشارع طويل فما فيه شي يسد ورا الكاميرا)
    function wide(c, k, t, push) { const vf = cam.aspect >= 1.1 ? 40 : 50, hf = 2 * Math.atan(Math.tan(vf * Math.PI / 360) * cam.aspect), need = (cam.aspect >= 1.1 ? 10.6 : 8.6) / Math.tan(hf / 2);
        const d = Math.min(44, Math.max(14, need)) - push * k * .25; c.pos.set(d, 1.7 + d * .025, Math.sin(t * .25) * .3); c.look.set(-12, cam.aspect >= 1.1 ? 2.1 : 3, 0); c.fov = vf; c.roll = 0; c.wide = true; }
    let duelists = [];
    function arriveAll() { duelists.forEach(f => { if (f.target && f.g.position.distanceTo(f.target) > .3) { f.g.position.x = f.target.x; f.g.position.z = f.target.z; f.g.position.y = 0; f.walking = false; } }); }
    // pairs: [[aId, bId], ...] — o.len: 'short' (~4ث) | 'full' (~9ث) — o.instant: على العلامات مباشرة (للاختبار)
    function duelIntro(pairs, o = {}) {
        if (!Array.isArray(pairs[0])) pairs = [pairs]; // توافق: duelIntro([a, b])
        const P = pairs.map(([a, b]) => [figs.get(String(a)), figs.get(String(b))]).filter(([a, b]) => a && b); if (!P.length) return Promise.resolve(false);
        const short = o.len !== 'full', multi = P.length > 1, startZ = o.instant ? LANE_Z : short ? LANE_Z + 3 : ZF - 1.8;
        duelists = [];
        P.forEach(([A, Bf], i) => { const x = laneX(i, P.length);
            [[A, 1], [Bf, -1]].forEach(([f, s]) => { f.duelist = true; f.twitch = false; f.wasted = false; f.g.position.set(x + s * .6, startZ > 9 ? .36 : 0, s * startZ); f.g.rotation.set(0, s > 0 ? Math.PI : 0, 0); f.target = V(x, 0, s * LANE_Z); f.face = s > 0 ? Math.PI : 0; f.speed = 2.6; setState(f, 'ready'); duelists.push(f); }); });
        for (const [, f] of figs) if (!f.duelist) { setState(f, 'watch'); f.face = Math.atan2(-f.g.position.x, -f.g.position.z); }
        const [A, Bf] = P[0]; // الزوج الأقرب للكاميرا
        const crane = { name: 'crane', dur: short ? 2.2 : 2.8, labels: true, cam(k, t, c) { const e = ease(k); c.pos.set(34 - e * 20, 26 - e * 21.5, 0); c.look.set(-4 - e * 8, e * 2.1, 0); c.fov = 48 - e * 8; c.roll = 0; } };
        const boots = { name: 'boots', dur: 2, labels: false, cam(k, t, c) { const p = A.g.position; c.pos.copy(p).addScaledVector(fwd(A), -1.7).addScaledVector(rightOf(A), .95); c.pos.y = .32; c.look.set(Bf.g.position.x, .9, Bf.g.position.z); c.fov = 52; c.roll = .03; } };
        const profile = { name: 'profile', dur: 2.4, labels: true, start() { arriveAll(); tumbleweed(V(12, .75, .4), V(-30, .75, -.6), 4); emit('wind'); }, cam(k, t, c) { wide(c, ease(k), t, 1.6); } };
        // من منظور كل لاعب: الكاميرا مكان عيونه (تحت حافة قبعته) تطالع خصمه، والصفحة ترسم الجفون وهو يضيّق عينه ويفتحها
        const pov = (me, him, name, dur) => ({ name, dur, labels: false, start: arriveAll,
            cam(k, t, c) { const H = wp(me.U.head), f = fwd(me), O = wp(him.U.head); c.pos.copy(H).addScaledVector(f, .5); c.pos.y += .02 + Math.sin(t * 1.7) * .015; c.pos.x += Math.sin(t * 1.3) * .02; c.look.copy(O); c.look.y -= .35; c.fov = 34 - k * 12; c.roll = Math.sin(t * .9) * .015; } });
        let list;
        if (!multi) list = short ? [crane, pov(A, Bf, 'povA', .9), pov(Bf, A, 'povB', .9)] : [crane, boots, pov(A, Bf, 'povA', 1.6), pov(Bf, A, 'povB', 1.6)];
        else list = short ? [crane, profile] : [crane, boots, profile, pov(A, Bf, 'povA', .9), pov(Bf, A, 'povB', .9)];
        return play(list);
    }
    function standoff() { arriveAll(); play([{ name: 'standoff', dur: 0, labels: true, cam(k, t, c) { wide(c, Math.min(1, t / 8), t, 1.2); c.pos.y -= Math.min(1, t / 8) * .3; } }]); }
    // كل اللي بالمواجهة يطلعون مسدساتهم ويدوّرون الحشوة (بتوقيت مختلف شوي لكل واحد)
    function drawGuns(ids) { ids.forEach((id, i) => setTimeout(() => { const f = figs.get(String(id)); if (!f || f.state !== 'ready') return; setState(f, 'armed'); f.spinT = 1; emit('spin', f.g.position.z > 0 ? -.6 : .6); }, ids.length > 2 ? Math.random() * 700 : i * 450)); }
    // الخدعة الحمراء: اللي كتبها يطلق بالهوا ويضيّع طلقته
    function wasteShot(id) { const f = figs.get(String(id)); if (!f) return; f.recoil = 1; f.wasted = true; const m = wp(f.U.muzzle); for (let i = 0; i < 5; i++) puff(m.clone(), '#ece6da', .2, V((Math.random() - .5) * .3, .6 + Math.random() * .4, (Math.random() - .5) * .3), 1.6, .55, 3); emit('dud'); }
    // مبارزة وحدة بتصوير كامل: السحب ← الرصاصة البطيئة ← السقوط ← البطل ينفخ الدخان ← يمشي (مشهد سريع)
    function fire(sId, tId) {
        const S = figs.get(String(sId)), Tg = figs.get(String(tId)); if (!S || !Tg) return Promise.resolve(false);
        const dir = V().subVectors(Tg.g.position, S.g.position).setY(0).normalize(), side = V(-dir.z, 0, dir.x);
        let fired = false, b = null, doneCb; const done = new Promise(r => doneCb = r);
        const list = [
            { name: 'draw', dur: .62, labels: false, start() { setState(S, 'draw'); setState(Tg, 'slowdraw'); emit('draw'); },
              cam(k, t, c) { const p = S.g.position; c.pos.copy(p).addScaledVector(fwd(S), 2.5).addScaledVector(rightOf(S), 1.35); c.pos.y = 1.55; c.look.copy(p); c.look.y = 1.35; c.fov = 34; c.roll = .04;
                if (!fired && t > .26) { fired = true; b = shootFx(S, Tg); TS = .07; } } },
            { name: 'bullet', dur: 0, labels: false, until: () => fired && (!b || !b.userData.B.on),
              cam(k, t, c) { const bp = b ? b.position : S.g.position; c.pos.copy(bp).addScaledVector(dir, -1.15).addScaledVector(side, .85); c.pos.y = bp.y + .22; c.look.copy(bp).addScaledVector(dir, 1.4); c.fov = 40; c.roll = Math.sin(t * 1.5) * .05; } },
            { name: 'fall', dur: 2.3, labels: false, start() { TS = .2; },
              cam(k, t, c) { TS = Math.min(1, .2 + Math.max(0, t - .5) * .9); wide(c, 0, t, 0); } },
            // الكاميرا تقرّب من صاحب الطلقة: يرفع المسدس وينفخ فيه والدخان يطلع
            { name: 'hero', dur: 0, labels: false, start() { TS = 1; setState(S, 'win'); S.blown = false; S.puffed = false; for (const [, f] of figs) if (f !== S && f !== Tg && !f.duelist) setState(f, 'cheer'); emit('hero'); },
              cam(k0, t, c) { const k = Math.min(1, t / 2.9); if (t > 2.9 && doneCb) { const d = doneCb; doneCb = null; d(true); } const p = S.g.position, f = fwd(S), rr = rightOf(S), e = ease(k), a = .15 + e * .35, d = 5 - e * 1.9; c.pos.copy(p).addScaledVector(f, Math.cos(a) * d).addScaledVector(rr, Math.sin(a) * d); c.pos.y = .8 + e * 1.3; c.look.copy(p).addScaledVector(rr, e * .3); c.look.y = 1.7 + e * .7; c.fov = 36 - e * 2; c.roll = .03; /* من جهة يده اللي فيها المسدس */ } },
        ];
        play(list).then(ok => { if (!ok && doneCb) { const d = doneCb; doneCb = null; d(false); } });
        return done;
    }
    // «كل المبارزات في وقت واحد»: كل زوج يُحسم لحاله بدون قطع للكاميرا (توجيه + طلقة + سقوط)
    function quickFire(sId, tId) { const S = figs.get(String(sId)), Tg = figs.get(String(tId)); if (!S || !Tg) return;
        setState(S, 'draw'); setState(Tg, 'slowdraw'); setTimeout(() => { if (S.state === 'draw') shootFx(S, Tg); }, 170); }
    // بعد ما تنحسم كل المبارزات: الفايزين ينفخون الدخان، ثم الكل يمشي بمشهد سريع
    function multiOutro(winIds, loseIds) {
        const W = winIds.map(id => figs.get(String(id))).filter(Boolean), Lz = loseIds.map(id => figs.get(String(id))).filter(Boolean), H = W[0];
        let doneCb; const done = new Promise(r => doneCb = r);
        play([
            { name: 'heroAll', dur: 0, labels: false, start() { TS = 1; W.forEach(f => { setState(f, 'win'); f.blown = false; f.puffed = false; f.t = Math.random() * .3; }); emit('hero'); },
              cam(k0, t, c) { const k = Math.min(1, t / 2.6); if (t > 2.6 && doneCb) { const d = doneCb; doneCb = null; d(true); } if (!H) return wide(c, 0, t, 0); const p = H.g.position, f = fwd(H), rr = rightOf(H), e = ease(k), d = 6.5 - e * 2.5; c.pos.copy(p).addScaledVector(f, d * .8).addScaledVector(rr, d * .6); c.pos.x += 2; c.pos.y = 1.4 + e * .8; c.look.copy(p); c.look.x -= 6; c.look.y = 1.9; c.fov = 40; c.roll = .02; } }
        ]).then(ok => { if (!ok && doneCb) { const d = doneCb; doneCb = null; d(false); } });
        return done;
    }
    function shootFx(S, Tg) {
        const m = wp(S.U.muzzle); S.recoil = 1; shake = Math.max(shake, .25); emit('bang', S.g.position.z > 0 ? -.6 : .6);
        flash.position.copy(m); flash.scale.setScalar(1.6); flash.visible = true; flash.material.rotation = Math.random() * 3; flashL.position.copy(m); flashL.intensity = 40; flashT = 0;
        for (let i = 0; i < 6; i++) puff(m.clone(), '#ece6da', .25 + i * .05, V((Math.random() - .5) * .4, .3 + Math.random() * .3, (Math.random() - .5) * .4).addScaledVector(fwd(S), .8), 2.2, .55, 3.5);
        const hit = wp(Tg.U.body); hit.y = Tg.g.position.y + 1.25;
        const b = getBullet(), Q = b.userData.B;
        Q.on = true; Q.from.copy(m); Q.to.copy(hit); Q.dir.subVectors(hit, m); Q.len = Q.dir.length(); Q.dir.normalize(); Q.p = 0;
        b.position.copy(m); b.visible = true; b.rotation.set(0, Math.atan2(-Q.dir.z, Q.dir.x), Math.asin(Q.dir.y));
        Q.onHit = () => { setState(Tg, 'dead'); Tg.landed = false; emit('hit', Tg.id);
            for (let i = 0; i < 8; i++) puff(Q.to.clone(), '#f2d7a8', .2, V((Math.random() - .5) * 2, Math.random() * 1.5, (Math.random() - .5) * 2), .8, .7, 2.5);
            const hat = Tg.U.hat; sc.attach(hat); Tg.flyHat = { o: hat, v: V(Q.dir.x * 2.5, 5.5, Q.dir.z * 2.5 + (Math.random() - .5)), s: V(-7, 0, 4), landed: false }; };
        return b;
    }
    // بعد بطاقة الفايز: الكاميرا ترجع للقطة المبارزة (الشارع والبرج) وتثبت لين «المبارزة التالية»
    function aftermath() { play([{ name: 'aftermath', dur: 0, labels: false, cam(k, t, c) { wide(c, 0, t, 0); } }]); }
    // قبل المبارزة الجاية (ورا الانتقال الناعم): الخاسرين يختفون، والفايزين يرجعون لأماكنهم بالممشى على طول
    function cleanup(winIds, loseIds) { lobby();
        loseIds.forEach(id => { id = String(id); if (figs.has(id)) dropFig(id); crowdOrder = crowdOrder.filter(x => x !== id); });
        winIds.forEach(id => { const f = figs.get(String(id)); if (!f) return; returnToCrowd(f.id); f.g.position.copy(f.target); f.g.rotation.set(0, f.face, 0); });
        for (const [, f] of figs) if (f.state === 'idle') { f.target = homeOf(f.id); f.g.position.copy(f.target); f.face = Math.atan2(-f.target.x * .25, -f.target.z); f.g.rotation.set(0, f.face, 0); } }
    // صورة وجه الشخصية (للبطاقات والشريط السفلي) — ترسم بزاوية من اللوحة وتنقص مباشرة، وتنحفظ لكل لاعب
    // «استوديو» صغير: الشخصية لحالها بإضاءة أمامية وخلفية دافية، ننقلها له لحظة ونرجعها
    const PC = new T.PerspectiveCamera(22, 1, .1, 50), portraits = new Map(), studio = new T.Scene();
    studio.background = canvasTex(4, 128, (g, w, h) => { const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f3c27f'); gr.addColorStop(1, '#a8572e'); g.fillStyle = gr; g.fillRect(0, 0, w, h); }); texList.push(studio.background);
    studio.add(new T.HemisphereLight('#fff1dc', '#7a4a2a', 1.3)); { const k = new T.DirectionalLight('#ffe2b8', 2.2); k.position.set(2, 3, 5); studio.add(k); }
    function portrait(id) { id = String(id); if (portraits.has(id)) return portraits.get(id); const f = figs.get(id); if (!f) return null;
        const g = f.g, P = g.position.clone(), R = g.rotation.clone(), lv = f.U.label.visible;
        try { studio.add(g); g.position.set(0, 0, 0); g.rotation.set(0, 0, 0); f.U.label.visible = false; g.updateMatrixWorld(true);
            const H = wp(f.U.head); PC.position.set(H.x, H.y + .12, H.z + 5); PC.lookAt(H.x, H.y + .3, H.z);
            const c = r.domElement, pr = r.getPixelRatio(), S = 256, sz = V(); r.getSize(sz);
            r.setViewport(0, 0, S / pr, S / pr); r.setScissor(0, 0, S / pr, S / pr); r.setScissorTest(true); r.render(studio, PC); r.setScissorTest(false); r.setViewport(0, 0, sz.x, sz.y);
            const cv = document.createElement('canvas'); cv.width = cv.height = S; cv.getContext('2d').drawImage(c, 0, c.height - S, S, S, 0, 0, S, S);
            const url = cv.toDataURL('image/jpeg', .86); portraits.set(id, url); return url; }
        catch (e) { console.warn('portrait', e); return null; }
        finally { sc.add(g); g.position.copy(P); g.rotation.copy(R); f.U.label.visible = lv; } }
    // مكان راس اللاعب على الشاشة (0..1) — للتبويب اللي فيه إجابته
    function screenPos(id) { const f = figs.get(String(id)); if (!f || !f.g.visible) return null; const p = wp(f.U.head); p.y += f.state === 'dead' ? .2 : 1.35; p.project(cam); if (p.z > 1 || Math.abs(p.x) > 1.2 || Math.abs(p.y) > 1.2) return null; return { x: (p.x + 1) / 2, y: (1 - p.y) / 2 }; }
    function removePlayer(id) { const f = figs.get(String(id)); if (!f || f.state === 'poof') return; const p = f.g.position.clone(); dustBurst(V(p.x, 0, p.z).addScaledVector(fwd(f), -1.1), 14, 1.4); if (f.flyHat) { dustBurst(f.flyHat.o.position, 4, .7); sc.remove(f.flyHat.o); f.flyHat = null; } setState(f, 'poof'); crowdOrder = crowdOrder.filter(x => x !== String(id)); }
    function returnToCrowd(id) { const f = figs.get(String(id)); if (!f) return; f.duelist = false; f.twitch = false; f.wasted = false; duelists = duelists.filter(x => x !== f); setState(f, 'idle'); f.g.rotation.x = 0; f.speed = 3.6; const h = homeOf(String(id)); f.target = h; f.face = Math.atan2(-h.x * .25, -h.z); }
    function champion(id) {
        const f = figs.get(String(id)); if (!f) return; f.target = V(0, 0, 0); f.face = 0; f.speed = 3.6; setState(f, 'champ'); startCoins(V(0, 0, 0)); emit('champion');
        play([{ name: 'champion', dur: 0, labels: true, cam(k, t, c) { const a = t * .32, p = f.g.position; c.pos.set(p.x + Math.sin(a) * 6.2, 1.6 + Math.sin(t * .4) * .5, p.z + Math.cos(a) * 6.2); c.look.set(p.x, 1.9, p.z); c.fov = 38; c.roll = 0; } }]);
    }

    // ---------- الحلقة
    const ro = new ResizeObserver(() => { const w = el.clientWidth || 1, h = el.clientHeight || 1; r.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix(); }); ro.observe(el);
    const clock3 = new T.Clock(); let raf = 0, tw8 = 0, tTotal = 0;
    const mtx = new T.Matrix4(), q = new T.Quaternion(), one = V(1, 1, 1);
    let fpsN = 0, fpsS = 0, fpsNow = 0;
    function tick() {
        raf = requestAnimationFrame(tick);
        const raw = clock3.getDelta(), real = Math.min(raw, .05), dt = real * TS; fpsN++; fpsS += raw; if (fpsS > 1) { fpsNow = fpsN / fpsS; fpsN = 0; fpsS = 0; } tTotal += dt; const t = tTotal;
        blades.rotation.z += dt * .9;
        // غبار معلّق
        const a = dGeo.attributes.position.array; for (let i = 0; i < DN; i++) { a[i * 3] += dt * (.6 + (i % 7) * .08); a[i * 3 + 1] += Math.sin(t + i) * dt * .05; if (a[i * 3] > 55) a[i * 3] = -55; } dGeo.attributes.position.needsUpdate = true;
        for (const P of puffs) { if (!P.s.visible) continue; P.life += dt; const k = P.life / P.max; if (k >= 1) { P.s.visible = false; continue; } P.s.position.addScaledVector(P.v, dt); P.v.multiplyScalar(1 - dt * 1.5); P.s.scale.setScalar(P.g0 + (P.g1 - P.g0) * easeOut(k)); P.s.material.opacity = P.o * (1 - k); }
        if (flashT < 1) { flashT += real; const k = flashT / .12; flash.material.opacity = Math.max(0, 1 - k); flashL.intensity = Math.max(0, 40 * (1 - flashT / .18)); if (k >= 1) flash.visible = false; }
        for (const b of bullets) { const Q = b.userData.B; if (!Q.on) continue; Q.p += 85 * dt; const k = Math.min(1, Q.p / Q.len); b.position.lerpVectors(Q.from, Q.to, k); b.userData.rings.forEach((m, i) => { m.scale.setScalar(1 + ((t * 30 + i * .33) % 1) * 2); m.material.opacity = .35 * (1 - ((t * 30 + i * .33) % 1)); }); if (k >= 1) { Q.on = false; b.visible = false; Q.onHit && Q.onHit(); } }
        if (TW.on) { TW.t += dt; const k = TW.t / TW.dur; if (k >= 1) { TW.on = false; tumble.visible = false; } else { tumble.position.lerpVectors(TW.from, TW.to, k); tumble.position.y = .75 + Math.abs(Math.sin(k * 14)) * .5; tumble.rotation.x += dt * 6; tumble.rotation.z -= dt * 2; } }
        else if (!shot && (tw8 += dt) > 11) { tw8 = 0; const z = (Math.random() - .5) * 8; tumbleweed(V(-40, .75, z), V(40, .75, z + (Math.random() - .5) * 6), 9); }
        for (const m of shocks) { if (m.userData.t >= 1) continue; m.userData.t = Math.min(1, m.userData.t + dt / .9); const k = m.userData.t; m.scale.setScalar(1 + easeOut(k) * 6); m.material.opacity = .75 * (1 - k); if (k >= 1) m.visible = false; }
        if (coinsOn) { for (let i = 0; i < COINS; i++) { const c = coinD[i]; c.p.y += c.v * dt; c.r.x += c.s.x * dt; c.r.y += c.s.y * dt; if (c.p.y < .05) { c.p.y = 14 + Math.random() * 8; c.p.x = coinC.x + (Math.random() - .5) * 9; c.p.z = coinC.z + (Math.random() - .5) * 9; } q.setFromEuler(new T.Euler(c.r.x, c.r.y, 0)); mtx.compose(c.p, q, one); coinMesh.setMatrixAt(i, mtx); } coinMesh.instanceMatrix.needsUpdate = true; }
        for (const [, f] of [...figs]) poseFig(f, dt, t);
        // الكاميرا
        if (shot) { shotT += real; const k = shot.dur ? Math.min(1, shotT / shot.dur) : 0; CS.wide = false; shot.cam(k, shotT, CS); labels = shot.labels;
            // الشاشات الطولية (بث الجوال 9:16): الكاميرا ترجع لورا بنفس الاتجاه عشان اللقطة القريبة ما تنقص من الجوانب
            if (cam.aspect < 1 && !CS.wide) CS.pos.sub(CS.look).multiplyScalar(Math.min(2.2, .78 / cam.aspect)).add(CS.look); }
        else { const lt = t * .07; CS.pos.set(Math.cos(lt) * 27, 7 + Math.sin(t * .13) * .8, Math.sin(lt) * 7.5); CS.look.set(-Math.cos(lt) * 6, 1.6, -Math.sin(lt) * 2); CS.fov = 44; CS.roll = 0; labels = true; }
        if ((shot && shot.cut) || (!shot && lobbyCut)) { if (shot) shot.cut = false; lobbyCut = false; camPos.copy(CS.pos); camLook.copy(CS.look); camFov = CS.fov; camRoll = CS.roll; }
        else { const kk = shot ? 1 - Math.exp(-real * 14) : 1 - Math.exp(-real * 1.6); camPos.lerp(CS.pos, kk); camLook.lerp(CS.look, kk); camFov += (CS.fov - camFov) * kk; camRoll += (CS.roll - camRoll) * kk; }
        cam.position.copy(camPos); if (shake > 0) { cam.position.x += (Math.random() - .5) * shake; cam.position.y += (Math.random() - .5) * shake; shake = Math.max(0, shake - real * 1.2); }
        cam.lookAt(camLook); if (camRoll) cam.rotateZ(camRoll); if (Math.abs(cam.fov - camFov) > .01) { cam.fov = camFov; cam.updateProjectionMatrix(); }
        for (const [, f] of figs) f.U.label.visible = labels && f.state !== 'dead' && f.state !== 'poof' && cam.position.distanceTo(f.g.position) > 6;
        if (!window.__cap) r.render(sc, cam); // تسجيل الفيديو: الرسم مرة وحدة لكل إطار (render())
        if (shot && ((shot.dur && shotT >= shot.dur) || (shot.until && shot.until()))) next();
    }
    raf = requestAnimationFrame(tick);
    const onVis = () => { if (document.hidden) cancelAnimationFrame(raf); else { clock3.getDelta(); raf = requestAnimationFrame(tick); } };
    document.addEventListener('visibilitychange', onVis);

    function stop() {
        cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
        sc.traverse(o => { o.geometry && o.geometry.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose(); }); });
        GC.forEach(g => g.dispose()); texList.forEach(t => t.dispose()); r.dispose(); r.domElement.remove();
    }
    return { setPlayers, duelIntro, standoff, drawGuns, wasteShot, fire, quickFire, multiOutro, aftermath, cleanup, portrait, screenPos, crossfade, removePlayer, returnToCrowd, champion, lobby, stop, get busy() { return !!shot; }, render() { r.render(sc, cam); }, get shotName() { return shot ? shot.name : 'lobby'; }, get fps() { return fpsNow; } };
}
