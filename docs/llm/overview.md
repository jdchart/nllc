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
│   ├── +page.svelte                 homepage: links + audio-options panel (localStorage prefs)
│   └── code-editor/
│       ├── +page.svelte             blank session
│       └── demo/+page.svelte        auto-loads /sessions/demo.json
├── src/lib/components/
│   ├── code-editor/SessionPage.svelte   ← THE integration point (see below)
│   ├── code-editor/CodeEditor.svelte    console: input + scrollback + ghost-text + history
│   └── mixer/*.svelte                    live read/write view of the graph
├── src/lib/scripts/ollama.js        Ollama() stub — future NL→command layer
└── static/{samples,sessions}/       drum samples served at /samples; demo session JSON
```

## Engine integration (the one thing to know)

Only `SessionPage.svelte` imports the engine:

```js
import { Ribbit, createCommandRouter, loadSession } from "ribbit";
```

In `onMount` (client-only — `AudioContext` has no SSR), it constructs one
`Ribbit`, builds `{ executeCommand, suggest } = createCommandRouter(engine)` for
the console, optionally `loadSession(engine, fetchedJson)` for the demo
route, and then **polls** `engine.tracks/buses/modulators/patches` per animation
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
