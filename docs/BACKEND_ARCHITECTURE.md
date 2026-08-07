# AGP Backend Architecture (Design Only — No Implementation)

> This document designs the `backend/` process required for a real Live
> Adapter (TikTok first, generic enough for YouTube/Twitch later). No
> TikTok connection code, no external libraries, no existing file
> modified. Nothing in this document is implemented yet.

---

## 1. Why a Backend Exists at All

Confirmed in the earlier TikTok Adapter Architecture: the browser cannot
open a real TikTok live connection itself (no public client-side API,
undocumented internal protocol). A Node.js process is mandatory. This
document designs *that* process — not the TikTok connection logic inside
it (explicitly deferred).

The backend's only job: hold the real platform connection and credentials,
normalize whatever it receives, and forward it to the browser over one
WebSocket connection using a fixed message protocol. It has **zero AGP
knowledge** — it doesn't know what `AGP.playerSource` or
`AGP.keywordManager` are. That translation happens entirely in the
browser-side Real Adapter (`adapters/tiktok/agp-tiktok-adapter.js`,
mirroring `adapters/mock/agp-mock-live-adapter.js`).

```
TikTok (or any platform)
     │
     ▼
backend/   (Node.js process — this document)
     │  WebSocket, JSON messages, protocol defined below
     ▼
adapters/tiktok/agp-tiktok-adapter.js   (browser, future — not built yet)
     │  same 4 seams the Mock already uses
     ▼
AGP Core (unchanged, frozen)
```

---

## 2. `backend/` Folder Design

```
backend/
  server.js                    — entry point: starts the HTTP+WS server
  config.js                    — port, allowed origins, limits (no secrets hardcoded)
  package.json                 — no dependencies listed (see §7)
  README.md                    — mirrors this document's scope, points here

  websocket/
    ws-server.js                — raw WebSocket server (handshake + framing)
    connection-registry.js      — tracks connected browser clients, one per active dashboard session

  protocol/
    message-types.js            — the 7 message type constants (§4)
    message-schema.js           — shape/validation rules per type (§4)
    message-builder.js          — helpers to construct outgoing messages consistently

  platforms/
    tiktok/
      tiktok-connector.js        — PLACEHOLDER ONLY. Throws "not implemented" the
                                    same way agp-services.js's original stubs did.
                                    Real upstream connection logic is future work,
                                    explicitly out of scope for this phase.

  utils/
    rate-limiter.js              — coalesce/debounce logic (§8), no platform knowledge
    logger.js                    — equivalent of AGP.log, respects a debug flag
                                    the same way agp-core.js's fix does (§9)
```

Nothing under `backend/` touches `js/`, `dashboard-core/`, `games/`, or
`adapters/mock/`. It is a fully separate process/deployable, matching the
Node backend already used elsewhere in this project's history.

---

## 3. WebSocket Protocol — Envelope

One connection per browser tab, one shared envelope shape in both
directions (mirrors the existing `postMessage` envelope already used
between the platform and the Roulette game — same house style, not a new
convention):

```json
{
  "type": "connect | disconnect | status | comment | gift | follow | error",
  "payload": { "...": "..." },
  "timestamp": 1730000000000
}
```

- `type` — one of exactly 7 values, no others.
- `payload` — shape depends on `type`, defined in §4.
- `timestamp` — set by whichever side sends the message.

---

## 4. Message Shapes

### Browser → Backend (control only, 2 types)

**`connect`**
```json
{ "type": "connect", "payload": { "platform": "tiktok", "username": "streamer_handle" } }
```

**`disconnect`**
```json
{ "type": "disconnect", "payload": { "platform": "tiktok" } }
```

### Backend → Browser (data + lifecycle, 5 types)

**`status`** — lifecycle only, maps 1:1 onto the existing, unchanged `AGP.streamConnector.STATUS` values.
```json
{ "type": "status", "payload": { "platform": "tiktok", "status": "connecting | connected | disconnected | error", "message": "optional human-readable detail" } }
```

**`comment`**
```json
{ "type": "comment", "payload": { "platform": "tiktok", "id": "tiktok:<platformUserId>", "name": "displayName", "text": "comment text" } }
```

