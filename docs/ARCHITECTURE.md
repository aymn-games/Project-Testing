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
