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
│   ├── samples/manifest.json/+server.js   lists static/samples/ by category, for percsampler
│   ├── patterns/manifest.json/+server.js  lists static/patterns/ by pack, for patternvariator
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
└── static/{samples,sessions,patterns}/   drums + foley at /samples; session JSON;
                                          hand-written pattern packs at /patterns
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

Under `import.meta.env.DEV` only, it also assigns `window.nllc = engine` — a
debug handle for reading engine state that has no console text form (a param's
modulated value, a node's connections). Stripped from production builds.

It also sets `engine.onMessage = (text, kind) => codeEditor?.appendOutput(text,
kind)` — the reverse direction, for output no command is waiting on. Two kinds
arrive: `"deferred"` (an `at=beat`/`at=cycle` command reporting back after it
fires, rendered with a leading `·`) and `"readme"` (a loaded session's
introduction, rendered as an accent-ruled block). Unset, the engine falls back
to `console.log`, so wiring this is what makes a deferred failure visible in
the app.

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
  there) but a production build bakes the list at build/prerender time. The
  sample manifest route has the same property.
- `/samples/manifest.json` is the app's side of a contract the *engine*
  defines: `percsampler` picks its kit at random and `granular` picks one
  source recording at random, and a browser can't list a directory over HTTP,
  so the host must publish `{ <folder>: [paths relative to /samples/] }`. The
  four drum categories (`kicks`, `snares`, `hats`, `percs`) are always present
  because percsampler's slot arithmetic needs them; **every other folder is
  published too** (`foley/` ships, holding field recordings for `granular`),
  which makes adding `static/samples/<folder>/` the whole workflow — no code
  change. The engine reads it through `ribbit/src/samples.js`, shared by both
  synths.
- `/patterns/manifest.json` is the app's side of a second engine contract, the
  same shape as the samples one: `patternvariator` loads a hand-written pattern
  by pack and name, and a browser can't list a directory, so the host publishes
  `{ <pack>: ["<pack>/<name>.json", ...] }`. The remaining difference is that
  *nothing* here is fixed — every subdirectory is a pack, where the samples
  route guarantees the four drum categories — so adding
  `static/patterns/<pack>/<name>.json` and refreshing is the whole workflow, no
  code change. Four packs ship: `hiphopdrums` (drum lanes), `darkchords`,
  `ambientchords` and `melodies` (scale degrees). `ambientchords` is written
  for pads — sparse, wide voicings whose `duration` outlasts their
  `step_beats`, so chords overlap. The format is documented in
  `ribbit/docs/llm/overview.md`; the files are meant to be hand-edited.
- Session files carry an optional top-level `readme` (an array of lines) that
  the engine prints on load via `onMessage`. All twelve shipped sessions
  (`demo`, `percs-demo`, `euclid-demo`, `euclid-ghosts`, `pattern-chords`,
  `pattern-drums`, `goodenizer-demo`, `granular-pad`, `ambient-tape`,
  `chorale-drift`, `chaos-states`, `cz-tapes`) have one; a new one should too.
  `demo` is the starter and combines `euclid-ghosts` with `ambient-tape`;
  `chorale-drift` is three `chorale` generators and no percussion;
  `chaos-states` is `chaossynth` sequenced as timbres rather than pitches;
  `cz-tapes` is five `czsynth` tracks and the only session built on presets.

  **An object may not be named after a reserved command.** `chaos-states`'
  main track is `riff` and not `states` because `/states` is a command: the
  engine renames the colliding object on creation, and the file's own sends
  and patches then point at a name nothing has, so loading throws part-way
  through. See `RESERVED_NAMES` in `ribbit/src/ribbit.js`.
- Every shipped session runs a `goodenizer` named `glue` on master, tuned per
  session (see each file's `master.processors`). `goodenizer-demo` is the one
  that exists to tour it and the four processors it composes.
- Session JSON is stored width-budget-compacted (short objects/arrays inlined,
  `readme` one line per element) rather than one value per line. Nothing reads
  the formatting, but the files are meant to be legible when hand-edited.
- `CodeEditor` focuses its input in `onMount`, so the page is type-ready on
  load.
- `SessionPage` must call `engine.dispose()` when it unmounts — an
  `AudioContext` and the clock's `setTimeout` loop are not reachable by GC, so
  without it a client-side navigation leaves the session playing.