**`gift`**
```json
{ "type": "gift", "payload": { "platform": "tiktok", "id": "tiktok:<platformUserId>", "name": "displayName", "giftName": "Lion", "giftValue": 500, "repeatCount": 1 } }
```

**`follow`**
```json
{ "type": "follow", "payload": { "platform": "tiktok", "id": "tiktok:<platformUserId>", "name": "displayName" } }
```

**`error`**
```json
{ "type": "error", "payload": { "platform": "tiktok", "code": "invalid_username | upstream_disconnected | rate_limited | unknown", "message": "human-readable" } }
```

These `comment`/`gift`/`follow` payload fields are deliberately **identical in shape** to what `adapters/mock/agp-mock-live-adapter.js` already produces internally (`id`, `name`, `giftName`, `giftValue`, `repeatCount`). This is the load-bearing design decision — see §6.

---

## 5. Full Event Flow

```
1. Streamer clicks Connect (existing Dashboard button, unchanged)
     → AGP.streamConnector.connect('tiktok', { username })
     → AGP.services.TikTokService.connectToLiveStream(options)   [Real Adapter's implementation]

2. Real Adapter opens (or reuses) one WebSocket to backend/
     → sends { type: "connect", payload: { platform: "tiktok", username } }

3. Backend receives it
     → immediately replies { type: "status", payload: { status: "connecting" } }
     → attempts the real upstream connection (future work, not designed here)
     → replies { type: "status", payload: { status: "connected" } } or { status: "error", ... }

4. Real Adapter receives every "status" message
     → calls AGP.streamConnector.reportStatus('tiktok', status)   [exact same call the Mock makes]

5. Backend receives real comment/gift/follow events from upstream (future work)
     → normalizes to the shapes in §4
     → sends { type: "comment" | "gift" | "follow", payload: {...} }

6. Real Adapter receives each, routes it exactly like the Mock does today:
     comment → AGP.keywordManager.checkKeyword(text, playerData)
               or AGP.queueManager.enqueue('tiktok', playerData)
     gift    → AGP.events.emit('stream:giftReceived', payload)
     follow  → AGP.events.emit('stream:followReceived', payload)

7. Streamer clicks Disconnect (existing button, unchanged)
     → AGP.streamConnector.disconnect('tiktok')
     → Real Adapter sends { type: "disconnect", payload: { platform: "tiktok" } }
     → Backend tears down the upstream connection
     → sends final { type: "status", payload: { status: "disconnected" } }
```

Nothing past step 1 or before step 7 is visible to AGP Core, Round
Manager, Session, or the Dashboard — identical to how the Mock behaves
today.

---

## 6. Mock → Real Swap — What Was Actually Built (Production, Verified)

The original design (below, kept for history) proposed swapping the
**frontend** adapter script tag. What actually got built during
implementation turned out cleaner: once `adapters/tiktok/agp-tiktok-adapter.js`
existed as a pure WebSocket *protocol* bridge (it doesn't know or care
whether the backend is simulating or real), the swap point moved entirely
to the **backend**, in `backend/platforms/connector-router.js`:

```js
function createConnectorForPlatform(platform) {
    if (platform === 'tiktok') {
        return tiktokConnector.createTikTokConnector(); // ← the one line
    }
    return null;
}
```

This is now the **actual, single, production swap point** — confirmed by
building both connectors to the identical shape (`{connect, disconnect,
isConnected}`) and verifying `ws-server.js` never imports either connector
directly, only `connector-router.js`.

