// «الهرم» — المشهد الثري دي (عرض وإخراج فقط؛ القواعد والقرعة والمؤقتات والنقاط كلها في pyr-game.js).
//
// الساحة: مهرجان ألعاب ليلي — أرضية هندسية مضيئة، مدرّجات بجمهور يتحرك، أبراج إضاءة بحزم ضوء،
//   بوابات وشاشات LED، أعلام ملوّنة، فوانيس طائرة، وحلقات هولوغرام فوق الهرم. ألوان هوية ألعاب أيمن
//   بنفسجي رمادي هادئ شبه أحادي، والذهبي الباهت للفائز فقط.
// الهرم: كل مرحلة «درجة» (منصة) فيها دوائر بعدد اللاعبين — الدرجة الجاية أعلى وأبعد وأصغر.
//   الدوائر InstancedMesh (4 أوامر رسم لكل درجة مهما كان العدد) والأرقام من أطلس واحد.
// الشخصيات: شخصيات الأنمي المشتركة (VRM — js/agp-vrm-characters.js)، وفوق حركاتها طبقة وضعيات
//   (POSE_KIT) ونظام سلوك لكل شخصية بتوقيت عشوائي: التفات، يدين على الخصر، تكتيف، تفكير، توتر، سوالف مع
//   الجار، تلويح، تصفيق، قفز، صدمة، حزن، رقصة الفوز.
// المخرج: لقطات ناعمة (تقديم من فوق ← مائلة، اختيار بحركة بطيئة، اقتراب عند انتهاء الوقت، قريبة للإقصاء،
//   بناء الصف الجديد، لقطة الفائز). كل المدد بالوقت الحقيقي، فاختلاف الجودة ما يغيّر توقيت اللعبة.
// الجودة: auto / low / balanced / high — auto يقيس معدل الإطارات الفعلي وينزل/يطلع درجة بدرجة.
//
// API: mountPyramid(el, { quality, onEvent(name, data), onQuality(info) }) → {
//   setPlayers, startMatch, choosing, setUrgency, pick, timeUp, moveIn, eliminate, roulette, survived,
//   nextLevel, champion, reset, setQuality, qualityInfo, screen, stop }
import * as THREE from 'three';
const T = THREE;

// ================================================================ أدوات
const V = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z);
const clamp01 = k => Math.max(0, Math.min(1, k));
const lerp = (a, b, k) => a + (b - a) * k;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const easeOut = k => 1 - Math.pow(1 - k, 3);
const easeBack = k => { const c = 1.9; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const damp = (dt, rate) => 1 - Math.exp(-dt * rate);
const now = () => performance.now() / 1000;
const wait = s => new Promise(r => setTimeout(r, s * 1000));
function hash(s) { s = String(s); let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return (x >>> 0) / 4294967296; }; }
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new T.CanvasTexture(c); t.colorSpace = T.SRGBColorSpace; t.anisotropy = 4; return t; }
function lerpAng(a, b, k) { const d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; }
const FONT = '"IBM Plex Sans Arabic","Cairo","Zain",system-ui,sans-serif';

// هوية ألعاب أيمن (روليت الإقصاء) + لمسات ذهبية وبرتقالية
const TEAL = '#2e6e70', SAND = '#e9d6b0'; // اللونين الأساسيين للعبة (بيئة مفتوحة، بعيداً عن هوية المنصة)
const C = { purple: TEAL, violet: '#3f8587', deep: '#1d4a4c', lav: '#f4ead6', cyan: '#4f9a9a', sky: '#8fc2c0', blue: '#3f8587', gold: '#d9a95c', orange: '#d9a95c', pink: SAND, red: '#c4664c' };
export const PLAYER_COLORS = ['#2e6e70', '#3f8587', '#1d5a5c', '#4f9a9a', '#b8863f', '#c99a52', '#a37636', '#5a8f7e']; // درجات من اللونين فقط
export const colorOf = id => PLAYER_COLORS[hash(id) % PLAYER_COLORS.length];

// ================================================================ مستويات الجودة
// الاختلاف بصري وأدائي فقط. TIERS = إعداد كل مستوى، LADDER = درجات «تلقائي» من الأقوى للأخف.
const TIERS = {
    low: { prMax: .85, shadow: 0, particles: 320, crowd: .28, decor: 0, beams: 2, rigSkip: 2, stars: .35, label: 'منخفضة' },
    balanced: { prMax: 1.25, shadow: 1024, particles: 1000, crowd: .6, decor: 1, beams: 4, rigSkip: 1, stars: .7, label: 'متوازنة' },
    high: { prMax: 2, shadow: 2048, particles: 2200, crowd: 1, decor: 2, beams: 6, rigSkip: 1, stars: 1, label: 'قوية' },
};
const LADDER = [{ tier: 'high', prK: 1 }, { tier: 'balanced', prK: 1 }, { tier: 'balanced', prK: .8 }, { tier: 'low', prK: 1 }, { tier: 'low', prK: .72 }];
// فحص أولي للجهاز (مؤشر فقط — القرار الحقيقي من قياس السلاسة أثناء التشغيل)
function probeGPU() {
    const o = { renderer: '', software: false, maxTex: 4096, cores: navigator.hardwareConcurrency || 0, mem: navigator.deviceMemory || 0 };
    try {
        const c = document.createElement('canvas'), gl = c.getContext('webgl2') || c.getContext('webgl');
        if (gl) { const ext = gl.getExtension('WEBGL_debug_renderer_info'); o.renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); o.maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE); const l = gl.getExtension('WEBGL_lose_context'); l && l.loseContext(); }
    } catch (e) { }
    o.software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(o.renderer);
    // سقف «تلقائي»: معالج رسوم برمجي = منخفضة؛ ذاكرة قليلة جداً = متوازنة كحد أعلى؛ غير كذا يقدر يوصل «قوية» لو القياس سمح
    o.ceilIdx = o.software ? 3 : (o.maxTex < 8192 || (o.mem && o.mem <= 2) || (o.cores && o.cores <= 2)) ? 1 : 0;
    o.startIdx = o.software ? 3 : 1;
    return o;
}

