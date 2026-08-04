# AGP Core — Architecture Reference (v1, Frozen)

> Official development reference. AGP Core is frozen at this state: no new
> Managers, no redesign, no behavior changes without a documented, explicit
> decision. Extend around it using the rules below.

---

## 1. Final Architecture

Vanilla JS, no framework, no build step. Everything lives under one global
namespace: `window.AymanGamesPlatform` (`AGP`). All communication between
Managers happens through **`AGP.events`** (pub/sub) — Managers do not call
into each other's internals, only their public API or shared events.

```
Core:        agp-core.js, agp-events.js, agp-registry.js, agp-bootstrap.js
Utilities:   agp-timer-manager.js, agp-storage-manager.js, agp-services.js
Session:     agp-session.js, agp-rooms-manager.js
Access:      agp-lobby.js, agp-player-manager.js, agp-player-source.js,
             agp-keyword-manager.js, agp-queue-manager.js
Game:        agp-game-api.js, agp-game-engine.js, agp-game-manager.js,
             agp-game-bridge.js
Flow:        agp-round-manager.js
Streaming:   agp-stream-connector.js
Scoring:     agp-score-manager.js
Adapters:    games/<id>/agp-<id>.js  (one per game, e.g. roulette)
Dashboards:  dashboard-core/  (current)  •  dashboard/  (deprecated)
```

Load order is fixed (see any `index.html`) — each file only assumes what's
already loaded before it, and every file degrades safely (no-op fallbacks)
if loaded standalone.

---

## 2. Core Managers & Responsibilities

| Manager | Owns | Does NOT do |
|---|---|---|
| `AGP.session` | Session state machine (Idle→…→SessionEnded), join code, round counter, player array reference | Doesn't manage players or rooms itself |
| `AGP.roomsManager` | Single active room lifecycle (create/close), keeps Session in sync | Not multi-room yet (internal Map is upgrade-ready) |
| `AGP.lobby` | Registration open/close (delegates to Session), join gate (`requestJoin`), its own 5-state life cycle | Doesn't store players or sessions |
| `AGP.player` | The one player list (add/remove/find/reset), works on Session's array | No teams/roles/scoring concept |
| `AGP.playerSource` | Unified entry point for adding a player from any registered source | Doesn't manage the list itself — delegates to `AGP.player` |
| `AGP.keywordManager` | One join keyword (set/activate/check) | Submits via `AGP.playerSource`, not `AGP.player` directly |
| `AGP.queueManager` | Candidate buffer before admission (enqueue/admit) | Submits via `AGP.playerSource` on admit |
| `AGP.gameAPI` | Game registration contract, forwards `lobby:*`/`player:*`/`session:round*` to the active game's hooks | No engine/lifecycle logic |
| `AGP.gameEngine` | Single loaded game's lifecycle (load/start/stop/destroy) | No round/session logic — auto-syncs via events only |
| `AGP.gameManager` | Facade — single entry point for external callers (dashboards). Pure delegation, zero own logic | Never bypassed by Core internals |
| `AGP.gameBridge` | Generic `postMessage` bridge to externally-hosted games | Knows nothing about any specific game |
| `AGP.roundManager` | The one round state machine, driven only by events, syncs Session | No player/game-specific logic |
| `AGP.timerManager` | Named countdowns | No game logic — just ticks and emits |
| `AGP.storageManager` | Namespaced localStorage wrapper | No business meaning to what's stored |
| `AGP.scoreManager` | Per-player point ledger | No auto-scoring rules |
| `AGP.streamConnector` | Registry + status tracking for stream platform stubs | No real connection yet |
| `AGP.registry` | Discovers `.game-card` DOM elements | Not a data-only registry — tied to page markup |

---

## 3. Event Flow (Namespaces)

`namespace:action`, one owner emits each namespace, any number of listeners:

