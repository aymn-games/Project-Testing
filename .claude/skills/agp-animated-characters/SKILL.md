---
name: agp-animated-characters
description: Design and build animated characters, mascots and player avatars for AGP games (aymngames.online) — characters that idle, walk in when a viewer joins, cheer on a win, get knocked out on elimination, and react to TikTok gifts. Vanilla JS + SVG/CSS by default, in the site's style. Use whenever a game needs "شخصيات متحركة", "شخصية", "كركتر", "ماسكوت", "أنيميشن للاعبين", animated players, a mascot/host character, sprite animation, Lottie or Rive. For full 3D figures inside a Three.js scene, combine with agp-3d-scenes.
---

# AGP Animated Characters

Characters on this platform are watched on a live stream: they must read in a second on a phone screen, react to what viewers do (join, gift, win, lose), and stay smooth with dozens on screen at once (Team War supports 30 players).

## 1. Pick the technique

| Technique | Use when | Notes |
|---|---|---|
| **Inline SVG + CSS animations** (default) | Almost always: players, mascots, reactions | No library, scales crisply, each part is animatable, colors via CSS variables |
| **3D figures in Three.js** | The game is already a 3D scene | Build from primitives like `figure()` in `games/survival-ship/ship3d.js`; follow the `agp-3d-scenes` skill |
| **Sprite sheet + CSS `steps()`** | The owner provides drawn raster frames | One PNG/WebP strip per state, `animation: play .6s steps(N) infinite` |
| **Lottie / Rive** | The owner provides a designed `.json`/`.lottie`/`.riv` file | External runtime = needs the owner's explicit approval (`docs/CLAUDE.md`). Pin an exact version from cdnjs/jsdelivr |

Don't pick Lottie/Rive just because they're popular — without a designer's file they add a dependency for nothing.

## 2. Character anatomy (SVG)

Build the character as named groups so each part can move on its own:

```html
<svg class="agp-char" viewBox="0 0 120 160" aria-hidden="true">
  <g class="c-body">
    <g class="c-legs">…</g>
    <g class="c-torso">…</g>
    <g class="c-arm c-arm-l">…</g><g class="c-arm c-arm-r">…</g>
    <g class="c-head">
      <g class="c-face"><g class="c-eyes">…</g><path class="c-mouth"/></g>
      <g class="c-hair">…</g>
    </g>
  </g>
</svg>
```

- Every animated group needs `transform-box: fill-box; transform-origin: …` (e.g. arms rotate from the shoulder: `transform-origin: 50% 10%`), otherwise SVG transforms pivot around the viewBox origin.
- Colors come from CSS variables on the root (`--c-skin`, `--c-hair`, `--c-outfit`, `--c-accent`), so one SVG serves every player.
- Style: rounded, chunky, friendly shapes with a thick outline read best at small sizes on a stream. Keep the face big (≈ 40% of the height) — expressions carry the emotion.
- Optional: put the viewer's TikTok avatar (`player.avatarUrl`) in a circular `clipPath` as the face or a badge; fall back to the character face if it fails to load.

## 3. States (one state machine per character)

| State | Trigger (typical AGP event) | Motion |
|---|---|---|
| `enter` | `player:joined` | drop/slide in with a small overshoot, then → `idle` |
| `idle` | default | slow breathing (scaleY 1→1.03), blink every 3–6 s at a random offset |
| `walk` / `run` | game moves the player | leg/arm swing, body bob |
| `react` | `stream:giftReceived` from this player | quick hop/spin/hearts, then back to the previous state |
| `win` | the game declares this player/team the winner | jump + arms up + confetti, loops until the round resets |
| `lose` / `out` | elimination | wobble → fall / fade / spin away; stays down |
| `talk` | the character is announcing something | mouth shape swap |

Rules:
- One base state at a time (`idle`, `walk`, `win`, `out`), set by a class: `el.dataset.state = 'win'`.
- Transient reactions (`react`, `blink`) play *on top* of the base state and return to it automatically (`animationend`). Queue them; don't stack ten at once.
- Terminal states (`out`) ignore reactions.
- The game decides *when*; the character module only knows *how*. Wire events in the game file, e.g. `AGP.events.on('stream:giftReceived', p => chars.get(p.id)?.react('gift'))` (see the existing listeners in `games/greed/greed-platform.js`).

A small API is enough:

```js
const ch = createCharacter(container, { id, name, avatarUrl, look });  // look derived from id
ch.setState('idle' | 'walk' | 'win' | 'out');
ch.react('gift' | 'cheer' | 'hit');
ch.destroy();
```

## 4. Per-player variety

Derive the look deterministically from the player id (a simple string hash → index into palettes of skin/hair/outfit/accessory), so the same viewer looks the same every round and two players rarely match. Never use `Math.random()` for appearance. Show the player's name under the character in Arabic (RTL), truncated with an ellipsis.

## 5. Motion quality

- Animate only `transform` and `opacity`. Never `top/left/width/height` or SVG path `d` per frame.
- Use overshoot easing for lively moves: `cubic-bezier(.34,1.56,.64,1)`; ease-out for entrances, ease-in for exits.
- Squash and stretch on jumps and landings sells weight cheaply.
- Desynchronize crowds: give each character a random `animation-delay` / duration ±15% so 30 idling players don't breathe in unison.
- Durations: reactions 400–900 ms, entrances ≤ 600 ms, win loops ~1 s.
- `@media (prefers-reduced-motion: reduce)`: keep state changes but swap bouncing/spinning for simple fades.

## 6. Performance with many characters

- Reuse one SVG `<symbol>` + `<use>` per body part when rendering many identical characters, or clone a template node — don't rebuild SVG strings every update.
- Pause animations of characters that are off-screen or hidden (`animation-play-state: paused`).
- Cap concurrent `react` effects (e.g. max 5 visible gift reactions; drop or merge the rest) — gift combos can fire many events per second.
- `will-change: transform` only on the few elements animating right now, not on everything.

## 7. Where the code lives

- Character used by one game → inside `games/<id>/` (e.g. `games/<id>/<id>-characters.js` + CSS in the game's `style.css`).
- Used by two or more games → a shared module `js/agp-characters.js` exposing `AGP.characters`, written in the project's IIFE pattern (`(function (AGP) { 'use strict'; … }(window.AymanGamesPlatform));`, `AGP.log` instead of `console.log`). A shared file affects every game that loads it: test on more than one game.
- Every game still sends its result with `AGPAuth.reportMatchPoints` (root `CLAUDE.md`) — characters never replace that.
- Colors: start from the game's `--agp-accent` so each game keeps its own identity.

## 8. Verify before calling it done

1. Build a quick harness page (or use the game) that cycles every state and fires a burst of reactions.
2. Screenshot each state with Playwright (`webapp-testing` / `playwright-cli` skills) at phone width (~390px) and desktop; check RTL name labels.
3. Spawn 30 characters and confirm animation stays smooth and the console is clean.
4. Run the game start → win → restart a few times to make sure no characters or listeners pile up.
