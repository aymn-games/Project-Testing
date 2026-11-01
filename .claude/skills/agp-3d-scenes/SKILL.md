---
name: agp-3d-scenes
description: Build 3D scenes, 3D game boards, 3D intros and 3D effects for AGP games (aymngames.online) with Three.js, in the site's Vanilla JS / no-build style, light enough for phones and for a streamer's OBS capture. Use whenever a game or page needs anything 3D — "ثري دي", "3D", "مجسم", "مشهد ثلاثي الأبعاد", "انترو ثري دي", Three.js, WebGL, a 3D stadium/ship/table/wheel, 3D players, or 3D gift effects. For 2D/SVG animated characters use agp-animated-characters instead.
---

# AGP 3D Scenes (Three.js)

3D in this project already exists and works. Match it instead of inventing a new setup:

| Reference | Pattern | Read it for |
|---|---|---|
| `games/survival-ship/ship3d.js` | Custom element `<ship-3d scene='{json}'>` that re-syncs when its `scene` attribute changes | Long-running in-game scene, players as 3D figures, diff-by-id sync, smooth camera |
| `games/penalty/intro3d.js` | ES module `mountIntro(el, opts)` returning `{ stop }`, loaded from `game.html` via `import('./intro3d.js')` | Short timed intro with a progress/done callback and full disposal |

Read the closer of the two before writing anything.

## Hard rules

1. **Three.js version is pinned to `0.160.0`** — the version both existing scenes use. Load it from the CDN, never from npm (there is no build step):
   - From a classic script / custom element: `import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js').then(T => …)`
   - From an ES module file: `import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';`
   - Addons (`GLTFLoader`, `OrbitControls`…) import the bare specifier `three`, so they need an import map on the page:
     ```html
     <script type="importmap">{"imports":{"three":"https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js","three/addons/":"https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"}}</script>
     ```
     Only add addons when really needed; changing the version means checking every 3D game.
2. **The 3D layer is a view, not the game.** Game rules, timers, scoring, `reportMatchPoints`, and AGP events stay in the game's own file. The scene exposes a small API (`setState(data)` / `scene` attribute / `mount → { stop }`) and the game drives it.
3. **The game must still work if 3D fails.** Wrap the import + `new WebGLRenderer()` in try/catch (and `.catch` on the dynamic import). On failure keep or show the 2D fallback and log via `AGP.log` — never a blank screen mid-stream.
4. **Don't touch the core.** No edits to `js/agp-*.js` load order or to `agp-game-shell.js` for a 3D feature. The 3D file lives in `games/<id>/` (e.g. `games/<id>/<name>3d.js`) and is loaded after the game shell.
5. **Prefer procedural geometry + `CanvasTexture`** (what both references do) over large model files. If a `.glb` is truly needed, keep it small (< 1–2 MB, Draco/meshopt compressed) under `games/<id>/`.

## Renderer setup (copy, then adjust)

```js
const r = new T.WebGLRenderer({ antialias: true });
r.setPixelRatio(Math.min(devicePixelRatio, ALWAYS_ON ? 1 : 2)); // 1 for scenes that run the whole match, ≤2 for short intros
r.outputColorSpace = T.SRGBColorSpace;
r.toneMapping = T.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
r.shadowMap.enabled = true; r.shadowMap.type = T.PCFSoftShadowMap; // one shadow-casting light, mapSize 1024 (2048 only for short intros)
```

Lighting recipe used by both scenes: one `HemisphereLight` (sky/ground tint) + one `DirectionalLight` "sun" with a tight shadow camera, optionally a colored rim light. Add `scene.fog` matching the background so the far edge fades instead of cutting off.

Only add `preserveDrawingBuffer: true` if you need to read pixels back (screenshots/recording) — it costs performance.

## Loop, resize, teardown

- **Resize:** `ResizeObserver` on the container (`r.setSize(w, h, false)`, update `camera.aspect`, `updateProjectionMatrix()`), not only `window.resize` — game layouts scale via `agp-wide-scale.js`.
- **Delta time:** `const dt = Math.min(clock.getDelta(), 0.05)` so a hiccup or a background tab doesn't teleport things.
- **Frame-rate-independent smoothing:** `const k = 1 - Math.exp(-dt * rate); cam.position.lerp(target, k);` (as in ship3d).
- **Pause when hidden:** stop the RAF on `document.visibilitychange` when `document.hidden`, resume after. (OBS browser sources stay visible, so this never hurts a live stream.)
- **Dispose everything** on teardown (`disconnectedCallback` or the returned `stop()`):
  ```js
  cancelAnimationFrame(raf); ro.disconnect();
  scene.traverse(o => { o.geometry?.dispose(); [].concat(o.material || []).forEach(m => { for (const k in m) if (m[k]?.isTexture) m[k].dispose(); m.dispose(); }); });
  r.dispose(); r.domElement.remove();
  ```
  Games are restarted many times per stream — leaks show up as a stream that gets slower every round.

## Syncing game state → scene

Follow ship3d's approach: the game passes a plain JSON state (`{players:[{id,name,…}], focus, …}`), and the scene keeps a `Map` from player id to its 3D object:
- create objects only for new ids, remove objects for ids that left, update the rest in place;
- never rebuild the whole scene on each update;
- movement is a *target* the `tick()` animates toward, not an instant jump.

For player appearance, derive variation (skin/hair/outfit colors) deterministically from the player id (a small string hash), so the same viewer looks the same every round.

## Identity, text and RTL

- **Colors:** read the game's accent instead of hard-coding: `getComputedStyle(el).getPropertyValue('--agp-accent').trim()`; each game keeps its own palette.
- **Arabic text in 3D** (names, scores, labels): draw it on a 2D canvas → `CanvasTexture` → `Sprite`/plane. Set `ctx.direction = 'rtl'`, `ctx.textAlign = 'center'`, and use the site fonts (`"IBM Plex Sans Arabic"`, `"Zain"`, `"Cairo"`) — `await document.fonts.ready` before drawing, or the first labels render in a fallback font. Set `texture.colorSpace = SRGBColorSpace`.
- **TikTok avatars:** `player.avatarUrl` can be drawn into a canvas texture (`img.crossOrigin = 'anonymous'`); if it fails to load, fall back to an initial-letter circle.

## Stream reactions

Gift/comment effects are triggered by the game file listening on AGP events (e.g. `AGP.events.on('stream:giftReceived', payload => scene.burst(...))`, as in `games/greed/greed-platform.js`). Keep effects pooled (reuse particle meshes) and cap concurrent effects — a gift combo can fire dozens of events per second.

## Performance budget

Target smooth 60 fps on a mid-range phone and inside OBS on a streaming PC that is also encoding video:
- < ~100 draw calls; merge or `InstancedMesh` for repeated objects (crowds, coins, seats);
- `flatShading` / low-poly geometry is on-style and cheap;
- one shadow light; small shadow camera bounds; `castShadow` only on what needs it;
- respect `prefers-reduced-motion`: slow or drop camera shake/sweeps.

## Verify before calling it done

1. Open the game in Playwright (see the `webapp-testing` / `playwright-cli` skills). Headless Chromium renders WebGL through SwiftShader; if the canvas is blank, launch with `args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']`.
2. Screenshot the main states (start, mid-round, winner) at phone width (~390px) and desktop.
3. Check the console is clean, then start → finish → restart the game a few times to confirm nothing leaks or duplicates.
4. Test the fallback by forcing the import to fail.
5. If the change touches a shared file, test more than one game (root `CLAUDE.md`).