```
session:*   → agp-session.js        room:*     → agp-rooms-manager.js
lobby:*     → agp-lobby.js          player:*   → agp-player-manager.js
playerSource:* → agp-player-source.js   queue:* → agp-queue-manager.js
keyword:*   → agp-keyword-manager.js    game:*  → gameAPI / gameEngine / any game adapter
round:*     → agp-round-manager.js      timer:* → agp-timer-manager.js
score:*     → agp-score-manager.js      stream:* → agp-stream-connector.js
registry:*  → agp-registry.js           platform:ready → agp-bootstrap.js
```

`game:*` has two distinct sub-vocabularies — do not conflate them:
- **Engine-level** (`game:loaded/started/ended/destroyed`) — platform → game, forwarded over the Bridge.
- **Round-level** (`game:roundStarted/roundEnded/reset`) — game → platform, self-reported by whatever the game actually does. This is what Round Manager listens to.

Duplicate-hook protection: `AGP._shouldNotifyRoundHook(gameId, hookName)` — one shared, state-based guard used by both `agp-game-engine.js` and `agp-game-api.js` to guarantee `onRoundStart`/`onRoundEnd` fire exactly once per real event, regardless of which path reports it first.

---

## 4. Lifecycle (canonical path)

```
Create Room (AGP.roomsManager.createRoom)
  → creates Session (Idle)
Open Registration (AGP.lobby.open / AGP.gameManager.openRegistration)
  → Session: RegistrationOpen · Lobby: registration_open · Round: registration_open
Players join (AGP.lobby.requestJoin, or AGP.playerSource via Keyword/Queue)
Close Registration
  → Session: RegistrationClosed · Round: ready
Round starts (game reports game:roundStarted, or emitted directly)
  → Session: RoundRunning · Round: in_progress · onRoundStart fires once
Round ends (game:roundEnded)
  → Session: RoundFinished · Round: round_ended · onRoundEnd fires once
Reset (game:reset)
  → Room closed, Session: SessionEnded, Round: idle, players cleared
Create Room again → new Session, cycle repeats
```

Round Manager can also jump straight `Idle → in_progress` (games that skip
Lobby entirely, e.g. Roulette). `ensureSessionReadyForRound()` walks Session
through whatever intermediate states are legally required — same public
Session methods, no shortcuts, no new logic path.

---

## 5. Extension Rules for Future Games