| | Mock (`platforms/mock/`) | Real (`platforms/tiktok/`) |
|---|---|---|
| Implements | `{connect, disconnect, isConnected}` | same shape |
| `connect()` | starts a local `setInterval` simulation | opens a real `TikTokLiveConnection` via `tiktok-live-connector` |
| Status reporting | calls `callbacks.onStatus(...)` directly | calls `callbacks.onStatus(...)` on real connect/error/reconnect |
| Comment → player | same normalized `{id, name, text}` shape | same shape |
| Gift/follow | same normalized shape | same shape, including gift-streak collapsing to one final event |
| Reconnect | n/a (simulation doesn't drop) | exponential backoff, capped at 5 attempts, only on unexpected drops |

**Frontend (`adapters/tiktok/agp-tiktok-adapter.js`) never changes between
mock and real** — it only speaks the WebSocket protocol in §3–§4, which is
identical either way. It also now has its own independent reconnect layer
(browser ↔ backend), separate from the backend's TikTok reconnect —
uncapped-attempts, capped-delay backoff, since our own backend (unlike
TikTok) is expected to eventually come back.

`adapters/mock/agp-mock-live-adapter.js` (the original all-local-simulation
frontend mock, predating the backend) still exists and still works —
useful for testing without running `backend/` at all — but is not loaded
by the production Dashboard anymore.

<details>
<summary>Original design (superseded, kept for history)</summary>

The original plan was a frontend script-tag swap:

```html
<script src="../adapters/mock/agp-mock-live-adapter.js"></script>
```
→
```html
<script src="../adapters/tiktok/agp-tiktok-adapter.js"></script>
```

This is **not** what shipped — `dashboard-core/index.html` has loaded
`adapters/tiktok/agp-tiktok-adapter.js` since the WebSocket bridge was
built, regardless of which backend connector is active.
</details>

---

## 7. Server Requirements / No External Libraries

- Node.js only, using built-in modules (`http`, `crypto`, `net`) for the
  HTTP server and the WebSocket handshake/framing — a hand-rolled
  minimal WS server is achievable with zero npm dependencies for the
  *protocol layer* designed in §3–§4.
- **Open, honestly flagged tension**: the actual upstream TikTok
  connection (§2's `tiktok-connector.js` placeholder) is a different
  problem — TikTok's live protocol is undocumented and reverse-engineered
  in practice (as this project's own prior work already noted). A
  no-external-library constraint is realistic for *this* backend's own
  WebSocket-to-browser layer, but is very unlikely to remain realistic
  once the actual TikTok connector is implemented. That decision is
  explicitly deferred to whenever `tiktok-connector.js` moves from
  placeholder to real code — not decided now, not blocking this design.
- One backend process can serve multiple browser tabs/streamers by
  keying connections in `connection-registry.js` — out of scope to
  design further until multi-room/multi-streamer is actually needed
  (matches the "single room" stance already frozen in AGP Core).

---

## 8. Rate Limiting (Backend-Side Design)

- Backend coalesces rapid duplicate events (e.g. gift combo bursts,
  repeated identical comments) into a single outgoing message with an
  incremented `repeatCount`, before ever reaching the WebSocket —
  protects the Dashboard's per-event re-render pattern flagged in the
  final audit.
- A simple token-bucket or fixed-window cap per connection on outgoing
  message rate, independent of platform-specific limits — generic,
  reusable for YouTube/Twitch later.
- The browser-side Real Adapter still only submits at a sane pace into
  `queueManager`/`playerSource` — defense in depth, not reliance on the
  backend alone.

---

## 9. Security Considerations

- No platform token/credential ever sent to the browser — held
  server-side only, for the full connection lifetime.
- Backend validates/sanitizes all inbound text (length, charset) before
  ever constructing a `comment` message.
- WebSocket server only accepts connections from the Dashboard's own
  origin (config-driven allow-list in `config.js`, not hardcoded).
- `connect`/`disconnect` control messages should be tied to the
  streamer's own authenticated session once the platform has any concept
  of accounts — not designed further now since AGP Core has no auth
  concept yet either (out of scope, consistent with "no other
  architecture changes").
- A backend crash or upstream failure must degrade to a `status: error`
  message — it must never silently leave the Dashboard believing it's
  still `connected`.

---

## Status: Implemented & In Production

Everything designed above is built and verified (`backend/`,
`adapters/tiktok/agp-tiktok-adapter.js`, `connector-router.js` pointing at
the real connector). Two issues found in a post-launch review were fixed:

- **Double-connect leak**: `ws-server.js` now disposes any existing
  connector for a connection before creating a new one, so a repeated
  `connect` message can no longer orphan a live TikTok connection running
  in the background.
- **No control-channel reconnect**: `agp-tiktok-adapter.js` now retries
  the browser↔backend WebSocket itself on an unexpected drop (separate
  from, and in addition to, the backend's own TikTok reconnect) —
  exponential backoff with a capped delay, uncapped attempt count (this
  link is expected to recover, unlike TikTok's), and stops immediately on
  manual disconnect.

`backend/utils/rate-limiter.js` remains an intentional, documented
placeholder — not wired into `ws-server.js` yet, reserved for when real
TikTok traffic volume is actually observed.

## 10. Auth & Admin HTTP API (Implemented — connects pre-existing auth-service.js)

`backend/auth/auth-service.js` + `backend/auth/password.js` +
`backend/db/database.js` were built in an earlier phase and were fully
functional (accounts, sessions, Google login, TikTok bio ownership
verification, admin/streamer roles, flexible permissions, broadcast
stats) but had **zero callers** — no HTTP route invoked them, no frontend
page used them. This section documents how they're wired up now.

**New, separate from the WebSocket protocol in §3–§9**: a plain JSON
HTTP API under `/api/`, still zero external dependencies beyond what
`backend/package.json` already listed (`better-sqlite3`,
`google-auth-library`).

```
backend/http/
  response.js      — sendJson(res, status, body), applyCors(req, res, config)
  body-parser.js   — readJsonBody(req) -> Promise, size-capped, no library
  auth-router.js   — route table + handle(req, res), the only file that
                      calls into auth-service.js. Not touched: auth-service.js,
                      password.js, database.js.
```

`server.js` delegates with a single added branch: any request whose URL
starts with `/api/` goes to `authRouter.handle(req, res)`; the root `/`
health check is untouched.

**Routes** (all JSON in/out, `Authorization: Bearer <token>` for anything
marked Auth; Admin also requires `role === 'admin'`, checked via the
user's row returned by `auth-service.validateSession`):

| Method | Path | Auth | Calls |
|---|---|---|---|
| POST | `/api/auth/signup` | — | `signup()` |
| POST | `/api/auth/login` | — | `login()` |
| POST | `/api/auth/google` | — | `loginWithGoogle()` |
| POST | `/api/auth/logout` | ✓ | `logout()` |
| GET | `/api/auth/me` | ✓ | `validateSession()` |
| POST | `/api/auth/tiktok/link` | ✓ | `linkTikTokUsername()` |
| POST | `/api/auth/tiktok/verification-code` | ✓ | `generateVerificationCode()` |
| POST | `/api/auth/tiktok/verify` | ✓ | `verifyTikTokOwnership()` |
| POST | `/api/auth/custom-id` | ✓ | `setCustomId()` (own account only) |
| GET | `/api/admin/users` | ✓ Admin | `listAllUsersWithStats()` |
| POST | `/api/admin/permissions` | ✓ Admin | `setPermission()` |
| POST | `/api/admin/custom-id` | ✓ Admin | `setCustomId()` (any userId) |
| GET | `/api/profile?id=<customId>` | — | `getPublicProfile()` |

**CORS**: sessions travel over `Authorization: Bearer`, never cookies —
so there's no CSRF exposure from reflecting any request Origin, unlike a
cookie-based session would have. `config.corsAllowedOrigins` (env
`CORS_ORIGINS`, comma-separated) defaults to `['*']`; `http/response.js`
reflects the actual request Origin back rather than sending a literal
`*`, which is required for the browser to accept it on credentialed
requests and works identically either way here since there are none.

**Frontend consumers** (all outside `AGP.*`, see `js/agp-*.js` load-order
freeze in `docs/CLAUDE.md` — none of those files were touched):
`auth/auth-client.js` (shared client, `window.AGPAuth`), `login.html`,
`signup.html`, `admin.html`, and `dashboard-core/js/dashboard-auth.js`
(session gate + the "Account" panel inside the existing Stream & Room
tab). Full list and verification notes: `docs/CHANGELOG.md` [0.29.0].

**Known, honestly flagged limitation**: Google OAuth and the TikTok bio
verification fetch (`auth-service.fetchPublicProfileHtml`) are written
correctly per each provider's own documentation but — like the TikTok
live connector before them (§ above) — were never exercised against a
real network from this sandbox. Treat both as needing a real smoke test
on the actual production origin before fully relying on them.

---

## Summary

`backend/` is a standalone Node process; its only contract with AGP is
the WebSocket message protocol in §3–§4, plus (as of §10) a separate
JSON HTTP API under `/api/` for accounts/admin. The real swap point for
the WebSocket protocol turned out to be `connector-router.js`
(backend-side), not a frontend file swap — see §6 for why that's the
cleaner outcome.
