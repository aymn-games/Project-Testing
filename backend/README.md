# AGP Backend

> **Status: Phase 4 — skeleton only.** No TikTok connection, no
> WebSocket protocol, no external libraries. See
> [`docs/BACKEND_ARCHITECTURE.md`](../docs/BACKEND_ARCHITECTURE.md) for
> the full design this skeleton follows exactly.

## What this is

A standalone Node.js process, separate from the AGP frontend project
(`js/`, `dashboard-core/`, `games/`, `adapters/`). It has no knowledge of
`AGP.*` — its only future contract with the frontend is the WebSocket
message protocol documented in the architecture doc.

## Run it (skeleton only)

```
cd backend
npm start
```

Starts a plain HTTP server on the configured port (`config.js`,
default `8787`) with a health-check response at `/`. No WebSocket
upgrade handling and no TikTok connection happen yet — both are
intentionally unimplemented placeholders.

## Folder structure

```
backend/
  server.js                        — entry point, HTTP server + wiring
  config.js                        — port, allowed origins, limits
  package.json                     — no dependencies

  websocket/
    ws-server.js                    — WebSocket attach point (stub)
    connection-registry.js          — in-memory connection bookkeeping

  protocol/
    message-types.js                — the 7 message type constants
    message-schema.js               — envelope structure validation
    message-builder.js              — envelope construction helpers

  platforms/
    tiktok/
      tiktok-connector.js            — TikTok connection (stub)

  utils/
    logger.js                        — debug-gated logging
    rate-limiter.js                  — rate limiting (stub)
```

## What's real right now vs. stubbed

- **Real (working, but pure/no networking):** config loading, logger,
  the 7 message-type constants, envelope builders, envelope structural
  validation, the in-memory connection registry data structure.
- **Stubbed (logs "not implemented yet", does nothing else):**
  `attachWebSocketServer()`, everything in `tiktok-connector.js`,
  `rate-limiter.js`'s actual limiting decision.

## Does not touch

`js/`, `dashboard-core/`, `games/`, `adapters/mock/` — nothing in this
folder modifies AGP Core or the Dashboard. Nothing here is loaded by the
browser; it's a separate process reached later, only once a real
`adapters/tiktok/agp-tiktok-adapter.js` exists on the frontend side.