1. One adapter file: `games/<id>/agp-<id>.js`. Register via `AGP.gameManager.registerGame({ id, name, url, category, onLoad, onRoundStart, onRoundEnd, onDestroy })` after `platform:ready`.
2. If externally hosted: connect via `AGP.gameBridge.connect({ id, playLinkEl, incomingSource, reportedEvents })`. Never hand-roll `postMessage`/`window.open` again.
3. Report round lifecycle via the generic events (`game:roundStarted`/`game:roundEnded`/`game:reset`) — never invent game-specific events that Round Manager would need to know about.
4. Needs a `.game-card[data-agp-game-id]` (with `.game-title`/`.btn-play`) on whatever page hosts it, for `agp-registry.js` discovery and Bridge binding.
5. Game-specific dashboard controls (like Roulette's team settings) live in the dashboard layer, built only on existing generic Managers (`storageManager`, `keywordManager`, `timerManager`, `events`) — never a new Manager, never a Core edit.
6. No engine-level auto-actions may be added to Core for a specific game (e.g. no "if roulette, do X" inside `agp-game-engine.js`).

---

## 6. Rules for TikTok Integration (status: implemented — see §7)

These rules were followed when building the real integration; kept here as the binding contract for any future platform (YouTube/Twitch) built the same way.

1. Real connection logic goes in `agp-services.js`'s `TikTokService` (`connectToLiveStream`/`onGift`/`onComment`) — implement the stub, don't replace the contract.
2. `AGP.streamConnector` stays the only status/lifecycle owner (`connect`/`disconnect`/`getStatus`/`reportStatus`) — TikTokService does the actual I/O; StreamConnector tracks state and emits `stream:*`.
3. Incoming TikTok events (comments, gifts) must be normalized and pushed through **`AGP.playerSource.submitPlayer('tiktok', playerData)`** (via `AGP.keywordManager`) or **`AGP.queueManager.enqueue('tiktok', playerData)`** — never call `AGP.player.addPlayer` directly.
4. No networking code belongs in Round Manager, Session, Lobby, Game API/Engine, or any existing Manager — they stay transport-agnostic by design. (Confirmed: none was added — all networking lives in `backend/` and `adapters/tiktok/`.)
5. Real-time sync is a new module consuming `AGP.events`, not a rewrite of any existing Manager. (Confirmed: `adapters/tiktok/agp-tiktok-adapter.js` is exactly that — it only touches `AGP.services.TikTokService`, `AGP.streamConnector`, `AGP.keywordManager`, `AGP.queueManager`, `AGP.events`.)

---

## 7. Live Backend & Adapter Integration (Implemented)

The rules in §6 are now real, working code, not just a plan:

```
backend/                          — standalone Node process, zero AGP.* knowledge
  platforms/connector-router.js    — the ONE file that decides which connector
                                      handles a platform (currently 'tiktok' → real)
  platforms/tiktok/                — real connector, built on tiktok-live-connector
  platforms/mock/                  — mock connector, kept for local testing
  websocket/                       — hand-rolled WebSocket server (Node built-ins only)
  protocol/                        — the 7-message-type protocol (connect/disconnect/
                                      status/comment/gift/follow/error)

adapters/tiktok/agp-tiktok-adapter.js   — browser-side WebSocket client, the only
                                            frontend file that talks to backend/.
                                            Implements AGP.services.TikTokService by
                                            mutating it in place (never replaces it).
adapters/mock/agp-mock-live-adapter.js  — same contract, fully local simulation,
                                            no backend needed. Kept for testing;
                                            not loaded by the production Dashboard.
```

Full design: `docs/BACKEND_ARCHITECTURE.md`.

**Reconnect behavior (two independent layers, don't confuse them):**
- Backend ↔ TikTok: `tiktok-connector.js` retries with backoff, capped at 5 attempts, only on an *unexpected* drop after a successful connection — never on a failed initial connect (bad username), to avoid hammering TikTok's unofficial endpoint on a config error.
- Browser ↔ Backend: `agp-tiktok-adapter.js` retries with backoff, capped delay (not capped attempts — our own backend is expected to come back), stops immediately once the streamer clicks Disconnect.

**Known, real limitation:** no live successful TikTok session has been verified from Anthropic's sandbox (no network path to a real live streamer to test against). Everything up to and including a real connection attempt, its normalized event shapes, and graceful failure/reconnect handling has been verified against the actually-installed `tiktok-live-connector` package.

---

## Known, Accepted Debt (do not "fix" silently — see review doc)
No generic "update player" method (team/attrs must be supplied at join time). No enforced team capacity. No persistent last-winner storage. `dashboard/` is deprecated, kept for reference only.

## Deferred (documented, not built)
- **Generic per-game settings framework**: most current games (Roulette included) are individual, not team-based. Team-specific dashboard UI/components (`teamSettings`, `playersByTeam` in `dashboard-core.js`) are fully built but disabled by default (`TEAM_FEATURES_ENABLED = false`) and hidden (not removed) in `dashboard-core/index.html`, ready for any future team-based game. A generic "Game Settings" placeholder now occupies that space instead. Building a real per-game settings framework (each game contributing its own settings schema, generically rendered) is future work — not started.
- **`backend/utils/rate-limiter.js`** is a deliberate placeholder — interface defined (`createRateLimiter(options) -> { shouldAllow(key) }`), not wired into `ws-server.js` yet. Intended for coalescing/throttling inbound message bursts once real TikTok traffic volume is observed. Not dead code — reserved for when it's actually needed.
