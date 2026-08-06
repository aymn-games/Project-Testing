# AGP Backend

> **Status: in production.** WebSocket protocol, the real TikTok
> connector, and the Auth/Admin HTTP API are all implemented and wired
> up. See [`docs/BACKEND_ARCHITECTURE.md`](../docs/BACKEND_ARCHITECTURE.md)
> for the full design (§1–§9: WebSocket/TikTok, §10: Auth/Admin API) and
> [`docs/CHANGELOG.md`](../docs/CHANGELOG.md) for how each part landed.
>
> (This file used to describe an early "skeleton only" phase — that's
> long superseded; kept accurate here instead of left stale.)

## What this is

A standalone Node.js process, separate from the AGP frontend project
(`js/`, `dashboard-core/`, `games/`, `adapters/`). It has zero knowledge
of `AGP.*` — its contract with the frontend is entirely over the network:
the WebSocket message protocol (§3–§4 of the architecture doc) for the
live TikTok data, and a plain JSON HTTP API under `/api/` (§10) for
accounts/admin.

## Run it

```
cd backend
npm install   # better-sqlite3, google-auth-library, tiktok-live-connector
npm start
```

Starts one HTTP server on the configured port (`config.js`, default
`8787`) that handles three things:
- `GET /` — health check (service name, WS status, active TikTok connector).
- `GET|POST /api/*` — Auth/Admin API, see §10 in the architecture doc.
- WebSocket upgrade on the same port — the TikTok live data bridge.

A SQLite file (`agp-data.sqlite`, gitignored) is created next to this
folder on first run and holds users/sessions/broadcasts permanently.

### Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `8787` | HTTP + WebSocket port |
| `GOOGLE_CLIENT_ID` | a placeholder dev value in `config.js` | Google Sign-In — set your real one from Google Cloud Console |
| `CORS_ORIGINS` | `*` (safe — see §10, no cookies involved) | comma-separated allow-list for the Auth/Admin API once the frontend's production origin is known |
| `NODE_ENV` | unset (debug logging on) | set to `production` on Render to quiet debug logs |

## Folder structure

```
backend/
  server.js                        — entry point, HTTP server + wiring
  config.js                        — port, CORS/WS origins, Google client id, limits
  package.json

  http/
    response.js                     — sendJson / applyCors
    body-parser.js                  — readJsonBody (size-capped, no library)
    auth-router.js                  — /api/auth/* + /api/admin/* routes

  auth/
    auth-service.js                 — signup/login/Google/TikTok verification/admin logic
    password.js                     — scrypt hashing (Node built-in crypto only)

  db/
    database.js                     — SQLite (better-sqlite3), users/sessions/broadcasts

  websocket/
    ws-server.js                    — real WS handshake + framing (no library)
    connection-registry.js          — per-connection bookkeeping

  protocol/
    message-types.js / message-schema.js / message-builder.js

  platforms/
    connector-router.js              — the one TikTok mock↔real swap point
    tiktok/tiktok-connector.js       — real connector (tiktok-live-connector)
    mock/mock-connector.js           — local-simulation connector, kept for testing

  utils/
    logger.js                        — debug-gated logging
    rate-limiter.js                  — interface defined, not wired in yet (deliberate placeholder)
```

## Does not touch

`js/`, `dashboard-core/js/dashboard-core.js`, `games/`, `adapters/mock/`
— nothing in this folder modifies AGP Core or the Dashboard's own logic.
The only frontend files that talk to this backend are
`adapters/tiktok/agp-tiktok-adapter.js` (WebSocket) and
`auth/auth-client.js` + the pages/scripts listed in
`docs/CHANGELOG.md` [0.29.0] (HTTP API).
