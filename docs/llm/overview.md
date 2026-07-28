# NLLC app — LLM context overview

NLLC (Natural Language Live Coding) is a **SvelteKit interface** for the `ribbit`
Web Audio engine. All audio state and logic live in `ribbit` (imported as an npm
package); this app is the console + mixer UI around it. For the engine's object
model, command vocabulary, and internals, read `ribbit/docs/llm/overview.md` —
this file only covers the app.

## Shape

```
nllc/  (SvelteKit app)
├── src/routes/
│   ├── +page.svelte                 homepage: blank-session link, session dropdown, audio options
│   ├── +page.server.js              lists static/sessions/*.json for that dropdown
│   └── code-editor/
│       ├── +page.svelte             blank session
│       └── [session]/+page.svelte   auto-loads /sessions/<slug>.json
├── src/lib/components/
│   ├── code-editor/SessionPage.svelte   ← THE integration point (see below)
│   ├── code-editor/CodeEditor.svelte    console: input + scrollback + ghost-text + history
│   └── mixer/*.svelte                    live read/write view of the graph
├── src/lib/scripts/
│   ├── ollama.js                    Ollama() stub — future NL→command layer
│   └── drag.js                      beginDrag(): shared pointer-drag selection suppression
└── static/{samples,sessions}/       drum samples served at /samples; session JSON
```

## Engine integration (the one thing to know)

Only `SessionPage.svelte` imports the engine:

```js
import { Ribbit, createCommandRouter, loadSession } from "ribbit";
```

In `onMount` (client-only — `AudioContext` has no SSR), it constructs one
`Ribbit`, builds `{ executeCommand, suggest } = createCommandRouter(engine)` for
the console, optionally `loadSession(engine, fetchedJson)` when given a
`sessionUrl`, and then **polls** `engine.tracks/buses/modulators/patches` per animation
frame, diffing by element identity into Svelte `$state` arrays so the mixer
tracks graph mutations. The engine's arrays are intentionally plain/non-reactive;
this poll-and-diff is the bridge. Every other component gets the engine (or
derived data) via props.

## Dependency

`ribbit` is an npm workspace member (root `package.json` lists `["ribbit",
"nllc"]`), so `nllc/node_modules/ribbit` symlinks to `../ribbit` — engine edits
are live with no reinstall. `nllc/package.json` declares `"ribbit": "*"`.

## Audio options

Homepage writes `localStorage` keys `nllc:audioLatencyHint` /
`nllc:audioOutputDeviceId`; `SessionPage` reads them when constructing the engine
(`latencyHint` must be passed at `AudioContext` creation; the output device
`sinkId` can be applied any time after).

## Known current state

- The natural-language layer (`ollama.js`) is an empty stub; no NL→command wiring
  exists yet. It's the app's raison d'être and the one piece deliberately kept out
  of the engine.
- The engine (`ribbit`) is where new synths/processors/modulators/commands are
  added — not here. See `ribbit/docs/dev/`.
- The session dropdown is filled by a *server* load, so under `vite dev` it
  re-reads `static/sessions/` on every request (drop a file in, refresh, it's
  there) but a production build bakes the list at build/prerender time.
- `SessionPage` must call `engine.dispose()` when it unmounts — an
  `AudioContext` and the clock's `setTimeout` loop are not reachable by GC, so
  without it a client-side navigation leaves the session playing.