// ================================================================ المشهد
export async function mountPyramid(el, opts = {}) {
    const emit = opts.onEvent || (() => { });
    const onQuality = opts.onQuality || (() => { });
    const REDUCED = matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    try { await Promise.race([document.fonts.load('700 64px "IBM Plex Sans Arabic"'), wait(2)]); } catch (e) { }

    // ---------- الجودة
    const probe = probeGPU();
    let mode = ['auto', 'low', 'balanced', 'high'].includes(opts.quality) ? opts.quality : 'auto';
    let ladderIdx = probe.startIdx;
    const cur = () => mode === 'auto' ? LADDER[ladderIdx] : { tier: mode, prK: 1 };
    let cfg = TIERS[cur().tier];

    const r = new T.WebGLRenderer({ antialias: !(probe.software || mode === 'low'), powerPreference: 'high-performance' });
    r.outputColorSpace = T.SRGBColorSpace; r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.0;
    r.shadowMap.enabled = true; r.shadowMap.type = T.PCFShadowMap;
    el.appendChild(r.domElement); r.domElement.style.cssText = 'display:block;width:100%;height:100%';

    const sc = new T.Scene();
    const OPEN = true; // بيئة مفتوحة (طلب صاحب المنصة): بدون مدرّجات/أبراج/بوابة
    sc.fog = new T.FogExp2('#6f6650', .0075);
    const cam = new T.PerspectiveCamera(42, 1, .1, 1500);
    cam.position.set(0, 60, 60); cam.lookAt(0, 0, 0);
    const disposables = [];
    const decor = [];  // مجموعات ديكور تظهر حسب المستوى: userData.lvl 0/1/2
    const addDecor = (obj, lvl) => { obj.userData.lvl = lvl; decor.push(obj); sc.add(obj); return obj; };

    // ---------- السماء: قبة بتدرّج ليلي بنفسجي/كحلي + نجوم
    {
        const g = new T.SphereGeometry(1000, 32, 20), p = g.attributes.position, col = [];
        const stops = [[-1, '#6e5f45'], [-.02, '#8c7b5c'], [.04, '#9a8a6a'], [.14, '#5f7f7a'], [.4, '#2f5a5a'], [1, '#1b3c3e']].map(([y, c]) => [y, new T.Color(c)]);
        for (let i = 0; i < p.count; i++) { const y = p.getY(i) / 1000; let a = stops[0], b = stops[stops.length - 1]; for (let j = 0; j < stops.length - 1; j++) if (y >= stops[j][0] && y <= stops[j + 1][0]) { a = stops[j]; b = stops[j + 1]; break; } const c = a[1].clone().lerp(b[1], (y - a[0]) / ((b[0] - a[0]) || 1)); col.push(c.r, c.g, c.b); }
        g.setAttribute('color', new T.Float32BufferAttribute(col, 3));
        sc.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide, fog: false, depthWrite: false })));
    }
    const STAR_N = 900;
    const stars = (() => {
        const R = rng(7), pos = new Float32Array(STAR_N * 3), col = new Float32Array(STAR_N * 3), tint = [new T.Color('#cddfdb'), new T.Color(C.lav), new T.Color(C.lav), new T.Color('#cddfdb')];
        for (let i = 0; i < STAR_N; i++) { const th = R() * Math.PI * 2, ph = Math.acos(1 - R() * .85), rr = 800; pos.set([Math.sin(ph) * Math.cos(th) * rr, Math.cos(ph) * rr + 40, Math.sin(ph) * Math.sin(th) * rr], i * 3); const c = tint[i % 4]; col.set([c.r, c.g, c.b], i * 3); }
        const g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
        const m = new T.Points(g, new T.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, opacity: .3, depthWrite: false }));
        m.visible = !OPEN; sc.add(m); return m;
    })();

    // ---------- الإضاءة
    const hemi = new T.HemisphereLight('#e4f0ec', '#c7b38c', 1.25); sc.add(hemi);
    const key = new T.DirectionalLight('#fff3e0', 1.7); key.position.set(18, 34, 26); sc.add(key); sc.add(key.target);
    key.shadow.camera.left = -26; key.shadow.camera.right = 26; key.shadow.camera.top = 26; key.shadow.camera.bottom = -26; key.shadow.camera.near = 1; key.shadow.camera.far = 120; key.shadow.bias = -.0006; key.shadow.normalBias = .02;
    const rimA = new T.DirectionalLight(C.cyan, .25); rimA.position.set(-30, 18, -30); sc.add(rimA);
    const rimB = new T.DirectionalLight(C.lav, .2); rimB.position.set(30, 16, -26); sc.add(rimB);
    const amb = new T.AmbientLight('#cfc4a8', .25); sc.add(amb);

    // أجواء الإضاءة حسب الحدث (تتبدّل بنعومة): لون السماء/الأرض، شدة الضوء الرئيسي، الضباب، توهج الأرضية، حماس الجمهور
    const MOODS = { // محيط داكن هادئ والهرم مضاء — تتغير الإضاءة بخفة مع الأحداث
        calm: { hemi: '#a9c4bf', ground: '#6e5c3e', key: '#fff1dc', keyI: 1.65, fog: '#6f6650', floor: 0, crowd: .3, beam: 0, exp: .95 },
        choose: { hemi: '#a6c4c0', ground: '#6a5a3e', key: '#fff4e4', keyI: 1.7, fog: '#6c6450', floor: 0, crowd: .3, beam: 0, exp: .95 },
        tense: { hemi: '#93aeaa', ground: '#5e4f36', key: '#f6e2c8', keyI: 1.55, fog: '#625a48', floor: 0, crowd: .2, beam: 0, exp: .92 },
        danger: { hemi: '#9aa29c', ground: '#5e4636', key: '#f2d8c4', keyI: 1.5, fog: '#615446', floor: 0, crowd: .2, beam: 0, exp: .9 },
        survive: { hemi: '#b2ccc7', ground: '#725f40', key: '#fff6e8', keyI: 1.8, fog: '#736a54', floor: 0, crowd: .5, beam: 0, exp: .97 },
        win: { hemi: '#c8c4a8', ground: '#7a6038', key: '#ffe6bc', keyI: 1.9, fog: '#77684a', floor: 0, crowd: .6, beam: 0, exp: .98 },
    };
    const moodNow = { hemi: new T.Color('#a9c4bf'), ground: new T.Color('#6e5c3e'), key: new T.Color('#fff1dc'), keyI: 1.65, fog: new T.Color('#6f6650'), floor: 0, crowd: .3, beam: 0, exp: .95 };
    let moodT = MOODS.calm, urgency = 0;
    const setMood = k => { moodT = MOODS[k] || MOODS.calm; };
    const _c = new T.Color();
    function tickMood(dt, t) {
        const k = damp(dt, 1.6), m = moodT;
        moodNow.hemi.lerp(_c.set(m.hemi), k); moodNow.ground.lerp(_c.set(m.ground), k); moodNow.key.lerp(_c.set(m.key), k); moodNow.fog.lerp(_c.set(m.fog), k);
        for (const p of ['keyI', 'floor', 'crowd', 'beam', 'exp']) moodNow[p] = lerp(moodNow[p], m[p], k);
        // الوقت المتبقي: آخر ثواني الاختيار تميل للبرتقالي/الأحمر وتنبض
        const u = urgency, pulse = u > 0 ? (.5 + .5 * Math.sin(t * (4 + u * 6))) * u : 0;
        hemi.color.copy(moodNow.hemi).lerp(_c.set('#f0d7b8'), u * .2); hemi.groundColor.copy(moodNow.ground);
        key.color.copy(moodNow.key).lerp(_c.set('#e4d9c6'), u * .15); key.intensity = moodNow.keyI;
        sc.fog.color.copy(moodNow.fog).lerp(_c.set('#345353'), u * .3);
        r.toneMappingExposure = moodNow.exp;
        
        crowdU.uAmp.value = moodNow.crowd;
    }

    // ---------- الأرضية: نقوش هندسية مضيئة (دوائر، أشعة، معيّنات) على كحلي غامق
    const FLOOR_R = 170;
    const floorMat = (() => {
        const S = 2048, h = S / 2, toPx = rr => rr / FLOOR_R * h;
        const base = canvasTex(S, S, (g) => {
            const rg = g.createRadialGradient(h, h, 0, h, h, h); rg.addColorStop(0, '#b9a479'); rg.addColorStop(.4, '#a8936a'); rg.addColorStop(1, '#8c7853'); g.fillStyle = rg; g.fillRect(0, 0, S, S);
            // حلقات عريضة بدرجات قريبة (نقش هادئ بدون خطوط رفيعة تسبب تشويش)
            for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(24,57,59,.12)'; g.lineWidth = toPx(5); g.beginPath(); g.arc(h, h, toPx(14 + i * 13), 0, Math.PI * 2); g.stroke(); }
        });
        const glow = canvasTex(S, S, (g) => {
            g.fillStyle = '#000'; g.fillRect(0, 0, S, S); g.translate(h, h); g.lineCap = 'round';
            const ring = (rr, w, c, dash) => { g.strokeStyle = c; g.lineWidth = w; g.setLineDash(dash || []); g.beginPath(); g.arc(0, 0, toPx(rr), 0, Math.PI * 2); g.stroke(); g.setLineDash([]); };
            g.filter = 'blur(2px)'; // حواف ناعمة
            ring(16, 7, C.purple); ring(34, 6, C.purple); ring(58, 6, C.purple); ring(84, 5, C.purple); ring(110, 5, C.purple);
            for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, r0 = toPx(36), r1 = toPx(84); g.strokeStyle = 'rgba(190,210,206,.3)'; g.lineWidth = 4; g.beginPath(); g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0); g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1); g.stroke(); }
            // معيّنات ذهبية على الحلقة
            for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2, rr = toPx(47), x = Math.cos(a) * rr, y = Math.sin(a) * rr, s = toPx(2.1); g.save(); g.translate(x, y); g.rotate(a); g.strokeStyle = 'rgba(190,210,206,.6)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-s, 0); g.lineTo(0, -s * .6); g.lineTo(s, 0); g.lineTo(0, s * .6); g.closePath(); g.stroke(); g.restore(); }
            // نجمة ثمانية بالمنتصف
            g.strokeStyle = 'rgba(185,205,201,.35)'; g.lineWidth = 6; for (let k = 0; k < 2; k++) { g.save(); g.rotate(k * Math.PI / 4); const s = toPx(11); g.strokeRect(-s, -s, s * 2, s * 2); g.restore(); }
        });
        // النقش التركوازي يندمج مع الرمل (بدون إضاءة ذاتية)
        { const bc = base.image.getContext('2d'); bc.globalAlpha = .28; bc.drawImage(glow.image, 0, 0); bc.globalAlpha = 1; base.needsUpdate = true; }
        const m = new T.MeshStandardMaterial({ map: base, emissive: '#000000', roughness: .92, metalness: 0 });
        base.anisotropy = 8; glow.dispose();
        const mesh = new T.Mesh(new T.CircleGeometry(FLOOR_R, 96), m); mesh.rotation.x = -Math.PI / 2; mesh.receiveShadow = true; sc.add(mesh);
        return m;
    })();

    // ---------- موجات ضوئية على الأرض + حلقات (مجمّعة وتُعاد)
    const ringTex = canvasTex(256, 256, (g, w) => { const rg = g.createRadialGradient(128, 128, 90, 128, 128, 128); rg.addColorStop(0, 'rgba(255,255,255,0)'); rg.addColorStop(.6, 'rgba(255,255,255,1)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });
    const glowTex = canvasTex(128, 128, (g, w) => { const rg = g.createRadialGradient(64, 64, 0, 64, 64, 64); rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(.35, 'rgba(255,255,255,.55)'); rg.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = rg; g.fillRect(0, 0, w, w); });
    const ringGeo = new T.PlaneGeometry(1, 1); ringGeo.rotateX(-Math.PI / 2);
    const pulses = Array.from({ length: 14 }, () => { const m = new T.Mesh(ringGeo, new T.MeshBasicMaterial({ map: ringTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 })); m.visible = false; m.renderOrder = 2; sc.add(m); return { m, t: 0, d: 1, r0: 1, r1: 2, a: 1 }; });
    function pulse(pos, color, r0, r1, dur, alpha = 1) { const p = pulses.find(x => !x.m.visible) || pulses[0]; p.m.visible = true; p.m.position.copy(pos); p.m.material.color.set(color); p.t = 0; p.d = dur; p.r0 = r0; p.r1 = r1; p.a = alpha; return p; }
    function tickPulses(dt) { for (const p of pulses) { if (!p.m.visible) continue; p.t += dt; const k = p.t / p.d; if (k >= 1) { p.m.visible = false; continue; } const s = lerp(p.r0, p.r1, easeOut(k)) * 2; p.m.scale.set(s, 1, s); p.m.material.opacity = p.a * (1 - k) * Math.min(1, k * 6); } }

    // ---------- الجسيمات (نظامين: شرار مضيء + قصاصات احتفال) — مجمّعة بحد أقصى حسب الجودة
    function makeParticles(max, additive) {
        const pos = new Float32Array(max * 3), col = new Float32Array(max * 3), size = new Float32Array(max), alpha = new Float32Array(max);
        const vel = new Float32Array(max * 3), life = new Float32Array(max), age = new Float32Array(max), grav = new Float32Array(max), drag = new Float32Array(max), sz0 = new Float32Array(max), spin = new Float32Array(max);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(pos, 3).setUsage(T.DynamicDrawUsage)); g.setAttribute('color', new T.BufferAttribute(col, 3).setUsage(T.DynamicDrawUsage));
        g.setAttribute('size', new T.BufferAttribute(size, 1).setUsage(T.DynamicDrawUsage)); g.setAttribute('alpha', new T.BufferAttribute(alpha, 1).setUsage(T.DynamicDrawUsage));
        const mat = new T.ShaderMaterial({
            uniforms: { map: { value: additive ? glowTex : null }, scale: { value: 400 } }, transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
            vertexShader: 'attribute float size; attribute float alpha; varying vec3 vC; varying float vA; uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.0); gl_PointSize=size*scale/max(.1,-mv.z); gl_Position=projectionMatrix*mv; }',
            fragmentShader: additive ? 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t=texture2D(map,gl_PointCoord); gl_FragColor=vec4(vC*t.rgb*vA*.75, t.a*vA); }'
                : 'varying vec3 vC; varying float vA; void main(){ vec2 d=abs(gl_PointCoord-.5); if(max(d.x,d.y*1.7)>.5) discard; gl_FragColor=vec4(vC,vA); }',
            vertexColors: true,
        });
        const pts = new T.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3; sc.add(pts);
        let n = 0, cap = max;
        const sys = {
            pts, set cap(v) { cap = Math.min(max, v | 0); }, get cap() { return cap; },
            emit(p, o = {}) {
                const cnt = Math.max(1, Math.round((o.count || 20) * cap / max)), cols = [].concat(o.color || '#ffffff').map(c => new T.Color(c));
                for (let j = 0; j < cnt; j++) {
                    let i = -1; if (n < cap) i = n++; else { for (let k = 0; k < n; k++) if (age[k] >= life[k]) { i = k; break; } } if (i < 0) return;
                    const sp = (o.speed || 4) * (.4 + Math.random() * .8), th = Math.random() * Math.PI * 2, u = o.cone != null ? 1 - Math.random() * o.cone : Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
                    const up = o.up || 0, spread = o.spread || 0;
                    pos[i * 3] = p.x + (Math.random() - .5) * spread; pos[i * 3 + 1] = p.y + (Math.random() - .5) * spread * .4; pos[i * 3 + 2] = p.z + (Math.random() - .5) * spread;
                    vel[i * 3] = s * Math.cos(th) * sp; vel[i * 3 + 1] = u * sp + up; vel[i * 3 + 2] = s * Math.sin(th) * sp;
                    const c = cols[(Math.random() * cols.length) | 0]; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
                    life[i] = (o.life || 1.2) * (.6 + Math.random() * .7); age[i] = 0; grav[i] = o.gravity == null ? 4 : o.gravity; drag[i] = o.drag == null ? 1.2 : o.drag; sz0[i] = (o.size || .25) * (.6 + Math.random() * .8); spin[i] = Math.random() * 6;
                }
            },
            update(dt, t) {
                let alive = 0;
                for (let i = 0; i < n; i++) {
                    if (age[i] >= life[i]) { alpha[i] = 0; size[i] = 0; continue; }
                    alive++; age[i] += dt; const k = age[i] / life[i], dr = Math.exp(-drag[i] * dt);
                    vel[i * 3] *= dr; vel[i * 3 + 1] = vel[i * 3 + 1] * dr - grav[i] * dt; vel[i * 3 + 2] *= dr;
                    if (!additive) { vel[i * 3] += Math.sin(t * 3 + spin[i]) * dt * .8; }
                    pos[i * 3] += vel[i * 3] * dt; pos[i * 3 + 1] += vel[i * 3 + 1] * dt; pos[i * 3 + 2] += vel[i * 3 + 2] * dt;
                    alpha[i] = (1 - k) * Math.min(1, k * 8); size[i] = sz0[i] * (additive ? (1 - k * .5) : (.7 + .3 * Math.abs(Math.sin(t * 6 + spin[i]))));
                }
                while (n > 0 && age[n - 1] >= life[n - 1]) n--;
                g.setDrawRange(0, n);
                if (alive || n) { for (const a of ['position', 'color', 'size', 'alpha']) g.attributes[a].needsUpdate = true; }
            },
        };
        return sys;
    }
    const sparks = makeParticles(2200, true), confetti = makeParticles(900, false);

    // ---------- الساحة: مدرّجات بجمهور، أبراج إضاءة، بوابات، شاشات، أعلام، فوانيس، حلقات هولوغرام
    const ARENA_R = 78;
    const darkMat = new T.MeshStandardMaterial({ color: '#9c875f', roughness: .8, metalness: .1 });
    const trimMat = c => new T.MeshStandardMaterial({ color: TEAL, roughness: .6 }); // كل الإضاءات الديكورية بلون واحد هادئ
    // مدرّجات (Lathe) — قوس كبير خلف الهرم وعلى الجنبين، ومفتوح من جهة الكاميرا
    if (!OPEN) {
        const prof = []; const steps = 7;
        for (let i = 0; i <= steps; i++) { const rr = ARENA_R + i * 3.2, y = i * 2.1; prof.push(new T.Vector2(rr, y)); prof.push(new T.Vector2(rr + 3.2, y)); }
        prof.push(new T.Vector2(ARENA_R + steps * 3.2 + 3.2, 0));
        const arcStart = Math.PI * .62, arcLen = Math.PI * 1.76; // فتحة باتجاه الكاميرا (+Z)
        const lathe = new T.LatheGeometry(prof, 72, arcStart, arcLen);
        const stands = new T.Mesh(lathe, darkMat); stands.receiveShadow = false; sc.add(stands);
        // خطوط ضوء على حافة كل درجة
        for (let i = 1; i <= steps; i += 2) { const tor = new T.Mesh(new T.TorusGeometry(ARENA_R + i * 3.2, .12, 4, 120, arcLen), trimMat(i % 4 === 1 ? C.cyan : C.violet)); tor.rotation.x = Math.PI / 2; tor.rotation.z = -(arcStart + arcLen) + Math.PI / 2 + Math.PI; tor.position.y = i * 2.1 + .05; sc.add(tor); }
        // ضوء علوي حول المدرّج
        const crown = new T.Mesh(new T.TorusGeometry(ARENA_R + steps * 3.2 + 2.5, .35, 6, 120, arcLen), trimMat(C.gold)); crown.rotation.x = Math.PI / 2; crown.rotation.z = -(arcStart + arcLen) + Math.PI / 2 + Math.PI; crown.position.y = steps * 2.1 + 3; sc.add(crown);
    }
    // الجمهور: InstancedMesh بشيدر يحرّكه (نط وتلويح) بدون أي حساب على المعالج
    const crowdU = { uTime: { value: 0 }, uAmp: { value: .4 } };
    const CROWD_MAX = 2600;
    const crowd = (() => {
        const geo = new T.CapsuleGeometry(.32, .6, 2, 6); geo.translate(0, .62, 0);
        const mat = new T.MeshLambertMaterial({ color: '#ffffff' });
        mat.onBeforeCompile = sh => {
            Object.assign(sh.uniforms, crowdU);
            sh.vertexShader = 'uniform float uTime; uniform float uAmp;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
              float ph = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
              float b = max(0.0, sin(uTime * (4.0 + ph * 3.0) + ph * 40.0));
              transformed.y += b * b * .45 * uAmp * step(.35, ph);
              transformed.x += sin(uTime * 1.3 + ph * 20.0) * .06;`);
        };
        mat.customProgramCacheKey = () => 'pyr-crowd';
        const m = new T.InstancedMesh(geo, mat, CROWD_MAX); m.frustumCulled = false;
        const R = rng(11), M = new T.Matrix4(), q = new T.Quaternion(), cols = ['#647f7e', '#698382', '#627d7c', '#6e8887', '#66807f'].map(c => new T.Color(c));
        let i = 0;
        for (let row = 0; row < 7 && i < CROWD_MAX; row++) {
            const rr = ARENA_R + row * 3.2 + 1.6, y = row * 2.1 + 2.1, per = Math.floor(rr * Math.PI * 1.7 / .95);
            for (let j = 0; j < per && i < CROWD_MAX; j++) {
                const a = Math.PI * .62 + (j + R() * .5) / per * Math.PI * 1.76, x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
                q.setFromAxisAngle(V(0, 1, 0), Math.atan2(-x, -z)); M.compose(V(x, y, z), q, V(1, .85 + R() * .35, 1)); m.setMatrixAt(i, M); m.setColorAt(i, cols[(R() * cols.length) | 0]); i++;
            }
        }
        m.count = i; m.userData.max = i; m.visible = !OPEN; sc.add(m); return m;
    })();
    // أبراج الإضاءة + حزم الضوء (مخاريط شفافة تتحرك)
    const beamTex = canvasTex(64, 256, (g, w, h) => { const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.7, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = lg; g.fillRect(0, 0, w, h); });
    const beams = [];
    if (!OPEN) {
        const towerGeo = new T.CylinderGeometry(.6, 1, 26, 8); towerGeo.translate(0, 13, 0);
        const headGeo = new T.BoxGeometry(3.2, 1.4, 1.6);
        const coneGeo = new T.CylinderGeometry(.5, 7, 70, 24, 1, true); coneGeo.translate(0, -35, 0);
        const colors = [C.violet, C.cyan, C.gold, C.pink, C.sky, C.orange];
        for (let i = 0; i < 6; i++) {
            const a = Math.PI * .7 + i / 5 * Math.PI * 1.6, rr = ARENA_R - 6, x = Math.cos(a) * rr, z = -Math.sin(a) * rr;
            const tw = new T.Mesh(towerGeo, darkMat); tw.position.set(x, 0, z); sc.add(tw);
            const hd = new T.Mesh(headGeo, trimMat(colors[i])); hd.position.set(x, 26.5, z); sc.add(hd);
            const pivot = new T.Group(); pivot.position.set(x, 26, z); sc.add(pivot);
            const cone = new T.Mesh(coneGeo, new T.MeshBasicMaterial({ map: beamTex, color: colors[i], transparent: true, opacity: .22, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false, fog: false }));
            pivot.add(cone); beams.push({ pivot, cone, a0: Math.atan2(-x, -z), ph: i * 1.7, col: colors[i] });
        }
    }
    // البوابة الكبيرة خلف الهرم + شاشتين LED
    let screenCtx = null, screenTex = null;
    if (!OPEN) {
        const g = new T.Group(); g.position.set(0, 0, -ARENA_R + 4); sc.add(g);
        const pil = new T.BoxGeometry(3, 34, 3);
        for (const sx of [-1, 1]) { const p = new T.Mesh(pil, darkMat); p.position.set(sx * 22, 17, 0); g.add(p); const tr = new T.Mesh(new T.BoxGeometry(.25, 34, .25), trimMat(C.cyan)); tr.position.set(sx * 22 - sx * 1.6, 17, 1.6); g.add(tr); }
        const arch = new T.Mesh(new T.TorusGeometry(22, 1.4, 8, 64, Math.PI), darkMat); arch.position.y = 34; g.add(arch);
        const archT = new T.Mesh(new T.TorusGeometry(22, .22, 6, 64, Math.PI), trimMat(C.gold)); archT.position.set(0, 34, 1.5); g.add(archT);
        // الشاشة: كانفس يُعاد رسمه مع الأحداث
        const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 512; screenCtx = cv.getContext('2d');
        screenTex = new T.CanvasTexture(cv); screenTex.colorSpace = T.SRGBColorSpace;
        const scr = new T.Mesh(new T.PlaneGeometry(30, 15), new T.MeshBasicMaterial({ map: screenTex, toneMapped: false, fog: false })); scr.position.set(0, 26, .8); g.add(scr);
        const frame = new T.Mesh(new T.BoxGeometry(31.4, 16.4, .6), darkMat); frame.position.set(0, 26, .3); g.add(frame);
        for (const sx of [-1, 1]) { const side = new T.Mesh(new T.PlaneGeometry(14, 22), new T.MeshBasicMaterial({ map: screenTex, toneMapped: false, fog: false })); side.position.set(sx * 46, 16, -ARENA_R + 16); side.lookAt(0, 12, 20); sc.add(side); const fr = new T.Mesh(new T.BoxGeometry(15, 23, .5), darkMat); fr.position.copy(side.position); fr.quaternion.copy(side.quaternion); fr.translateZ(-.4); sc.add(fr); }
    }
    let screenLines = ['الهرم', 'ألعاب أيمن'];
    function drawScreen(t) {
        const g = screenCtx, w = 1024, h = 512; if (!g) return;
        const lg = g.createLinearGradient(0, 0, w, h); lg.addColorStop(0, '#436060'); lg.addColorStop(1, '#506c6c'); g.fillStyle = lg; g.fillRect(0, 0, w, h);
        // نبض دوائر بالخلفية
        g.globalAlpha = .05; for (let i = 0; i < 9; i++) { g.strokeStyle = i % 2 ? C.cyan : C.violet; g.lineWidth = 6; g.beginPath(); g.arc(w / 2, h / 2, ((t * 60 + i * 60) % 540), 0, Math.PI * 2); g.stroke(); } g.globalAlpha = 1;
        g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#ffffff'; g.font = `700 150px ${FONT}`; g.shadowColor = 'rgba(0,0,0,.25)'; g.shadowBlur = 10; g.fillText(screenLines[0] || '', w / 2, h * .42);
        g.shadowBlur = 0; g.fillStyle = C.gold; g.font = `700 64px ${FONT}`; g.fillText(screenLines[1] || '', w / 2, h * .78);
        screenTex.needsUpdate = true;
    }
    // أعلام ملوّنة بين الأبراج (ديكور متوسط) — تتمايل
    const bunting = [];
    {
        const geo = new T.BufferGeometry(), P = [], Cc = [], cols = [C.violet, C.cyan, C.gold, C.pink, C.orange, C.sky].map(c => new T.Color(c));
        for (let s = 0; s < 8; s++) {
            const a0 = Math.PI * .7 + s / 8 * Math.PI * 1.6, a1 = a0 + Math.PI * 1.6 / 8, rr = ARENA_R - 6, y0 = 22;
            const p0 = V(Math.cos(a0) * rr, y0, -Math.sin(a0) * rr), p1 = V(Math.cos(a1) * rr, y0, -Math.sin(a1) * rr), N = 14;
            for (let i = 0; i < N; i++) {
                const k0 = i / N, k1 = (i + .7) / N, sag = k => -Math.sin(k * Math.PI) * 5;
                const A = p0.clone().lerp(p1, k0).setY(y0 + sag(k0)), B = p0.clone().lerp(p1, k1).setY(y0 + sag(k1)), M = A.clone().lerp(B, .5).setY((A.y + B.y) / 2 - 1.6);
                P.push(A.x, A.y, A.z, B.x, B.y, B.z, M.x, M.y, M.z); const c = cols[(i + s) % cols.length]; for (let j = 0; j < 3; j++) Cc.push(c.r, c.g, c.b);
            }
        }
        geo.setAttribute('position', new T.Float32BufferAttribute(P, 3)); geo.setAttribute('color', new T.Float32BufferAttribute(Cc, 3)); geo.computeVertexNormals();
        const m = new T.Mesh(geo, new T.MeshBasicMaterial({ vertexColors: true, side: T.DoubleSide, toneMapped: false })); const grp = new T.Group(); grp.add(m); addDecor(grp, 9); bunting.push(grp); // مخفية: كانت تزحم الألوان
    }
    // فوانيس طائرة (ديكور قوي) — تطلع ببطء وتتمايل
    const LANT = 70;
    const lanterns = (() => {
        const geo = new T.SphereGeometry(.55, 10, 8); geo.scale(1, 1.25, 1);
        const m = new T.InstancedMesh(geo, new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false }), LANT); const R = rng(5), data = [];
        const cols = [C.gold, C.lav].map(c => new T.Color(c).multiplyScalar(.75));
        for (let i = 0; i < LANT; i++) { const a = R() * Math.PI * 2, rr = 30 + R() * 50; data.push({ x: Math.cos(a) * rr, z: Math.sin(a) * rr - 10, y: R() * 70, v: .6 + R() * .9, ph: R() * 9 }); m.setColorAt(i, cols[i % cols.length]); }
        m.userData.data = data; m.frustumCulled = false; addDecor(m, 9); return m;
    })();
    // حلقات هولوغرام فوق الهرم (تتحرك مع القمة)
    const holo = new T.Group(); addDecor(holo, 9);
    {
        const a = new T.Mesh(new T.TorusGeometry(9, .09, 6, 96), new T.MeshBasicMaterial({ color: C.cyan, transparent: true, opacity: .12, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        const b = new T.Mesh(new T.TorusGeometry(11.5, .07, 6, 96), new T.MeshBasicMaterial({ color: C.violet, transparent: true, opacity: .1, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        a.rotation.x = Math.PI / 2; b.rotation.x = Math.PI / 2; holo.add(a, b); holo.userData.a = a; holo.userData.b = b;
    }
    // ---------- البيئة المفتوحة: تلال على الأفق، غيوم، نخيل وأعمدة بأعلام (بلونين فقط)
    const clouds = [];
    if (OPEN) {
        const hillMat = new T.MeshStandardMaterial({ color: '#8a7652', roughness: 1, flatShading: true }), hill2 = new T.MeshStandardMaterial({ color: '#3f6662', roughness: 1, flatShading: true });
        const R0 = rng(21), hg = new T.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
        for (let i = 0; i < 26; i++) { const a = (i / 26) * Math.PI * 2 + R0() * .2, rr = 120 + R0() * 60, m = new T.Mesh(hg, i % 3 ? hillMat : hill2); m.position.set(Math.cos(a) * rr, -2, Math.sin(a) * rr); m.scale.set(40 + R0() * 50, 14 + R0() * 26, 30 + R0() * 30); m.rotation.y = R0() * 3; sc.add(m); }
        const cg = new T.SphereGeometry(1, 10, 8), cm = new T.MeshStandardMaterial({ color: '#ffffff', roughness: 1, transparent: true, opacity: .9, fog: false, emissive: '#9aa59c', emissiveIntensity: .1 }); cm.color.set('#c9cfc6');
        for (let i = 0; i < 9; i++) { const g = new T.Group(); for (let k = 0; k < 5; k++) { const b = new T.Mesh(cg, cm); b.position.set(k * 5 - 10 + R0() * 3, R0() * 2, R0() * 4); b.scale.set(6 + R0() * 5, 3 + R0() * 2.5, 5 + R0() * 3); g.add(b); } g.position.set(-260 + i * 65 + R0() * 30, 70 + R0() * 40, -180 - R0() * 120); g.userData.v = .6 + R0() * .8; addDecor(g, i < 4 ? 0 : 1); clouds.push(g); }
        // نخيل منخفض البوليجون
        const trunkG = new T.CylinderGeometry(.35, .55, 9, 6); trunkG.translate(0, 4.5, 0); const leafG = new T.ConeGeometry(1.4, 6, 4); leafG.translate(0, 3, 0); leafG.rotateZ(Math.PI / 2.6);
        const trunkM = new T.MeshStandardMaterial({ color: '#b08a5a', roughness: .9, flatShading: true }), leafM = new T.MeshStandardMaterial({ color: '#2e6e70', roughness: .8, flatShading: true });
        const palms = new T.Group(); addDecor(palms, 1);
        for (let i = 0; i < 14; i++) { const a = Math.PI * .06 + i / 13 * Math.PI * .88, rr = 34 + (i % 3) * 7; /* خلف الهرم فقط */ const p = new T.Group(); p.position.set(Math.cos(a) * rr, 0, -Math.sin(a) * rr - 10); p.rotation.y = i * 1.3; const tr = new T.Mesh(trunkG, trunkM); tr.rotation.z = .08; tr.castShadow = true; p.add(tr); for (let k = 0; k < 6; k++) { const l = new T.Mesh(leafG, leafM); l.position.y = 9; l.rotation.y = k / 6 * Math.PI * 2; p.add(l); } p.scale.setScalar(.9 + (i % 4) * .15); palms.add(p); }
    }
    // خلفية المسرح: جدار صخري متماسك خلف الهرم (يملأ الفراغ ويثبّت العين على الهرم)
    const backdrop = new T.Group(); sc.add(backdrop);
    if (OPEN) {
        const rockA = new T.MeshStandardMaterial({ color: '#8a7550', roughness: 1, flatShading: true }), rockB = new T.MeshStandardMaterial({ color: '#7a6646', roughness: 1, flatShading: true }), band = new T.MeshStandardMaterial({ color: '#2e5f60', roughness: .9, flatShading: true });
        const R1 = rng(33), mg = new T.CylinderGeometry(1, 1.15, 1, 7);
        for (let i = 0; i < 15; i++) {
            const k = i / 14, a = Math.PI * (.12 + k * .76), rr = 46 + R1() * 10, h = 16 + R1() * 16 + Math.sin(k * Math.PI) * 10, w = 8 + R1() * 7;
            const x = Math.cos(a) * rr * 1.25, z = -Math.sin(a) * rr;
            const m = new T.Mesh(mg, i % 2 ? rockA : rockB); m.position.set(x, h / 2 - 1, z); m.scale.set(w, h, w * .8); m.rotation.y = R1() * 3; backdrop.add(m);
            const b = new T.Mesh(mg, band); b.position.set(x, h * (.45 + R1() * .25), z); b.scale.set(w * 1.02, .9, w * .82); b.rotation.y = m.rotation.y; backdrop.add(b);
        }
        const dg = new T.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), dm = new T.MeshStandardMaterial({ color: '#9c875f', roughness: 1, flatShading: true });
        for (let i = 0; i < 10; i++) { const a = Math.PI * (.1 + i / 9 * .8), rr = 36 + R1() * 6, m = new T.Mesh(dg, dm); m.position.set(Math.cos(a) * rr * 1.3, -.5, -Math.sin(a) * rr); m.scale.set(12 + R1() * 8, 3 + R1() * 3, 7 + R1() * 4); backdrop.add(m); }
    }
    // أعمدة صغيرة حول قاعدة الساحة (رملي + تيجان تركوازية)
    const orbs = new T.Group(); addDecor(orbs, 0);
    {
        const pg = new T.CylinderGeometry(.35, .5, 4, 8); pg.translate(0, 2, 0); const og = new T.SphereGeometry(.7, 12, 10);
        for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, rr = 46, x = Math.cos(a) * rr, z = Math.sin(a) * rr; if (z > 20) continue; const p = new T.Mesh(pg, darkMat); p.position.set(x, 0, z); orbs.add(p); const o = new T.Mesh(og, trimMat(i % 2 ? C.cyan : C.gold)); o.position.set(x, 4.6, z); orbs.add(o); }
    }

    // ================================================================ الهرم (درجات + دوائر)
    // هرم حقيقي: كل مرحلة صف واحد فيه كل الأرقام، والصف اللي فوقه أقصر وأعلى وأبعد خطوة.
    // مقاس الدوائر يتحدد مرة وحدة بداية المباراة حسب العدد (عشان صف 56 يدخل الشاشة)، وكل صف أضيق من اللي تحته.
    const R0 = .95; // نصف قطر جيومتري الدائرة الأصلي (الكل يتصغّر بـ K)
    let SP = 2.4, K = 1, R = R0, STEP_H = 1.3, PAD = 1.3, CS = 1; const GAP = 0;
    function setUnit(n0) { SP = Math.max(1.3, Math.min(2.4, 74 / Math.max(1, n0))); K = SP / 2.4; R = R0 * K; PAD = Math.max(.55, 1.1 * K); STEP_H = (R * 2 + PAD * 2) * .62; /* درجات عالية عشان يبان شكل الهرم */ CS = Math.max(.55, Math.min(1, K * 1.15)); }
    // أطلس الأرقام 1..64 (8×8)
    const atlas = canvasTex(2048, 2048, (g) => {
        g.clearRect(0, 0, 2048, 2048); g.textAlign = 'center'; g.textBaseline = 'middle';
        for (let k = 1; k <= 64; k++) {
            const i = k - 1, cx = (i % 8) * 256 + 128, cy = Math.floor(i / 8) * 256 + 128;
            const rg = g.createRadialGradient(cx, cy, 20, cx, cy, 124); rg.addColorStop(0, '#3a7d7f'); rg.addColorStop(1, '#2a6466'); g.fillStyle = rg; g.beginPath(); g.arc(cx, cy, 124, 0, Math.PI * 2); g.fill();
            g.strokeStyle = 'rgba(244,234,214,.45)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, 104, 0, Math.PI * 2); g.stroke();
            g.fillStyle = '#f7eedc'; g.font = `700 ${k > 9 ? 112 : 128}px ${FONT}`; g.shadowColor = 'rgba(23,56,57,.6)'; g.shadowBlur = 6;
            g.fillText(String(k), cx, cy + 34); g.shadowBlur = 0; // الرقم بالنصف الأمامي (الشخصية تقف بالنصف الخلفي)
        }
    });
    atlas.anisotropy = 8;
    const topMat = new T.MeshBasicMaterial({ map: atlas, transparent: true, toneMapped: false });
    topMat.onBeforeCompile = sh => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 aCell;').replace('#include <uv_vertex>', '#include <uv_vertex>\nvMapUv = vMapUv / 8.0 + aCell;'); };
    topMat.customProgramCacheKey = () => 'pyr-atlas';
    const baseGeo = new T.CylinderGeometry(R, R * 1.06, .34, 40); baseGeo.translate(0, .17, 0);
    const baseMat = new T.MeshStandardMaterial({ color: '#ffffff', roughness: .7, metalness: .1 });
    const ringGeoC = new T.TorusGeometry(R * .97, .06, 8, 56); ringGeoC.rotateX(Math.PI / 2);
    const ringMat = new T.MeshBasicMaterial({ color: '#ffffff', toneMapped: false });
    const haloMat = new T.MeshBasicMaterial({ map: glowTex, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false });
    const topGeoProto = new T.CircleGeometry(R * .86, 40); topGeoProto.rotateX(-Math.PI / 2);
    const haloGeo = new T.PlaneGeometry(R * 2.5, R * 2.5); haloGeo.rotateX(-Math.PI / 2);
    const slabMat = new T.MeshStandardMaterial({ color: '#e3cfa6', roughness: .9, metalness: 0 });
    const slabFrontTex = canvasTex(512, 128, (g, w, h) => { const lg = g.createLinearGradient(0, 0, 0, h); lg.addColorStop(0, '#e9d6b0'); lg.addColorStop(1, '#d6bf92'); g.fillStyle = lg; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(46,110,112,.85)'; g.fillRect(0, 0, w, 10); g.fillStyle = 'rgba(46,110,112,.18)'; for (let x = 20; x < w; x += 72) g.fillRect(x, 30, 32, h - 52); });
    slabFrontTex.wrapS = T.RepeatWrapping;
    const edgeMat = new T.MeshStandardMaterial({ color: TEAL, roughness: .6 });
    const edgeGoldMat = edgeMat;

    const levels = [];
    let aspect = 16 / 9;
    // عدد الأعمدة حسب العدد ونسبة الشاشة، وكل صف أضيق من اللي تحته (أو بنفس عرضه بالأقصى) عشان يبان هرم
    function layout(n, prev = levels[levels.length - 1]) {
        return { cols: n, lines: 1, w: n * SP + PAD * 2, d: R * 2 + PAD * 2 };
    }
    const _M = new T.Matrix4(), _Q = new T.Quaternion(), _E = new T.Euler(), _S = V(), _P = V();
    class Level {
        constructor(k, n) {
            this.k = k; this.n = n; const L = layout(n); Object.assign(this, L);
            const prev = levels[k - 1];
            this.yTop = .4 + (k + 1) * STEP_H;
            this.zFront = prev ? prev.zBack : 2;
            this.zBack = this.zFront - this.d;
            this.cz = (this.zFront + this.zBack) / 2;
            this.group = new T.Group(); sc.add(this.group);
            // المنصة (درجة الهرم) من الأرض لين سطحها
            const h = this.yTop;
            const slabGeo = new T.BoxGeometry(this.w, h, this.d); slabGeo.translate(0, h / 2, 0);
            this.slab = new T.Mesh(slabGeo, slabMat); this.slab.position.set(0, 0, this.cz); this.slab.receiveShadow = true; this.slab.castShadow = false; this.group.add(this.slab);
            const ft = slabFrontTex.clone(); ft.needsUpdate = true; ft.repeat.set(Math.max(1, this.w / 6), 1); this._ft = ft;
            this.front = new T.Mesh(new T.PlaneGeometry(this.w, h), new T.MeshStandardMaterial({ map: ft, emissiveMap: ft, emissive: '#000000', roughness: .9, metalness: 0 }));
            this.front.position.set(0, h / 2, this.zFront + .01); this.group.add(this.front);
            this.edge = new T.Mesh(new T.BoxGeometry(this.w + .1, .1, .1), k % 2 ? edgeGoldMat : edgeMat); this.edge.position.set(0, h + .02, this.zFront); this.group.add(this.edge);
            // مواقع الدوائر: 1 على يمين الشاشة (+X)، الصف الأمامي أول
            this.pos = []; let i = 0;
            for (let ln = 0; ln < this.lines; ln++) {
                const inLine = Math.min(this.cols, n - i);
                for (let c = 0; c < inLine; c++, i++) this.pos.push(V((inLine - 1) / 2 * SP - c * SP, this.yTop, this.zFront - PAD - R));
            }
            // InstancedMesh: القاعدة، الحلقة المضيئة، سطح الرقم، الهالة
            this.base = new T.InstancedMesh(baseGeo, baseMat, n); this.base.castShadow = true; this.base.receiveShadow = true;
            this.ring = new T.InstancedMesh(ringGeoC, ringMat, n);
            const tg = topGeoProto.clone(), cell = new Float32Array(n * 2);
            for (let j = 0; j < n; j++) { const q = j % 64; cell[j * 2] = (q % 8) / 8; cell[j * 2 + 1] = 1 - (Math.floor(q / 8) + 1) / 8; }
            tg.setAttribute('aCell', new T.InstancedBufferAttribute(cell, 2)); this.topGeo = tg;
            this.top = new T.InstancedMesh(tg, topMat, n);
            this.halo = new T.InstancedMesh(haloGeo, haloMat, n); this.halo.renderOrder = 1;
            for (const m of [this.base, this.ring, this.top, this.halo]) { m.frustumCulled = false; this.group.add(m); m.instanceMatrix.setUsage(T.DynamicDrawUsage); }
            // حالة كل دائرة
            this.st = this.pos.map((p, j) => ({ s: 0, y: 0, tilt: 0, tiltDir: 0, born: 0, mode: 'off', color: new T.Color(C.cyan), cur: new T.Color('#000'), halo: new T.Color('#000'), owner: null, flash: 0, gone: false }));
            this.rise = 0; this.alive = true; this.dirty = true;
        }
        stand(j) { const p = this.pos[j]; return V(p.x, this.yTop + .34 * K, p.z - .32 * K); }
        center() { return V(0, this.yTop, this.cz); }
        update(dt, t) {
            const n = this.n;
            this.slab.scale.y = Math.max(.001, easeOut(clamp01(this.rise))); this.front.scale.y = this.slab.scale.y; this.front.position.y = this.yTop * this.slab.scale.y / 2; this.edge.position.y = this.yTop * this.slab.scale.y + .02;
            for (let j = 0; j < n; j++) {
                const s = this.st[j], p = this.pos[j];
                // لون الحلقة والهالة حسب الحالة
                let ring, haloI = 0, haloC = s.color, base = '#e6d3ad';
                if (s.mode === 'off' || s.mode === 'idle') { const chase = isChoosing && this === activeLevel ? Math.max(0, Math.sin(t * 2.2 - j * .35)) : 0; ring = _c.set(this === activeLevel ? '#f4ead6' : '#cdb995').multiplyScalar(.85 + chase * .15); haloI = 0; haloC = C.cyan; }
                else if (s.mode === 'chosen') { ring = _c.copy(s.color); haloI = .12; base = '#f0e2c4'; }
                else if (s.mode === 'occupied') { ring = _c.copy(s.color).multiplyScalar(.9); haloI = .05; }
                else if (s.mode === 'spot') { ring = _c.set('#f2e8d7'); haloI = .3; haloC = C.gold; base = '#a18f78'; }
                else if (s.mode === 'doom') { const f = .5 + .5 * Math.sin(t * 4); ring = _c.set(C.red).multiplyScalar(.85 + f * .1); haloI = .22; haloC = C.red; base = '#d9a48c'; }
                else if (s.mode === 'win') { ring = _c.set(C.gold); haloI = .3; haloC = C.gold; base = '#a7967f'; }
                else { ring = _c.set('#cdb995'); }
                if (s.flash > 0) { s.flash = Math.max(0, s.flash - dt * 2.2); ring = ring.clone().lerp(_c.set('#ffffff'), s.flash * .5); haloI += s.flash * .3; }
                s.cur.lerp(ring, damp(dt, 10)); s.halo.lerp(_c.set(haloC).multiplyScalar(haloI), damp(dt, 8));
                this.ring.setColorAt(j, s.cur); this.halo.setColorAt(j, s.halo); this.base.setColorAt(j, _c.set(base));
                this.top.setColorAt(j, s.mode === 'doom' ? _c.set('#d3a697') : s.mode === 'gone' ? _c.set('#444') : _c.set('#ffffff'));
                // الظهور المتتابع (يكبر مع ارتداد) / السقوط / الغطس
                const sc0 = s.gone ? 0 : easeBack(clamp01(s.s));
                _E.set(s.tilt * Math.cos(s.tiltDir), 0, s.tilt * Math.sin(s.tiltDir)); _Q.setFromEuler(_E);
                _P.set(p.x, this.yTop * this.slab.scale.y + s.y, p.z); _S.set(sc0 * K, Math.max(.001, sc0 * K), sc0 * K);
                _M.compose(_P, _Q, _S); this.base.setMatrixAt(j, _M);
                _P.y += .33 * K; _M.compose(_P, _Q, _S); this.ring.setMatrixAt(j, _M);
                _P.y += .015 * K; _M.compose(_P, _Q, _S); this.top.setMatrixAt(j, _M);
                _P.y = this.yTop * this.slab.scale.y + s.y + .03; _S.setScalar(K * sc0 * (1 + (s.mode === 'spot' || s.mode === 'doom' ? .15 * Math.sin(t * 10) : 0))); _M.compose(_P, _Q, _S); this.halo.setMatrixAt(j, _M);
            }
            for (const m of [this.base, this.ring, this.top, this.halo]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
        }
        dispose() { this.group.removeFromParent(); this.slab.geometry.dispose(); this.front.geometry.dispose(); this.front.material.dispose(); this._ft.dispose(); this.edge.geometry.dispose(); this.topGeo.dispose(); for (const m of [this.base, this.ring, this.top, this.halo]) m.dispose(); }
    }
    let activeLevel = null, isChoosing = false;

    // ================================================================ الشخصيات
    // VRM (شخصيات المنصة) — ولو فشل التحميل (نت المذيع) نستخدم شخصية بسيطة مبنية بالكود
    let VRM = null;
    try {
        const [mod, rig3d] = await Promise.all([import('../../js/agp-vrm-characters.js'), import('../birthday-party/rig3d.js')]);
        rig3d.loadClips(new URL('../birthday-party/anims/', import.meta.url).href).catch(() => { });
        const models = await Promise.race([mod.loadModels(), wait(20).then(() => null)]);
        if (models) VRM = { make: mod.makeVrmRig, models, K: rig3d.POSE_KIT };
    } catch (e) { console.warn('[pyramid] VRM unavailable, using fallback figures', e); }

    // وضعيات إضافية فوق حركة الوقوف (الجزء العلوي من الجسم) — POSE_KIT: arm(P, sd, عضد, ساعد) sd=1 يسار
    const UPPER = ['Spine', 'Spine1', 'Spine2', 'Neck', 'Head', 'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand'];
    const POSES = VRM ? (() => {
        const { arm, euler, wave } = VRM.K;
        return {
            hips: (t, P) => { for (const sd of [1, -1]) arm(P, sd, [.8, -.5, -.12], [-.75, -.35, .2]); euler(P, 'Spine', 0, 0, Math.sin(t * .9) * .03); },
            cross: (t, P) => { arm(P, 1, [.32, -.8, .5], [-.95, .05, .2]); arm(P, -1, [.3, -.82, .45], [-.95, .12, .26]); euler(P, 'Head', .04, Math.sin(t * .5) * .1, 0); },
            think: (t, P) => { arm(P, -1, [.25, -.7, .65], [-.2, .95, .25]); arm(P, 1, [.3, -.85, .45], [-.95, .05, .3]); euler(P, 'Head', .12, -.12, .08 + Math.sin(t * .7) * .03); },
            clasp: (t, P) => { for (const sd of [1, -1]) arm(P, sd, [.18, -.85, .45], [-.55, .05, .85]); euler(P, 'Spine', .06, 0, Math.sin(t * 2.2) * .025); euler(P, 'Head', .16, Math.sin(t * 1.3) * .08, 0); },
            shock: (t, P) => { for (const sd of [1, -1]) arm(P, sd, [.7, .55, .35], [-.55, .65, -.15]); euler(P, 'Spine', -.08, 0, 0); euler(P, 'Head', -.12, 0, Math.sin(t * 9) * .05); },
            sad: (t, P) => { for (const sd of [1, -1]) arm(P, sd, [.12, -1, .18], [.02, -1, .3]); euler(P, 'Spine', .22, 0, 0); euler(P, 'Spine1', .1, 0, 0); euler(P, 'Head', .45, Math.sin(t * .6) * .1, 0); },
            cheer: (t, P) => { const b = Math.abs(wave(t, 1.6)); for (const sd of [1, -1]) arm(P, sd, [.3, .9 + b * .2, .15], [.08, 1, .05 - b * .2]); euler(P, 'Head', -.15, 0, 0); euler(P, 'Spine', -.06 * b, 0, 0); },
            talk: (t, P) => { arm(P, 1, [.2, -1, .1], [.1, -1, .25]); const g = wave(t, .7); arm(P, -1, [.35, -.7, .55], [.1 + g * .2, .25 + g * .25, 1]); euler(P, 'Head', .02, 0, Math.sin(t * 2.4) * .06); },
            stretch: (t, P) => { const k = clamp01(Math.sin(Math.min(t, 2.4) / 2.4 * Math.PI)); for (const sd of [1, -1]) arm(P, sd, [.2 + .1 * (1 - k), lerp(-1, 1, k), .05], [-.1 * k, lerp(-1, 1, k), 0]); euler(P, 'Spine', -.12 * k, 0, 0); euler(P, 'Head', -.2 * k, 0, 0); },
            point: (t, P) => { arm(P, -1, [.2, .1, 1], [.1, .15, 1]); arm(P, 1, [.2, -1, .1], [.1, -1, .25]); },
        };
    })() : {};
    const POSE_CACHE = VRM ? VRM.K.newPose() : null;

    // شخصية احتياطية (بدون VRM): جسم كبسولة + راس، بنفس الواجهة المختصرة
    function fallbackRig(color) {
        const root = new T.Group();
        const body = new T.Mesh(new T.CapsuleGeometry(.28, .7, 4, 10), new T.MeshStandardMaterial({ color, roughness: .5 })); body.position.y = .75; body.castShadow = true; root.add(body);
        const head = new T.Mesh(new T.SphereGeometry(.24, 16, 12), new T.MeshStandardMaterial({ color: '#ebe1cf', roughness: .6 })); head.position.y = 1.42; head.castShadow = true; root.add(head);
        let a = 0, tt = 0;
        return { root, bones: null, vrm: false, play(x) { a = x; }, update(dt) { tt += dt; const j = a === 6 || a === 'win' ? Math.abs(Math.sin(tt * 6)) * .35 : a === 1 ? Math.abs(Math.sin(tt * 9)) * .06 : Math.sin(tt * 2) * .015; body.position.y = .75 + j; head.position.y = 1.42 + j; head.rotation.y = a === 'look' ? Math.sin(tt) * .5 : 0; },
            sync() { }, mood() { }, express() { }, setSpeed() { }, dispose() { root.removeFromParent(); body.geometry.dispose(); body.material.dispose(); head.geometry.dispose(); head.material.dispose(); } };
    }

    // لوحة الاسم فوق الراس (كانفس → Sprite): نقطة بلون اللاعب + الاسم
    function plateTex(name, color) {
        return canvasTex(512, 128, (g, w, h) => {
            g.font = `700 54px ${FONT}`; g.direction = 'rtl'; const tw = Math.min(w - 120, g.measureText(name).width), pw = tw + 110, x0 = (w - pw) / 2;
            g.fillStyle = 'rgba(29,74,76,.86)'; g.beginPath(); g.roundRect(x0, 18, pw, 92, 46); g.fill(); g.strokeStyle = SAND; g.lineWidth = 4; g.stroke();
            g.fillStyle = color; g.beginPath(); g.arc(x0 + pw - 46, 64, 22, 0, Math.PI * 2); g.fill();
            g.fillStyle = '#f7eedc'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name, x0 + (pw - 70) / 2 + 8, 66, w - 130);
        });
    }

    // سلوكيات الانتظار: [اسم، وزن]. كل سلوك = حركة أساسية (play) + وضعية فوقها + ملامح + مدة
    const BEH = {
        idle: { clip: 0, d: [3, 6] }, look: { clip: 0, look: true, d: [2, 4] }, hips: { clip: 0, pose: 'hips', d: [3, 6] }, cross: { clip: 0, pose: 'cross', d: [3, 6] },
        think: { clip: 0, pose: 'think', face: 'focus', d: [2.5, 5] }, clasp: { clip: 0, pose: 'clasp', face: 'scared', d: [2.5, 5] }, talk: { clip: 0, pose: 'talk', social: true, face: 'laugh', d: [2.5, 4.5] },
        stretch: { clip: 0, pose: 'stretch', d: [2.6, 2.8] }, wave: { clip: 3, face: 'laugh', d: [2, 3] }, sway: { clip: 8, d: [3, 5] },
        clap: { clip: 4, face: 'laugh', d: [1.6, 3] }, jump: { clip: 6, face: 'laugh', d: [1, 2] }, cheer: { clip: 0, pose: 'cheer', face: 'laugh', d: [1.6, 3] }, heart: { clip: 7, face: 'laugh', d: [2, 3] }, samba: { clip: 2, face: 'laugh', d: [2, 3.5] },
        shock: { clip: 0, pose: 'shock', face: 'scared', d: [1.2, 2] }, sad: { clip: 0, pose: 'sad', face: 'sad', d: [2, 3] }, win: { clip: 'win', face: 'laugh', d: [99, 99] },
    };
    const MOOD_SETS = {
        calm: [['idle', 4], ['look', 3], ['hips', 2], ['cross', 2], ['talk', 2.5], ['wave', 1], ['sway', 1], ['stretch', .6]],
        choose: [['idle', 3], ['look', 3], ['think', 3], ['cross', 1.5], ['hips', 1], ['clasp', 1], ['talk', .6]],
        tense: [['clasp', 4], ['look', 2], ['think', 2], ['idle', 1]],
        happy: [['clap', 3], ['jump', 2], ['cheer', 3], ['heart', 1], ['samba', 1], ['wave', 1.5], ['talk', 1]],
        still: [['idle', 1]],
    };
    const pickW = (set, rnd) => { let s = 0; for (const [, w] of set) s += w; let x = rnd() * s; for (const [k, w] of set) { if ((x -= w) <= 0) return k; } return set[0][0]; };

    const actors = new Map();
    let frame = 0;
    class Actor {
        constructor(p, idx) {
            this.id = String(p.id); this.name = p.name || '—'; this.color = colorOf(this.id); this.rnd = rng(hash(this.id) ^ 0x9e37); this.idx = idx;
            const g = p.character === 'boy' ? 1 : p.character === 'girl' ? 0 : (hash(this.id) >> 3) % 2;
            this.group = new T.Group(); sc.add(this.group);
            this.rig = VRM ? VRM.make(g ? VRM.models.boy : VRM.models.girl, { n: hash(this.id) % 997 }) : fallbackRig(this.color);
            if (VRM) this.rig.root.traverse(o => { if (o.isMesh) o.castShadow = true; });
            this.group.add(this.rig.root);
            this.plateT = plateTex(this.name, this.color);
            this.plate = new T.Sprite(new T.SpriteMaterial({ map: this.plateT, transparent: true, depthWrite: false, toneMapped: false, fog: false })); this.plate.scale.set(1.9, .475, 1); this.plate.position.y = 2.1; this.plate.renderOrder = 5; this.group.add(this.plate);
            this.pos = V(); this.yaw = 0; this.yawT = 0; this.path = null; this.state = 'idle'; this.moodSet = 'calm';
            this.beh = 'idle'; this.behUntil = 0; this.ov = null; this.ovW = 0; this.ovT = 0; this.lookAt = null; this.headY = 0; this.headX = 0; this.acc = 0; this.extraY = 0; this.spinY = 0; this.scale = 1; this.dead = false;
            this.group.scale.setScalar(.001); this.appear = 0;
        }
        place(v, yaw = 0) { this.pos.copy(v); this.yaw = this.yawT = yaw; this.path = null; }
        // مشي لنقطة بزمن ثابت (الوقت الحقيقي) — النتيجة ما تعتمد على سرعة الجهاز
        walkTo(v, delay = 0, speed = 2.6) {
            const from = this.pos.clone(), dist = Math.hypot(v.x - from.x, v.z - from.z), dur = Math.max(.9, Math.min(4.2, dist / speed));
            this.path = { from, to: v.clone(), t0: now() + delay, dur, climb: v.y - from.y };
            return delay + dur;
        }
        setMood(m, force) { if (this.dead) return; this.moodSet = m; if (force) this.behUntil = 0; }
        doBeh(name, dur) {
            const b = BEH[name] || BEH.idle; this.beh = name;
            this.behUntil = now() + (dur || lerp(b.d[0], b.d[1], this.rnd()));
            this.rig.play(b.clip); this.ov = b.pose || null; this.ovT = 0;
            if (this.rig.mood) this.rig.mood(b.face || (this.moodSet === 'tense' ? 'focus' : 'smile'));
            this.lookAt = null; this.yawT = this.homeYaw ?? 0;
            if (b.look) { const a = (this.rnd() - .5) * 2.2; this.lookAt = V(this.pos.x + Math.sin(a) * 10, this.pos.y + 1.6 + (this.rnd() - .3) * 4, this.pos.z + Math.cos(a) * 10); }
            if (b.social) { // يلتفت لأقرب جار، والجار يرد النظرة
                let best = null, bd = 9; for (const o of actors.values()) { if (o === this || o.dead || o.path) continue; const d = o.pos.distanceTo(this.pos); if (d < bd) { bd = d; best = o; } }
                if (best) { this.yawT = Math.atan2(best.pos.x - this.pos.x, best.pos.z - this.pos.z) * .6; this.lookAt = best.pos.clone().setY(best.pos.y + 1.5); if (best.beh === 'idle' || best.beh === 'look') { best.lookAt = this.pos.clone().setY(this.pos.y + 1.5); best.behUntil = Math.max(best.behUntil, now() + 2); } }
                else { this.ov = 'hips'; }
            }
        }
        update(dt, t) {
            if (this.appear < 1) { this.appear = Math.min(1, this.appear + dt * 1.6); this.group.scale.setScalar(Math.max(.001, easeBack(this.appear)) * this.scale); }
            else this.group.scale.setScalar(this.scale);
            // المشي
            if (this.path) {
                const P = this.path, k = (now() - P.t0) / P.dur;
                if (k >= 0) {
                    if (this.state !== 'walk') { this.state = 'walk'; this.rig.play(1); this.ov = null; this.lookAt = null; if (this.rig.setSpeed) this.rig.setSpeed(2.4); }
                    const kk = clamp01(k), e = kk < .12 ? kk * kk / .24 : kk > .88 ? 1 - (1 - kk) * (1 - kk) / .24 : kk - .06; // تسارع وتباطؤ ناعم
                    const ke = clamp01(e / .88 * .88 + (kk > .88 ? 0 : 0));
                    this.pos.x = lerp(P.from.x, P.to.x, ke); this.pos.z = lerp(P.from.z, P.to.z, ke);
                    // الصعود: يرتفع تدريجياً مع قفزة خفيفة عند الدرجة
                    const climbK = clamp01((ke - .3) / .5); this.pos.y = P.from.y + P.climb * (climbK * climbK * (3 - 2 * climbK)) + (P.climb > .2 ? Math.sin(Math.PI * climbK) * .35 : 0);
                    const dx = P.to.x - P.from.x, dz = P.to.z - P.from.z; if (Math.hypot(dx, dz) > .05 && kk < .95) this.yawT = Math.atan2(dx, dz);
                    if (kk >= 1) { this.path = null; this.state = 'idle'; this.pos.copy(P.to); this.yawT = this.homeYaw ?? 0; this.behUntil = 0; }
                }
            } else if (!this.dead && now() > this.behUntil && this.moodSet !== 'locked') this.doBeh(pickW(MOOD_SETS[this.moodSet] || MOOD_SETS.calm, this.rnd));
            this.yaw = lerpAng(this.yaw, this.yawT, damp(dt, 6));
            this.group.position.set(this.pos.x, this.pos.y + this.extraY, this.pos.z); this.group.rotation.set(0, this.yaw + this.spinY, 0);
            // تحديث الهيكل (يُخفّف بالجودة المنخفضة: كل إطارين، موزّع على الشخصيات)
            this.acc += dt;
            const skip = this.state === 'walk' || this.near ? 1 : cfg.rigSkip;
            if ((frame + this.idx) % skip !== 0) return;
            const d = this.acc; this.acc = 0;
            this.rig.update(d);
            if (this.rig.bones && VRM) this.overlay(d, t);
            this.rig.sync();
        }
        overlay(dt, t) {
            const want = this.ov && POSES[this.ov] ? 1 : 0; this.ovW = lerp(this.ovW, want, damp(dt, 5)); this.ovT += dt;
            const B = this.rig.bones;
            if (this.ovW > .01 && (this.ov || this._lastOv)) {
                const name = this.ov || this._lastOv; this._lastOv = name;
                const P = POSE_CACHE; for (const b in P.q) P.q[b].identity(); POSES[name](this.ovT, P);
                for (const b of UPPER) if (B[b] && P.q[b]) B[b].quaternion.slerp(P.q[b], this.ovW);
            }
            // التفات الراس (للنظر حول المكان أو للجار أو للحدث)
            let hy = 0, hx = 0;
            if (this.lookAt) { const dx = this.lookAt.x - this.pos.x, dz = this.lookAt.z - this.pos.z, dy = this.lookAt.y - (this.pos.y + 1.5); hy = Math.max(-.9, Math.min(.9, lerpAng(0, Math.atan2(dx, dz) - this.yaw, 1))); hx = Math.max(-.4, Math.min(.5, -Math.atan2(dy, Math.hypot(dx, dz)))); }
            this.headY = lerp(this.headY, hy, damp(dt, 4)); this.headX = lerp(this.headX, hx, damp(dt, 4));
            if (Math.abs(this.headY) + Math.abs(this.headX) > .005 && B.Head) { _E.set(this.headX * .6, this.headY * .6, 0, 'YXZ'); B.Head.quaternion.multiply(_Q.setFromEuler(_E)); if (B.Neck) { _E.set(this.headX * .4, this.headY * .4, 0, 'YXZ'); B.Neck.quaternion.multiply(_Q.setFromEuler(_E)); } }
        }
        dispose() { this.rig.dispose && this.rig.dispose(); this.group.removeFromParent(); this.plateT.dispose(); this.plate.material.dispose(); }
    }

    // مواقع الانتظار بالساحة قبل أول مرحلة: صفوف قوس أمام الهرم، والكل يطالع الكاميرا
    function plazaSpot(i, n) {
        const per = n <= 12 ? n : Math.ceil(Math.sqrt(n * 3.2)), row = Math.floor(i / per), col = i % per, inRow = Math.min(per, n - row * per);
        const sp = 1.45, rr = 26 + row * 2.2, ang = ((inRow - 1) / 2 - col) * sp / rr;
        return V(Math.sin(ang) * rr, 0, 6 + (rr - Math.cos(ang) * rr) * .9 + row * 2.2 - 20 + 20);
    }
    function setPlayers(list) {
        const ids = new Set(list.map(p => String(p.id)));
        for (const [id, a] of actors) if (!ids.has(id)) { sparks.emit(a.pos.clone().setY(1), { count: 24, color: [C.violet, C.cyan], speed: 3, life: .8 }); a.dispose(); actors.delete(id); }
        list.forEach((p, i) => {
            let a = actors.get(String(p.id)), fresh = false;
            if (!a) { a = new Actor(p, i); actors.set(a.id, a); fresh = true; }
            a.idx = i; const v = plazaSpot(i, list.length);
            if (fresh) { a.place(v, 0); a.homeYaw = 0; pulse(v.clone().setY(.05), a.color, .2, 1.6, .7); sparks.emit(v.clone().setY(1.6), { count: 16, color: [a.color, '#ffffff'], speed: 2.4, up: 1, life: .9 }); emit('join'); }
            else if (!a.path && a.pos.distanceTo(v) > .05 && !a.dead) a.walkTo(v, 0, 3);
        });
    }

    // ================================================================ المخرج (الكاميرا)
    const camS = { pos: cam.position.clone(), look: V(0, 0, -6), fov: 42 };
    let shot = null; // دالة t → {pos, look, fov, rate}
    let shotT0 = now();
    function setShot(fn) { shot = fn; shotT0 = now(); }
    // إطار يحتوي مجموعة نقاط من زاوية (yaw, pitch) — يحسب المسافة حسب نسبة الشاشة
    function frameBox(pts, pitch = .72, yaw = 0, margin = 1.0) {
        const b = new T.Box3(); pts.forEach(p => b.expandByPoint(p)); const c = b.getCenter(V()), s = b.getSize(V());
        const vf = cam.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
        const halfW = s.x / 2 * margin + .5, halfH = (s.z / 2 * Math.sin(pitch) + s.y / 2 * Math.cos(pitch)) * margin + .8;
        const d = Math.max(halfW / Math.tan(hf / 2), halfH / Math.tan(vf / 2)) + s.z / 2 * Math.cos(pitch) * .5;
        const dir = V(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
        return { look: c, pos: c.clone().addScaledVector(dir, Math.max(9, d)) };
    }
    function levelPts(L, extra = []) { if (!L) return extra; const p = [V(-L.w / 2, L.yTop, L.zFront), V(L.w / 2, L.yTop, L.zFront), V(-L.w / 2, L.yTop + 1.8, L.zBack), V(L.w / 2, L.yTop + 1.8, L.zBack)]; return p.concat(extra); }
    // كل صفوف الهرم الظاهرة (من القاعدة للقمة) — اللقطة الرئيسية تعرض الهرم كامل
    function pyramidPts(extra = []) { let p = extra.slice(); const vis = levels.filter(L => L.group.visible && L.alive).slice(-3); for (const L of vis) p = levelPts(L, p); return p; }
    function actorPts() { const p = []; for (const a of actors.values()) if (!a.dead) p.push(a.pos.clone(), a.pos.clone().setY(a.pos.y + 1.9)); return p; }
    const drift = t => REDUCED ? V() : V(Math.sin(t * .23) * .35, Math.sin(t * .31) * .18, Math.cos(t * .19) * .25);
    function oblique(pts, pitch = .72, rate = 1.6, swing = .07) {
        const F0 = frameBox(pts, pitch, 0);
        return t => { const yaw = REDUCED ? 0 : Math.sin(t * .11) * swing; const F = swing ? frameBox(pts, pitch, yaw) : F0; return { pos: F.pos.add(drift(t)), look: F.look, rate }; };
    }
    function close(point, dist = 7, pitch = .45, yaw = .25, rate = 2.4) { return t => { const dir = V(Math.sin(yaw + t * .03) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw + t * .03) * Math.cos(pitch)); return { pos: point.clone().addScaledVector(dir, dist).add(drift(t).multiplyScalar(.3)), look: point.clone(), rate }; }; }
    function tween(A, B, dur, curve = ease) { return t => { const k = curve(clamp01(t / dur)), a = A(t), b = B(t); return { pos: a.pos.lerp(b.pos, k), look: a.look.lerp(b.look, k), fov: lerp(a.fov || 42, b.fov || 42, k), rate: 12 }; }; }
    function tickCam(dt, t) {
        if (!shot) return; const s = shot(now() - shotT0), k = damp(dt, s.rate || 2);
        camS.pos.lerp(s.pos, k); camS.look.lerp(s.look, k); camS.fov = lerp(camS.fov, s.fov || 42, k);
        cam.position.copy(camS.pos); cam.lookAt(camS.look); if (Math.abs(cam.fov - camS.fov) > .01) { cam.fov = camS.fov; cam.updateProjectionMatrix(); }
        // الظل يتبع مكان الحدث
        key.target.position.copy(camS.look); key.position.copy(camS.look).add(V(18, 34, 26));
    }
    const mainShot = () => oblique(pyramidPts(actorPts()), .5, 1.4);
    // لقطة اللوبي: الكاميرا تتابع اللاعبين بالساحة (تكبر مع عددهم) وتتمايل ببطء
    const lobbyShot = () => t => { const pts = actorPts(); if (pts.length < 2) pts.push(V(-6, 0, 6), V(6, 0, 6)); pts.push(V(0, 3, -6)); const F = frameBox(pts, .36, REDUCED ? 0 : Math.sin(t * .09) * .22, 1.25); return { pos: F.pos.add(drift(t)), look: F.look.add(V(0, .6, 0)), rate: 1.1 }; };

    // ================================================================ الحلقة
    const pickTags = new Map(); // رقم الدائرة ← Sprite
    const tagsOut = new Set();
    const clock = new T.Clock(); let raf = 0, running = true, tAll = 0, champFx = null;
    // حاكم الجودة: يقيس الإطارات/ث كل ثانية (يتجاهل الإطارات الشاذة والتبويب المخفي)
    const gov = { acc: 0, frames: 0, slow: 0, fast: 0, cool: 3, dts: [], refresh: 60, banned: new Set(), lastUpAt: -99, fps: 0 };
    function governor(raw) {
        if (raw > .25 || document.hidden) return;
        gov.acc += raw; gov.frames++; if (gov.dts.length < 120) gov.dts.push(raw);
        if (gov.acc < 1) return;
        const fps = gov.frames / gov.acc; gov.fps = fps; gov.acc = 0; gov.frames = 0;
        if (gov.dts.length >= 60 && !gov.refreshSet) { const s = gov.dts.slice().sort((a, b) => a - b), q = s[Math.floor(s.length * .1)]; gov.refresh = Math.max(30, Math.min(240, 1 / q)); gov.refreshSet = true; }
        const target = Math.min(60, gov.refresh);
        if (mode !== 'auto') { // اليدوي ثابت، و«قوية» بس تحمي الاستقرار بتنزيل الدقة لو صار ثقيل جداً
            if (mode === 'high') { const pr = r.getPixelRatio(); if (fps < target * .5 && pr > 1) r.setPixelRatio(Math.max(1, pr - .25)); }
            return;
        }
        if (gov.cool > 0) { gov.cool--; return; }
        gov.slow = fps < target * .78 ? gov.slow + 1 : 0;
        gov.fast = fps >= target * .95 ? gov.fast + 1 : 0;
        if (gov.slow >= 3 && ladderIdx < LADDER.length - 1) {
            if (tAll - gov.lastUpAt < 8) gov.banned.add(ladderIdx); // الصعود الأخير ما نجح: لا نعيده
            ladderIdx++; gov.slow = 0; gov.cool = 3; applyTier('خفّضنا التفاصيل للحفاظ على السلاسة');
        } else if (gov.fast >= 10 && ladderIdx > probe.ceilIdx && !gov.banned.has(ladderIdx - 1)) {
            ladderIdx--; gov.fast = 0; gov.cool = 4; gov.lastUpAt = tAll; applyTier('الجهاز يتحمّل، رفعنا التفاصيل');
        }
    }
    function applyTier(reason) {
        const st = cur(); cfg = TIERS[st.tier];
        r.setPixelRatio(Math.min(devicePixelRatio || 1, cfg.prMax) * st.prK);
        const sh = cfg.shadow > 0; key.castShadow = sh;
        if (sh && key.shadow.mapSize.x !== cfg.shadow) { key.shadow.mapSize.set(cfg.shadow, cfg.shadow); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
        r.shadowMap.type = cfg.shadow >= 2048 ? T.PCFSoftShadowMap : T.PCFShadowMap;
        decor.forEach(o => { o.visible = cfg.decor >= o.userData.lvl; });
        crowd.count = Math.floor(crowd.userData.max * cfg.crowd);
        sparks.cap = cfg.particles; confetti.cap = Math.round(cfg.particles * .4);
        beams.forEach((b, i) => { b.cone.visible = i < cfg.beams; });
        stars.geometry.setDrawRange(0, Math.floor(STAR_N * cfg.stars));
        onQuality(qualityInfo(reason));
    }
    function qualityInfo(reason) { const st = cur(); return { mode, tier: st.tier, label: TIERS[st.tier].label, reduced: st.prK < 1, fps: Math.round(gov.fps || 0), gpu: probe.renderer, reason: reason || '' }; }

    let lastScreen = 0;
    function loop() {
        if (!running) return; raf = requestAnimationFrame(loop);
        const raw = clock.getDelta(), dt = Math.min(raw, .05); tAll += dt; frame++; const t = tAll;
        governor(raw);
        tickMood(dt, t);
        crowdU.uTime.value = t;
        // حزم الضوء تمسح الساحة
        beams.forEach((b, i) => { b.pivot.rotation.set(-.55 + Math.sin(t * .4 + b.ph) * .28, b.a0 + Math.sin(t * .27 + b.ph) * .6, 0); b.cone.material.opacity = .05 * moodNow.beam; b.cone.material.color.set(C.lav); });
        { const top = activeLevel; const bz = top ? Math.min(0, top.zBack + 8) : 0, by = top ? Math.max(0, top.yTop - 4) : 0; backdrop.position.z = lerp(backdrop.position.z, bz, damp(dt, .8)); backdrop.position.y = lerp(backdrop.position.y, by * .5, damp(dt, .8)); }
        clouds.forEach(g => { if (!g.visible) return; g.position.x += g.userData.v * dt; if (g.position.x > 320) g.position.x = -320; });
        bunting.forEach(g => { g.rotation.y = Math.sin(t * .5) * .004; g.position.y = Math.sin(t * 1.3) * .15; });
        if (lanterns.visible) { const D = lanterns.userData.data; D.forEach((d, i) => { d.y += d.v * dt; if (d.y > 80) d.y = -2; _P.set(d.x + Math.sin(t * .4 + d.ph) * 1.5, d.y, d.z + Math.cos(t * .3 + d.ph)); _M.compose(_P, _Q.identity(), _S.setScalar(clamp01(d.y / 4) * clamp01((80 - d.y) / 10))); lanterns.setMatrixAt(i, _M); }); lanterns.instanceMatrix.needsUpdate = true; }
        if (holo.visible) { const top = levels.length ? levels[levels.length - 1] : null; const hy = top ? top.yTop + 9 : 12, hz = top ? top.cz : -6; holo.position.lerp(_P.set(0, hy, hz), damp(dt, 1)); holo.userData.a.rotation.z = t * .2; holo.userData.b.rotation.z = -t * .14; holo.userData.a.rotation.x = Math.PI / 2 + Math.sin(t * .3) * .12; }
        if (t - lastScreen > (cfg.decor >= 1 ? .1 : .3)) { lastScreen = t; drawScreen(t); }
        // الموجات الضوئية تمر عبر الأرضية من وقت لآخر (بألوان متغيرة)
        if (frame % 240 === 0) pulse(V(0, .04, activeLevel ? activeLevel.cz + 4 : -4), C.purple, 2, 70, 5, .08);
        for (const L of levels) if (L.alive && L.group.visible) L.update(dt, t);
        for (const a of actors.values()) a.update(dt, t);
        tickTags(t); tickPulses(dt); sparks.update(dt, t); confetti.update(dt, t); sparks.pts.material.uniforms.scale.value = confetti.pts.material.uniforms.scale.value = r.domElement.height * .6;
        if (champFx) champFx(dt, t);
        tickCam(dt, t);
        r.render(sc, cam);
    }
    const ro = new ResizeObserver(() => { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; r.setSize(w, h, false); aspect = w / h; cam.aspect = aspect; cam.updateProjectionMatrix(); });
    ro.observe(el);
    { const w = el.clientWidth || innerWidth, h = el.clientHeight || innerHeight; r.setSize(w, h, false); aspect = w / h; cam.aspect = aspect; cam.updateProjectionMatrix(); }
    const onVis = () => { if (document.hidden) { cancelAnimationFrame(raf); raf = 0; } else if (running && !raf) { clock.getDelta(); loop(); } };
    document.addEventListener('visibilitychange', onVis);
    applyTier(mode === 'auto' ? (probe.software ? 'رسوم برمجية: بدأنا بالمنخفضة' : 'بدأنا بالمتوازنة ونقيس أداء جهازك') : '');
    setShot(lobbyShot());
    loop();

    // ================================================================ أحداث اللعبة
    function screen(a, b) { screenLines = [a || '', b || '']; }
    function buildLevel(n, stagger = .045) {
        const L = new Level(levels.length, n); levels.push(L); activeLevel = L;
        // المنصة ترتفع ثم الدوائر تظهر بالتتابع من المنتصف للأطراف
        const t0 = now(); const riseDur = .8;
        const tick = () => { L.rise = (now() - t0) / riseDur; if (L.rise < 1) requestAnimationFrame(tick); else L.rise = 1; }; tick();
        emit('rise');
        const order = L.pos.map((p, j) => [j, Math.abs(p.x) + (L.zFront - p.z) * .6]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
        const per = Math.min(stagger, 1.6 / n);
        order.forEach((j, q) => setTimeout(() => {
            const s = L.st[j]; s.mode = 'idle'; s.flash = 1; const t1 = now();
            const grow = () => { s.s = (now() - t1) / .45; if (s.s < 1) requestAnimationFrame(grow); else s.s = 1; }; grow();
            if (q % Math.max(1, Math.round(n / 14)) === 0) { emit('build', q / n); sparks.emit(L.pos[j].clone().setY(L.yTop + .5), { count: 6, color: [C.cyan, C.violet, '#ffffff'], speed: 2, up: 2, life: .6, size: .2 }); }
        }, (riseDur * 1000) + q * per * 1000));
        // الدرجات القديمة البعيدة تختفي (أداء)
        levels.forEach(o => { o.group.visible = L.k - o.k <= 6; });
        return riseDur + n * per + .5;
    }
    async function startMatch(n, o = {}) {
        champFx = null; setMood('calm'); screen('الهرم', n + ' لاعب');
        setUnit(n); for (const a of actors.values()) { a.baseScale = CS; a.scale = CS; }
        const dur = buildLevel(n, o.short ? .03 : .05);
        // لقطة التقديم: واسعة من فوق تعرض الهرم كامل ← تنزل بهدوء لزاوية مائلة
        const L = activeLevel, all = levelPts(L, actorPts());
        const top = () => { const F = frameBox(all, 1.42, 0, 1.25); return { pos: F.pos, look: F.look, fov: 40 }; };
        const tilt = () => { const F = frameBox(all, .7, 0); return { pos: F.pos, look: F.look, fov: 42 }; };
        camS.pos.copy(top().pos.add(V(0, 12, 0))); camS.look.copy(top().look); cam.position.copy(camS.pos);
        setShot(t => ({ ...top(), rate: 2 }));
        emit('intro');
        const hold = o.short ? 1 : Math.max(2, dur * .6);
        await wait(hold);
        const d2 = o.short ? 2.4 : 4.2;
        setShot(tween(top, tilt, d2)); emit('sweep');
        await wait(Math.max(d2, dur - hold) + .2);
        for (const a of actors.values()) a.setMood('calm');
        setShot(mainShot());
    }
    function choosing(on, round) {
        isChoosing = on; urgency = 0;
        if (on) { setMood('choose'); for (const a of actors.values()) a.setMood('choose'); setShot(oblique(pyramidPts(actorPts()), .52, 1.2, .06)); screen('اختر رقمك', 'المرحلة ' + (round || 1)); pulse(activeLevel.center().setY(activeLevel.yTop + .1), C.cyan, 1, activeLevel.w * .8, 1.6, .7); }
    }
    function setUrgency(k) { urgency = clamp01(k); if (k > .6) for (const a of actors.values()) if (a.moodSet === 'choose' && a.rnd() < .02) a.setMood('tense'); }
    // اختيار رقم: الدائرة تتلوّن بلون اللاعب + موجة ضوء + شرار، والقديمة ترجع
    // اسم اللاعب يطلع فوق الدائرة اللي اختارها (بدل قائمة جانبية) — يكبر بارتداد ويتمايل خفيف لين يوصل صاحبه
    function tickTags(t) {
        for (const [, sp] of pickTags) { const k = clamp01((now() - sp.userData.t0) / .4), sc0 = easeBack(k) * sp.userData.s; sp.scale.set(sc0 * 4, sc0, 1); sp.position.y = sp.userData.y + Math.sin(t * 2 + sp.userData.ph) * .06 * K; }
        for (const sp of [...tagsOut]) { const k = clamp01((now() - sp.userData.out) / .3); sp.material.opacity = 1 - k; sp.position.y += .02; if (k >= 1) { tagsOut.delete(sp); sc.remove(sp); sp.material.dispose(); } }
    }
    function pick(id, num, prev) {
        const L = activeLevel, a = actors.get(String(id)); if (!L) return;
        if (prev != null && L.st[prev - 1]) { const s = L.st[prev - 1]; s.mode = 'idle'; s.owner = null; const t = pickTags.get(prev); if (t) { pickTags.delete(prev); t.userData.out = now(); tagsOut.add(t); } }
        if (num == null) return; const s = L.st[num - 1]; if (!s) return;
        s.mode = 'chosen'; s.owner = String(id); s.color.set(a ? a.color : C.cyan); s.flash = 1;
        const p = L.pos[num - 1].clone().setY(L.yTop + .4);
        pulse(p.clone().setY(L.yTop + .37), s.color, .4, 2.2, .6); sparks.emit(p, { count: 14, color: [a ? a.color : C.cyan, '#ffffff'], speed: 2.4, up: 2.5, life: .7, size: .22 });
        if (a) { const old = pickTags.get(num); if (old) { pickTags.delete(num); old.userData.out = now(); tagsOut.add(old); }
            const sp = new T.Sprite(new T.SpriteMaterial({ map: a.plateT, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, fog: false })); sp.renderOrder = 6;
            const pp = L.pos[num - 1]; sp.position.set(pp.x, L.yTop + 1.15 * K + .35, pp.z); sp.userData = { t0: now(), s: .55 * Math.max(.7, K), y: sp.position.y, ph: num }; sp.scale.set(.001, .001, 1); sc.add(sp); pickTags.set(num, sp); }
        if (a && !a.path) { a.lookAt = p.clone(); a.behUntil = Math.max(a.behUntil, now() + 1.6); if (a.rnd() < .5) { a.rig.play(a.rnd() < .5 ? 4 : 3); a.behUntil = now() + 1.4; a.ov = null; } }
    }
    async function timeUp() {
        isChoosing = false; urgency = 0; setMood('tense');
        for (const a of actors.values()) a.setMood('tense', true);
        const L = activeLevel, F = frameBox(levelPts(L), .62, 0, .92);
        setShot(t => ({ pos: F.pos.clone(), look: F.look.clone(), rate: 1.4 })); // يقترب ثم يثبت
        pulse(L.center().setY(L.yTop + .1), C.orange, L.w * .7, 1, 1, .8);
        await wait(1.8);
    }
    // اللاعبين اللي اختاروا يمشون لدوائرهم (تتابع خفيف حتى ما يتحركون كلهم بنفس اللحظة)
    async function moveIn(assign) {
        for (const [n, sp] of [...pickTags]) { pickTags.delete(n); sp.userData.out = now(); tagsOut.add(sp); }
        const L = activeLevel; setMood('choose'); let maxT = 0;
        const entries = Object.entries(assign);
        setShot(oblique(pyramidPts(actorPts()), .5, 1.2, .04));
        entries.forEach(([id, num], q) => { const a = actors.get(String(id)); if (!a) return; const s = L.st[num - 1]; a.homeYaw = 0; a.setMood('still'); maxT = Math.max(maxT, a.walkTo(L.stand(num - 1), (q % 12) * .08 + Math.random() * .25, 3)); setTimeout(() => { s.mode = 'occupied'; s.flash = .6; }, maxT * 1000); });
        await wait(maxT + .4);
        for (const [id, num] of entries) { const s = L.st[num - 1]; s.mode = 'occupied'; const a = actors.get(String(id)); if (a) a.setMood('tense', true); }
        // الدوائر الفاضية في هالمرحلة تنطفئ، والدرجة السابقة تغطس دوائرها
        L.st.forEach(s => { if (s.mode === 'idle') s.mode = 'dim'; });
        const prev = levels[L.k - 1]; if (prev) prev.st.forEach(s => sink(s));
        setShot(oblique(pyramidPts(actorPts()), .5, 1.2, .04));
    }
    function sink(s, dur = .9) { const t0 = now(), y0 = s.y; const f = () => { const k = clamp01((now() - t0) / dur); s.y = y0 - .5 * ease(k); s.s = 1 - ease(k); if (k < 1) requestAnimationFrame(f); else s.gone = true; }; f(); }
    function actorCircle(a) { const L = activeLevel; if (!L) return -1; return L.st.findIndex(s => s.owner === a.id); }
    // الإقصاء: صدمة ← بوابة/دائرة حمراء تبلع الشخصية ← شرار — بدون اختفاء جاف
    async function dropActor(a, o = {}) {
        if (!a || a.dead) return; a.dead = true; a.setMood('locked'); a.path = null;
        const L = activeLevel, j = actorCircle(a), s = j >= 0 ? L.st[j] : null, base = a.pos.clone();
        a.doBeh('shock', 3); a.moodSet = 'locked'; a.rig.mood && a.rig.mood('scared'); a.ov = 'shock';
        if (s) { s.mode = 'doom'; } else pulse(base.clone().setY(base.y + .05), C.red, .3, 1.4, 1.2);
        // الجيران يلتفتون ويتفاعلون
        for (const o2 of actors.values()) if (o2 !== a && !o2.dead && !o2.path && o2.pos.distanceTo(a.pos) < 6) { o2.lookAt = a.pos.clone().setY(a.pos.y + 1.2); o2.ov = o2.rnd() < .5 ? 'shock' : 'clasp'; o2.rig.mood && o2.rig.mood('scared'); o2.behUntil = now() + 1.6 + o2.rnd(); }
        emit('doom', o.kind); await wait(o.hold || .9);
        a.ov = 'sad'; a.rig.mood && a.rig.mood('sad');
        emit('fall', o.kind);
        sparks.emit(base.clone().setY(base.y + .6), { count: 40, color: [C.red, C.orange, C.violet], speed: 4, up: 2, life: 1, size: .3 });
        pulse(base.clone().setY(base.y + .38), C.red, .5, 3.4, .9);
        const t0 = now(), dur = 1.15, tilt = (Math.random() - .5) * 2;
        await new Promise(res => { const f = () => {
            const k = clamp01((now() - t0) / dur), g = k * k;
            a.extraY = -g * 3.2; a.spinY = g * 2.4 * tilt; a.scale = (a.baseScale || 1) * (1 - g * .35);
            if (s) { s.y = -g * 3.2; s.tilt = g * .8; s.tiltDir = tilt * 3; }
            if (k < 1) requestAnimationFrame(f); else res(); }; f(); });
        if (s) { s.gone = true; s.mode = 'gone'; }
        sparks.emit(base.clone().setY(base.y + .2), { count: 18, color: [C.violet, C.lav], speed: 1.5, up: 1.5, life: 1.2, gravity: -1 });
        a.dispose(); actors.delete(a.id);
    }
    async function eliminate(ids, kind = 'idle') {
        const list = ids.map(id => actors.get(String(id))).filter(Boolean); if (!list.length) return;
        setMood('danger');
        if (list.length <= 3) { const c = V(); list.forEach(a => c.add(a.pos)); c.multiplyScalar(1 / list.length); setShot(close(c.setY(c.y + 1), 8 + list.length * 2, .5, .2)); await wait(.7); }
        // دفعات صغيرة متتابعة عشان كل إقصاء ينشاف
        const per = list.length > 12 ? .08 : list.length > 4 ? .18 : .45;
        await Promise.all(list.map((a, i) => wait(i * per).then(() => dropActor(a, { kind, hold: .7 }))));
        await wait(.5); setMood('tense'); setShot(mainShot());
    }
    // الإقصاء العشوائي: الكشاف يتنقل بين الدوائر المشغولة ويتباطأ لين يوقف على الضحية (اللي اختارتها اللعبة)
    async function roulette(victimId, o = {}) {
        const L = activeLevel, v = actors.get(String(victimId)); if (!L || !v) return;
        setMood('tense'); screen('إقصاء عشوائي', '…');
        const occ = L.st.map((s, j) => s.owner && actors.get(s.owner) && !actors.get(s.owner).dead ? j : -1).filter(j => j >= 0);
        const vj = L.st.findIndex(s => s.owner === v.id);
        setShot(oblique(levelPts(L, actorPts()), .9, 1.3, 0));
        for (const a of actors.values()) if (!a.dead) a.setMood('tense', true);
        const spot = new T.Mesh(new T.CylinderGeometry(.35, R * 1.25, 14, 24, 1, true), new T.MeshBasicMaterial({ map: beamTex, color: C.gold, transparent: true, opacity: .5, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, toneMapped: false }));
        spot.geometry.translate(0, 7, 0); spot.geometry.rotateX(Math.PI); spot.geometry.translate(0, 14, 0); sc.add(spot);
        const hops = Math.max(14, Math.min(26, occ.length + 10)), dur = o.dur || 4.2; let prevJ = -1, t = 0;
        const seq = []; for (let i = 0; i < hops - 1; i++) { let j; do j = occ[(Math.random() * occ.length) | 0]; while (occ.length > 1 && j === (seq[seq.length - 1] ?? -1)); seq.push(j); } seq.push(vj);
        for (let i = 0; i < hops; i++) {
            const k = i / (hops - 1), gap = lerp(.07, .55, Math.pow(k, 2.4)) * dur / 4.2;
            const j = seq[i]; if (prevJ >= 0 && L.st[prevJ].mode === 'spot') L.st[prevJ].mode = 'occupied';
            L.st[j].mode = 'spot'; L.st[j].flash = .7; prevJ = j;
            spot.position.copy(L.pos[j]).setY(L.yTop); emit('tick', k);
            const a = actors.get(L.st[j].owner); if (a) { a.ov = 'clasp'; a.behUntil = now() + .8; }
            await wait(gap); t += gap;
        }
        // وقفة تشويق ثم الحسم مع لقطة قريبة
        const vp = L.pos[vj].clone().setY(L.yTop + 1); setShot(close(vp, 6.5, .38, .35, 2.2)); emit('suspense');
        await wait(1.1);
        spot.material.color.set(C.red);
        // الحيّة تطلع من الرقم وتلدغ صاحبه
        setShot(close(vp.clone().setY(vp.y - .2), 5.2 * Math.max(.75, K), .3, .55, 2.4));
        for (const o of actors.values()) if (o !== v) o.plate.visible = false; // اللقطة القريبة: اسم الضحية بس
        await snakeAttack(v, L, vj);
        emit('strike');
        await dropActor(v, { kind: 'random', hold: .45 });
        for (const o of actors.values()) o.plate.visible = true;
        sc.remove(spot); spot.geometry.dispose(); spot.material.dispose();
        await wait(.4); setShot(mainShot());
    }
    // ---------- الحيّة المميتة: تطلع من فتحة بالرقم، تتمايل وتفحّ، ثم تلدغ صاحب الرقم وترجع لجحرها
    function snakeAttack(a, L, j) {
        const sk = Math.max(.75, K), base = L.pos[j].clone().setY(L.yTop + .36 * K); base.z += .32 * K;
        const target = a.pos.clone().setY(a.pos.y + 1.1 * (a.baseScale || 1));
        const g = new T.Group(); sc.add(g);
        const bodyM = new T.MeshStandardMaterial({ color: '#23494a', roughness: .4, metalness: .1 }), bandM = new T.MeshStandardMaterial({ color: SAND, roughness: .5 });
        const eyeM = new T.MeshBasicMaterial({ color: '#f0c25a' }), tongueM = new T.MeshBasicMaterial({ color: '#b8402e' }), holeM = new T.MeshBasicMaterial({ color: '#0e1d1d', transparent: true, opacity: .95 });
        const sg = new T.SphereGeometry(1, 14, 10), N = 26, segs = [];
        for (let i = 0; i < N; i++) { const m = new T.Mesh(sg, i % 5 === 2 ? bandM : bodyM); m.castShadow = true; g.add(m); segs.push(m); }
        const head = segs[0];
        const eyes = [-1, 1].map(sd => { const e = new T.Mesh(sg, eyeM); e.scale.setScalar(.035 * sk); head.add(e); e.position.set(sd * .5, .35, .55); e.scale.set(.18, .18, .18); return e; });
        const tongue = new T.Mesh(new T.BoxGeometry(.04, .01, .5), tongueM); tongue.position.set(0, -.15, 1.1); head.add(tongue);
        const hole = new T.Mesh(new T.CircleGeometry(.5 * sk, 24), holeM); hole.rotation.x = -Math.PI / 2; hole.position.copy(base).setY(base.y + .01); hole.scale.setScalar(.01); sc.add(hole);
        const r0 = .13 * sk, H = 1.25 * sk * (a.baseScale || 1), t0 = now();
        const T1 = .9, T2 = 2.0, T3 = 2.3, T4 = 2.75, T5 = 3.5; // طلوع ← تمايل وفحيح ← لدغة ← تثبيت ← رجوع
        a.lookAt = base.clone().setY(base.y + H); a.ov = 'shock'; a.rig.mood && a.rig.mood('scared'); a.behUntil = now() + 9; a.moodSet = 'locked';
        emit('hiss'); pulse(base.clone().setY(base.y + .02), '#0e1d1d', .2, .9 * sk, .5, .6);
        const P = V(), up = V(), line = V(), _d = V();
        let bit = false;
        return new Promise(res => {
            const f = () => {
                const t = now() - t0;
                const emerge = t < T1 ? easeOut(t / T1) : t < T4 ? 1 : 1 - ease(clamp01((t - T4) / (T5 - T4)));
                const strike = t < T2 ? 0 : t < T3 ? easeOut((t - T2) / (T3 - T2)) : t < T4 ? 1 : 1 - ease(clamp01((t - T4) / .4));
                hole.scale.setScalar(Math.max(.01, Math.min(1, t / .3) * (t > T5 - .2 ? clamp01((T5 - t) / .2) : 1)));
                for (let i = 0; i < N; i++) {
                    const sN = 1 - i / (N - 1), s = sN * emerge; // s: 0 عند الجحر، 1 الراس
                    // وقفة الحيّة: منحنى S عمودي يتمايل
                    up.set(Math.sin(s * Math.PI * 2.2 + t * 3.2) * .22 * sk * s, s * H, -Math.sin(s * Math.PI) * .25 * sk);
                    // اللدغة: الجسم يمتد بخط من الجحر لصدر اللاعب
                    _d.subVectors(target, base); line.copy(_d).multiplyScalar(s); line.y += Math.sin(s * Math.PI) * .35 * sk;
                    P.copy(base).add(up.lerp(line, strike));
                    const m = segs[i], rr = r0 * (1 - i / N * .6) * (i === 0 ? 1.35 : 1);
                    m.position.copy(P); m.scale.set(rr, rr, rr); m.visible = s > .01 || i === N - 1;
                }
                // الراس يطالع اللاعب، ويتمدد شوي وقت اللدغة
                head.scale.set(r0 * 1.5, r0 * 1.05, r0 * 2.1); head.lookAt(target);
                tongue.visible = (t > T1 && Math.sin(t * 22) > 0) || (t > T2 && t < T4);
                if (!bit && t >= T3 - .05) { bit = true; emit('bite'); sparks.emit(target, { count: 36, color: [C.red, SAND], speed: 4, life: .8, size: .26 }); pulse(target.clone().setY(L.yTop + .4), C.red, .3, 2.4, .7); }
                if (t < T5) requestAnimationFrame(f);
                else { sc.remove(g); sc.remove(hole); sg.dispose(); tongue.geometry.dispose(); hole.geometry.dispose(); [bodyM, bandM, eyeM, tongueM, holeM].forEach(m => m.dispose()); }
                if (t >= T4 && !g.userData.done) { g.userData.done = true; res(); }
            }; f();
        });
    }
    // النجاة: احتفال قصير متفاوت لكل شخصية + قصاصات + الجمهور يهتف
    async function survived(ids, o = {}) {
        setMood('survive'); screen('نجوا', ids.length + ' لاعب');
        const L = activeLevel; pulse(L.center().setY(L.yTop + .1), C.gold, 1, L.w, 1.4, .8);
        ids.forEach((id, i) => { const a = actors.get(String(id)); if (!a) return; setTimeout(() => { a.setMood('happy', true); a.doBeh(pickW(MOOD_SETS.happy, a.rnd)); sparks.emit(a.pos.clone().setY(a.pos.y + 1.8), { count: 6, color: [a.color, C.gold], speed: 2, up: 2, life: .8, size: .2 }); }, (i % 10) * 90 + Math.random() * 300); });
        confetti.emit(L.center().setY(L.yTop + 10), { count: 260, color: [TEAL, SAND], speed: 7, up: 2, gravity: 3, drag: 1.6, life: 3.2, size: .2, spread: L.w * .6 });
        setShot(oblique(pyramidPts(actorPts()), .5, 1.3, .1));
        await wait(o.dur || 2.6);
        for (const id of ids) { const a = actors.get(String(id)); if (a) a.setMood('calm'); }
    }
    // المرحلة التالية: الكاميرا تطلع تعرض الناجين والدرجة الجديدة تنبني فوقهم
    async function nextLevel(n) {
        setMood('calm');
        const prev = activeLevel, F = () => frameBox(pyramidPts(actorPts()).concat(levelPts({ w: layout(n).w, yTop: prev.yTop + STEP_H, zFront: prev.zBack, zBack: prev.zBack - layout(n).d })), .72, 0, 1.02);
        setShot(t => { const f = F(); return { pos: f.pos.add(drift(t)), look: f.look, rate: 1.1 }; });
        await wait(.6);
        const dur = buildLevel(n, .04); screen('المرحلة التالية', n + ' دائرة');
        await wait(dur);
        setShot(mainShot());
    }
    // الفائز: منصة ذهبية بالقمة، يمشي لها، لقطة قريبة تدور حوله، إضاءة ذهبية واحتفال
    async function champion(id) {
        const a = actors.get(String(id)); if (!a) return; isChoosing = false; urgency = 0;
        setMood('win'); screen('البطل', a.name);
        const prev = activeLevel, L = new Level(levels.length, 1); levels.push(L); activeLevel = L; L.rise = 0; L.top.visible = false; // منصة البطل: بدون رقم
        const t0 = now(); const rise = () => { L.rise = (now() - t0) / 1.2; if (L.rise < 1) requestAnimationFrame(rise); else L.rise = 1; }; rise();
        setTimeout(() => { const s = L.st[0]; s.mode = 'win'; s.flash = 1; const t1 = now(); const g = () => { s.s = (now() - t1) / .5; if (s.s < 1) requestAnimationFrame(g); else s.s = 1; }; g(); }, 900);
        if (prev) prev.st.forEach(s => { if (!s.gone && s.owner !== a.id) sink(s); });
        const top = L.stand(0);
        setShot(t => { const F = frameBox([a.pos.clone(), top.clone(), top.clone().setY(top.y + 2)], .5, .3, 1.4); return { pos: F.pos, look: F.look, rate: 1.4 }; });
        await wait(1.3);
        a.baseScale = a.scale = 1; // البطل بحجمه الكامل على القمة
        a.homeYaw = 0; a.setMood('still'); const wt = a.walkTo(top, 0, 2.6); await wait(wt + .2);
        L.st[0].owner = a.id;
        a.moodSet = 'locked'; a.doBeh('win', 999); a.rig.mood && a.rig.mood('laugh'); emit('champion');
        // الكاميرا: لقطة قريبة تدور ببطء حول البطل
        const c = top.clone().setY(top.y + 1.1);
        setShot(t => { const yaw = .2 + t * .16, d = Math.max(4.2, 7 - t * .25), pitch = .22; return { pos: c.clone().add(V(Math.sin(yaw) * Math.cos(pitch) * d, Math.sin(pitch) * d, Math.cos(yaw) * Math.cos(pitch) * d)), look: c.clone().setY(c.y - .1), fov: 38, rate: 2 }; });
        // ألعاب نارية + قصاصات ذهبية + نبض أرضي — باقية طول شاشة الفوز
        let nextFw = 0, nextCf = 0;
        champFx = (dt, t) => {
            if (t > nextFw) { nextFw = t + .5 + Math.random() * .7; const p = V((Math.random() - .5) * 60, 28 + Math.random() * 18, top.z - 20 - Math.random() * 30); sparks.emit(p, { count: 90, color: [TEAL, SAND], speed: 11, life: 1.6, gravity: 3, drag: 1.4, size: .55 }); emit('firework'); }
            if (t > nextCf) { nextCf = t + 1.6; confetti.emit(top.clone().setY(top.y + 8), { count: 120, color: [TEAL, SAND], speed: 5, up: 1, gravity: 2.4, drag: 1.8, life: 3.5, size: .18, spread: 8 }); pulse(top.clone().setY(top.y + .36), C.gold, .6, 4, 1.4); }
        };
    }
    // إعادة: يشيل الهرم كامل ويرجع الكل للساحة
    function reset() {
        champFx = null; isChoosing = false; urgency = 0; setMood('calm'); screen('الهرم', 'ألعاب أيمن');
        for (const [n, sp] of [...pickTags]) { pickTags.delete(n); sc.remove(sp); sp.material.dispose(); } for (const sp of tagsOut) { sc.remove(sp); sp.material.dispose(); } tagsOut.clear();
        levels.splice(0).forEach(L => L.dispose()); activeLevel = null;
        for (const a of actors.values()) a.dispose(); actors.clear();
        setShot(lobbyShot());
    }
    function setQuality(m) { if (!['auto', 'low', 'balanced', 'high'].includes(m)) return; mode = m; if (m === 'auto') { ladderIdx = probe.startIdx; gov.banned.clear(); gov.cool = 3; } applyTier(m === 'auto' ? 'نقيس أداء جهازك من جديد' : ''); }
    // موقع راس لاعب على الشاشة (لتبويبات HTML)
    function headScreen(id) { const a = actors.get(String(id)); if (!a) return null; const p = a.pos.clone().setY(a.pos.y + a.extraY + 2.2).project(cam); if (p.z > 1) return null; const b = r.domElement.getBoundingClientRect(); return { x: b.left + (p.x + 1) / 2 * b.width, y: b.top + (1 - p.y) / 2 * b.height }; }
    function stop() {
        running = false; cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', onVis);
        reset();
        sc.traverse(o => { o.geometry && o.geometry.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k] && m[k].isTexture) m[k].dispose(); m.dispose && m.dispose(); }); });
        r.dispose(); r.domElement.remove();
    }
    return { setPlayers, startMatch, choosing, setUrgency, pick, timeUp, moveIn, eliminate, roulette, survived, nextLevel, champion, reset, setQuality, qualityInfo, screen, headScreen, stop, get vrm() { return !!VRM; }, get gpu() { return probe; } };
}
